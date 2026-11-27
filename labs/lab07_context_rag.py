"""第 7 章实验：安全清理旧聊天记录 + 真实 RAG 按意思查文档 (lab07_context_rag.py)

直白两步（全程真实调用大模型验证）：
  • Step 1：把一段很长的历史对话安全裁剪（成对保留/成对淘汰 tool_calls 与 tool，绝不留下半截），
            然后直接把裁剪后的 messages 发给真实大模型，验证 100% 正常响应不报 HTTP 400！
  • Step 2：如果配置了 `AGENT_EMBEDDING_MODEL`，直接调用真实 `/embeddings` 接口算相似度召回制度，
            并让真实大模型基于召回的制度作答（若未单独配向量模型，也会给出清晰提示并演示基于制度原文的问答）。

运行方式：
  python lab07_context_rag.py
"""

from __future__ import annotations

import math
import os
from typing import Any

from common import OrderSystem, call_embedding, call_llm, show, step_title


def estimate_tokens(text: str) -> int:
    """简单的中文/英文 Token 粗略估算（生产环境看接口返回的 usage）。"""
    if not text:
        return 0
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    return (len(text) - ascii_chars) + (ascii_chars + 2) // 3


def trim_history_safely(messages: list[dict[str, Any]], max_input_tokens: int) -> list[dict[str, Any]]:
    """安全清理旧聊天记录：置顶 System 规则，把『模型调工具 + 工具回结果』绑成一组同去同留！"""
    pinned_system: list[dict[str, Any]] = []
    groups: list[list[dict[str, Any]]] = []

    i = 0
    while i < len(messages):
        msg = messages[i]
        if msg.get("role") == "system" and not groups:
            pinned_system.append(msg)
            i += 1
        elif msg.get("role") == "assistant" and msg.get("tool_calls"):
            pair = [msg]
            i += 1
            while i < len(messages) and messages[i].get("role") == "tool":
                pair.append(messages[i])
                i += 1
            groups.append(pair)
        else:
            groups.append([msg])
            i += 1

    def group_cost(g: list[dict[str, Any]]) -> int:
        return sum(estimate_tokens(str(m.get("content") or "") + str(m.get("tool_calls") or "")) + 8 for m in g)

    budget = max_input_tokens - group_cost(pinned_system)
    kept_reversed: list[list[dict[str, Any]]] = []
    for g in reversed(groups):
        cost = group_cost(g)
        if cost <= budget:
            kept_reversed.append(g)
            budget -= cost
        else:
            break

    result = list(pinned_system)
    for g in reversed(kept_reversed):
        result.extend(g)
    return result


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """本地计算两个向量的相似度（0~1，越接近 1 意思越像；生产环境直接由 pgvector 等向量库计算）。"""
    denom = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return sum(x * y for x, y in zip(a, b)) / denom


def main() -> None:
    orders = OrderSystem()
    try:
        # =============================================================
        # Step 1：安全清理长历史，并直接发给真实大模型验证不报 400 错误！
        # =============================================================
        step_title(1, "成对安全清理旧聊天记录，并真实发送给大模型验证")
        long_history: list[dict[str, Any]] = [
            {"role": "system", "content": "你是企业订单助手，请简洁准确地用中文回答。"},
            {"role": "user", "content": "你好，请问你们每天几点下班？"},
            {"role": "assistant", "content": "您好，我们的客服工作时间是每天 09:00 到 21:00。"},
            {"role": "user", "content": "帮我查一下旧订单 B200。"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [{"id": "call_old_1", "type": "function", "function": {"name": "query_order", "arguments": '{"order_id":"B200"}'}}],
            },
            {"role": "tool", "tool_call_id": "call_old_1", "content": '{"order_id":"B200","payment":"paid","shipping":"shipped"}'},
            {"role": "assistant", "content": "订单 B200 已付款且已发货。"},
            {"role": "user", "content": "总结一下：如果我们平时写代码删旧消息时把 tool_calls 删了只留 tool 消息会怎样？"},
        ]

        trimmed = trim_history_safely(long_history, max_input_tokens=110)
        print(f"▸ 原始消息 {len(long_history)} 条 → 预算裁剪后保留 {len(trimmed)} 条（旧工具问答对被整组干净移除）")
        show("安全裁剪后的 messages", trimmed)

        resp1 = call_llm(trimmed)
        show("真实大模型正常接收并回答（未报 HTTP 400！）", resp1["choices"][0]["message"].get("content"))

        # =============================================================
        # Step 2：真实 RAG 检索增强生成
        # =============================================================
        question = "已经付钱但还没发货，怎样把钱退回来？"
        policies = orders.list_policies()
        embed_model = os.getenv("AGENT_EMBEDDING_MODEL", "").strip()

        if embed_model:
            step_title(2, f"真实向量检索（模型={embed_model}）+ 大模型据实作答")
            texts = [question] + [f"{title}：{content}" for _, title, content in policies]
            vectors = call_embedding(texts, embed_model)
            q_vec, doc_vecs = vectors[0], vectors[1:]

            ranked = sorted(
                [(cosine_similarity(q_vec, dv), pid, title, content) for dv, (pid, title, content) in zip(doc_vecs, policies)],
                key=lambda x: -x[0],
            )
            for score, pid, title, _ in ranked:
                print(f"  [{pid}] 相似度={score:.4f}  {title}")

            top_doc = f"[{ranked[0][1]}] {ranked[0][2]}：{ranked[0][3]}"
        else:
            step_title(2, "未设置 AGENT_EMBEDDING_MODEL，直接演示把制度原文注入上下文（RAG 后半段）")
            print("  💡 如需测试真实 /embeddings 向量排序，设置 $env:AGENT_EMBEDDING_MODEL='你的向量模型名' 后重跑即可。")
            top_doc = "\n".join(f"[{pid}] {title}：{content}" for pid, title, content in policies)

        rag_resp = call_llm([
            {"role": "system", "content": f"请严格依据以下公司制度原文回答用户问题，并注明制度编号：\n{top_doc}"},
            {"role": "user", "content": question},
        ])
        show("大模型基于检索到的制度原文生成的可靠回答", rag_resp["choices"][0]["message"].get("content"))
    finally:
        orders.close()


if __name__ == "__main__":
    main()
