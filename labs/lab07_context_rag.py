"""第 7 章实验：上下文预算管理、配对安全裁剪与向量语义检索 RAG (lab07_context_rag.py)

随着对话变长、企业文档增多，直接把所有聊天记录和整本制度手册塞进 `messages` 会导致两个严重后果：
  1. 触发长度上限报错，或者注意力分散（“Lost in the Middle”中间迷失效应）导致选错工具；
  2. 如果粗暴删除旧消息时把 `assistant(tool_calls)` 删了却留下孤立的 `role="tool"` 消息，大模型接口会直接报 HTTP 400 协议错误！

本实验分两步带你手写上下文与检索的核心算法：
  • Step 1（配对安全裁剪 `trim_history_safely`）：始终保留 System 指令，按完整交互组（Turn Group）滑动淘汰旧对话，绝不拆散 `tool_calls` 与 `tool`！
  • Step 2（余弦相似度向量检索 RAG）：对比“字面词项检索”为什么搜不到同义词（如问『退钱』搜不到『退款』），再用 Embedding 向量余弦相似度精准召回！

运行方式：
  python lab07_context_rag.py                  # 零配置运行上下文裁剪 + 离线语义向量检索演示
  python lab07_context_rag.py --live-embed     # 调用真实 /embeddings API 计算中文句子向量相似度（需配置 AGENT_EMBEDDING_MODEL）
"""

from __future__ import annotations

import argparse
import math
import os
from typing import Any

from common import OrderSystem, StepLogger, post_json


# =====================================================================
# 第一部分：上下文工程 —— 绝不破坏协议结构的“回合组配对裁剪算法”
# =====================================================================

def estimate_tokens(text: str) -> int:
    """教学级保守估算器：中文约 1 字符 ≈ 1~1.5 Token，英文约 3~4 字符 ≈ 1 Token。
    生产环境可替换为 tiktoken 或服务端返回的 usage 精确计数。
    """
    if not text:
        return 0
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    non_ascii = len(text) - ascii_chars
    return non_ascii + (ascii_chars + 2) // 3


def group_messages_into_units(messages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[list[dict[str, Any]]]]:
    """将扁平的 messages 列表拆分为：(头部固定 system 消息, 原子对话单元列表)。
    关键规则：`assistant(含 tool_calls)` 必须与紧随其后的所有 `role == 'tool'` 消息绑在同一个原子单元里，同生共死！
    """
    pinned_system: list[dict[str, Any]] = []
    units: list[list[dict[str, Any]]] = []

    i = 0
    while i < len(messages):
        msg = messages[i]
        role = msg.get("role")
        if role == "system" and not units:
            pinned_system.append(msg)
            i += 1
        elif role == "assistant" and msg.get("tool_calls"):
            group = [msg]
            i += 1
            while i < len(messages) and messages[i].get("role") == "tool":
                group.append(messages[i])
                i += 1
            units.append(group)
        else:
            units.append([msg])
            i += 1

    return pinned_system, units


def trim_history_safely(messages: list[dict[str, Any]], max_input_tokens: int) -> list[dict[str, Any]]:
    """在预算内从后往前（优先保留最新上下文）挑选完整的原子单元，绝不产生孤儿 tool 消息。"""
    pinned, units = group_messages_into_units(messages)

    def unit_cost(unit: list[dict[str, Any]]) -> int:
        return sum(estimate_tokens(str(m.get("content") or "") + str(m.get("tool_calls") or "")) + 8 for m in unit)

    budget_left = max_input_tokens - unit_cost(pinned)
    if budget_left <= 0:
        raise ValueError("System Prompt 本身已超出输入预算！")

    kept_reversed: list[list[dict[str, Any]]] = []
    for unit in reversed(units):
        cost = unit_cost(unit)
        if cost <= budget_left:
            kept_reversed.append(unit)
            budget_left -= cost
        else:
            # 一旦某个历史单元放不下，更早的历史也一并丢弃（或压缩为摘要），保证时间顺序连贯
            break

    trimmed = list(pinned)
    for unit in reversed(kept_reversed):
        trimmed.extend(unit)
    return trimmed


# =====================================================================
# 第二部分：RAG 语义向量检索 —— 余弦相似度（Cosine Similarity）实现
# =====================================================================

def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """计算两个向量的余弦相似度：cos(θ) = (A · B) / (||A|| * ||B||)，范围 [-1, 1]，越接近 1 语义越相近。"""
    if len(vec_a) != len(vec_b) or not vec_a:
        raise ValueError("向量维度不一致或为空")
    norm_a = math.sqrt(sum(x * x for x in vec_a))
    norm_b = math.sqrt(sum(y * y for y in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        raise ValueError("零向量无法计算余弦相似度")
    dot_product = sum(x * y for x, y in zip(vec_a, vec_b))
    return dot_product / (norm_a * norm_b)


# 离线教学演示用的 4 维概念语义特征向量（维度含义示意：[资金/退费, 物流/配送, 研发/上线, 制度规范]）
MOCK_EMBEDDINGS: dict[str, list[float]] = {
    "已经付钱但还没发货，怎样把钱退回来？": [0.94, 0.28, 0.02, 0.35],
    "快递发出来多久能送到？": [0.05, 0.96, 0.01, 0.30],
    "P1": [0.91, 0.24, 0.04, 0.42],  # 退款管理制度
    "P2": [0.06, 0.95, 0.03, 0.38],  # 物流时效制度
    "P3": [0.03, 0.04, 0.96, 0.40],  # 生产发布制度
}


def run_context_trimming_demo() -> None:
    StepLogger.step(1, "上下文预算与『配对安全裁剪』演示")
    long_conversation: list[dict[str, Any]] = [
        {"role": "system", "content": "你是企业订单助手，请严格依据工具结果回答。"},
        {"role": "user", "content": "第一轮闲聊：你好，请问你们工作时间是几点？"},
        {"role": "assistant", "content": "您好，我们的在线服务时间为每日 09:00 至 21:00。"},
        {"role": "user", "content": "帮我查一下旧订单 B200。"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "call_old_b200", "type": "function", "function": {"name": "query_order", "arguments": '{"order_id":"B200"}'}}],
        },
        {"role": "tool", "tool_call_id": "call_old_b200", "content": '{"order_id":"B200","payment_status":"paid","shipping_status":"shipped"}'},
        {"role": "assistant", "content": "订单 B200 已付款且已发货。"},
        {"role": "user", "content": "那我刚买的 A100 现在能退钱吗？"},
    ]
    trimmed = trim_history_safely(long_conversation, max_input_tokens=95)
    print(f"▸ 裁剪前消息总数：{len(long_conversation)} 条  →  预算 95 Tokens 裁剪后保留：{len(trimmed)} 条")
    StepLogger.json_box("安全裁剪后的 messages（System 置顶保留，旧工具调用对被整体淘汰，无孤儿 tool 消息）", trimmed)


def run_rag_demo(orders: OrderSystem, question: str, live_embed: bool) -> list[tuple[float, str, str]]:
    StepLogger.step(2, f"向量语义检索（RAG）：查询问题『{question}』")
    policies = orders.list_policies()

    if live_embed:
        api_key = os.environ["AGENT_API_KEY"]
        base_url = os.getenv("AGENT_BASE_URL", "https://api.openai.com/v1")
        embed_model = os.environ["AGENT_EMBEDDING_MODEL"]
        texts = [question] + [f"{title}：{content}" for _, title, content in policies]
        resp = post_json(base_url, "/embeddings", api_key, "chat", {"model": embed_model, "input": texts})
        ordered = sorted(resp["data"], key=lambda item: item["index"])
        q_vec = ordered[0]["embedding"]
        doc_vecs = [item["embedding"] for item in ordered[1:]]
    else:
        q_vec = MOCK_EMBEDDINGS.get(question, [0.85, 0.30, 0.05, 0.35])
        doc_vecs = [MOCK_EMBEDDINGS[doc_id] for doc_id, _, _ in policies]

    scored = [
        (cosine_similarity(q_vec, d_vec), doc_id, f"{title}：{content}")
        for d_vec, (doc_id, title, content) in zip(doc_vecs, policies)
    ]
    scored.sort(key=lambda item: -item[0])

    print("▸ 制度知识库语义相似度排序结果：")
    for rank, (score, doc_id, text) in enumerate(scored, start=1):
        marker = " ★ Top-1 命中召回" if rank == 1 else ""
        print(f"  #{rank} [{doc_id}] 相似度={score:.4f}{marker}\n     {text}")

    StepLogger.note(
        "注意用户提问里写的是『把钱退回来』，并没有出现『退款管理制度』这几个字，"
        "传统关键词精确匹配很容易漏召回，而 Embedding 向量检索能基于语义相关性精准命中 P1！"
    )
    return scored


def main() -> None:
    parser = argparse.ArgumentParser(description="第 7 章分步实验：上下文安全裁剪与向量语义检索")
    parser.add_argument("--live-embed", action="store_true", help="调用真实 /embeddings 接口计算向量（需设置 AGENT_EMBEDDING_MODEL）")
    parser.add_argument("--question", default="已经付钱但还没发货，怎样把钱退回来？")
    args = parser.parse_args()

    mode = "真实 /embeddings 接口" if args.live_embed else "离线语义向量演示"
    StepLogger.banner(f"Lab 07 · 上下文工程与 RAG 向量检索 [{mode}]")
    orders = OrderSystem()
    try:
        run_context_trimming_demo()
        run_rag_demo(orders, args.question, live_embed=args.live_embed)
    finally:
        orders.close()


if __name__ == "__main__":
    main()
