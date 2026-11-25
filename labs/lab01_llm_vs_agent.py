"""第 1 章实验：从普通 LLM API 调用到最小 Agent 闭环 (lab01_llm_vs_agent.py)

本脚本专门面向“已经用过大模型 API 聊天/写代码，但第一次接触 Agent”的开发者。
我们将分 3 个清晰的步骤对比：
  • Step 1（纯大模型调用）：只发一句话给 LLM，看它为什么查不出订单状态。
  • Step 2（传统业务代码）：直接查 SQLite 数据库，准确但听不懂自然语言追问。
  • Step 3（最小 Agent 三角色协作）：Model 提议动作 → Runtime 拦截并调业务函数 → 结果回传生成最终回答。

运行方式（默认离线演示，无需任何 API Key）：
  python lab01_llm_vs_agent.py
  python lab01_llm_vs_agent.py --live   # 使用已配置的真实大模型运行对比
"""

from __future__ import annotations

import argparse
import json
from typing import Any, Callable

from common import APIConfig, OrderSystem, StepLogger, post_json


# =====================================================================
# 第一部分：对比“纯 LLM API 调用”与“传统业务查询”
# =====================================================================

def step1_pure_llm_call(question: str, ask_llm: Callable[[list[dict[str, Any]]], str]) -> str:
    """以前我们调大模型 API 的写法：只把用户问题塞进 messages，拿一段文本回来。"""
    StepLogger.step(1, "普通 LLM API 调用（只有大脑，没有手脚）")
    messages = [
        {"role": "system", "content": "你是客服助手。如果不知道实时数据请如实说明，严禁猜测。"},
        {"role": "user", "content": question},
    ]
    StepLogger.json_box("发送给大模型的 messages", messages)
    reply = ask_llm(messages)
    print(f"▸ 大模型直接回复：\n  {reply}")
    StepLogger.note(
        "大模型运行在云端推理集群上，它根本连不上你公司的订单数据库。"
        "不给它工具，它要么诚实说查不到，要么产生幻觉乱编一个状态。"
    )
    return reply


def step2_traditional_service(orders: OrderSystem, order_id: str) -> dict[str, Any]:
    """以前我们写后端接口的写法：输入确定性的 order_id，查数据库返回 JSON。"""
    StepLogger.step(2, "传统确定性业务函数（有真实数据，但不会理解自然语言）")
    result = orders.query_order(order_id)
    StepLogger.json_box(f"调用 orders.query_order('{order_id}') 的真实数据库返回", result)
    StepLogger.note(
        "业务函数 100% 准确、可控，但它只认识结构化参数 order_id='A100'，"
        "不能直接处理用户五花八门的自然语言提问（比如『我昨天买的 A100 能退钱吗？』）。"
    )
    return result


# =====================================================================
# 第二部分：把两者结合起来 —— 最小 Agent 的三个角色
# =====================================================================

def step3_minimal_agent(
    question: str,
    orders: OrderSystem,
    decide_or_answer: Callable[[list[dict[str, Any]]], dict[str, Any]],
) -> str:
    """最小 Agent 闭环演示：
    角色 1 - Model（大模型）：阅读上下文，提议下一步动作（或给出最终回答）。
    角色 2 - Runtime（你的控制代码）：检查动作是否合法、调用工具、把结果塞回消息列表。
    角色 3 - Tool（业务函数）：真正访问数据库并返回客观事实。
    """
    StepLogger.step(3, "最小 Agent 闭环（Model 提议 + Runtime 调度 + Tool 执行）")

    # 1. Runtime 准备初始对话上下文
    messages: list[dict[str, Any]] = [{"role": "user", "content": question}]

    # 2. 第一次询问 Model：面对这个问题，你建议做什么？
    first_output = decide_or_answer(messages)
    StepLogger.json_box("第 1 次询问模型，模型返回的决策建议", first_output)

    # 3. Runtime 检查模型是不是申请调用工具（注意：此时数据库还没被查询！）
    if first_output.get("action") == "query_order":
        order_id = first_output["order_id"]
        print(f"▸ Runtime 拦截并核验：允许执行只读工具 query_order，参数 order_id={order_id!r}")

        # 4. Tool 真正查询数据库（执行权始终在你的 Python 代码手里！）
        db_fact = orders.query_order(order_id)
        StepLogger.json_box("Tool 实际查询 SQLite 得到的客观数据", db_fact)

        # 5. Runtime 把“刚才的调用记录”和“真实查询结果”追加进上下文，第 2 次发给模型
        messages.append({"role": "assistant", "content": json.dumps(first_output, ensure_ascii=False)})
        messages.append({"role": "tool", "name": "query_order", "content": json.dumps(db_fact, ensure_ascii=False)})

        second_output = decide_or_answer(messages)
        final_answer = second_output["final_answer"]
        print(f"▸ 第 2 次询问模型后，生成的最终回答：\n  {final_answer}")
        StepLogger.note(
            "看清区别了吗？普通 LLM 调用是『一问一答』；"
            "Agent 则是通过你的 Runtime 代码，把『语言理解 → 外部工具执行 → 基于事实作答』串成了闭环！"
        )
        return final_answer

    return str(first_output.get("final_answer", ""))


# =====================================================================
# 第三部分：离线模拟模型与真实 API 切换支持
# =====================================================================

def mock_pure_llm(_messages: list[dict[str, Any]]) -> str:
    return "抱歉，我无法直接访问贵公司的实时订单系统，因此无法确认订单 A100 是否已发货。"


def mock_agent_model(messages: list[dict[str, Any]]) -> dict[str, Any]:
    """教学模拟模型：按真实模型的两阶段行为返回结构化结果，便于离线看清数据流。"""
    last = messages[-1]
    if last["role"] == "user":
        return {"action": "query_order", "order_id": "A100", "reason": "用户询问订单 A100 的发货进度"}
    if last["role"] == "tool":
        fact = json.loads(last["content"])
        return {
            "final_answer": (
                f"为您查到订单 {fact['order_id']}（客户：{fact['customer']}，金额：{fact['amount_yuan']} 元）："
                f"当前付款状态为『{fact['payment_status']}（已付款）』，"
                f"发货状态为『{fact['shipping_status']}（待发货）』，目前尚未发出。"
            )
        }
    return {"final_answer": "无法处理该状态"}


def build_live_callers(cfg: APIConfig):
    """当用户传入 --live 时，连接真实 Chat Completions API 进行体验。"""
    token_key = "max_tokens" if cfg.legacy_max_tokens else "max_completion_tokens"

    def live_pure(messages: list[dict[str, Any]]) -> str:
        body = {"model": cfg.model, "messages": messages, token_key: 512}
        resp = post_json(cfg.base_url, "/chat/completions", cfg.api_key, "chat", body)
        return resp["choices"][0]["message"].get("content") or ""

    tool_spec = [
        {
            "type": "function",
            "function": {
                "name": "query_order",
                "description": "根据订单号查询实时付款与发货状态（只读）",
                "parameters": {
                    "type": "object",
                    "properties": {"order_id": {"type": "string", "description": "订单编号，如 A100"}},
                    "required": ["order_id"],
                    "additionalProperties": False,
                },
            },
        }
    ]

    state: dict[str, Any] = {}

    def live_agent_model(messages: list[dict[str, Any]]) -> dict[str, Any]:
        if messages[-1]["role"] == "user":
            body = {"model": cfg.model, "messages": messages, "tools": tool_spec, token_key: 512}
            resp = post_json(cfg.base_url, "/chat/completions", cfg.api_key, "chat", body)
            msg = resp["choices"][0]["message"]
            state["assistant_msg"] = msg
            calls = msg.get("tool_calls") or []
            if calls:
                args = json.loads(calls[0]["function"]["arguments"])
                state["call_id"] = calls[0]["id"]
                return {"action": calls[0]["function"]["name"], "order_id": args["order_id"]}
            return {"final_answer": msg.get("content") or ""}
        else:
            chat_msgs = [
                messages[0],
                state["assistant_msg"],
                {"role": "tool", "tool_call_id": state["call_id"], "content": messages[-1]["content"]},
            ]
            body = {"model": cfg.model, "messages": chat_msgs, token_key: 512}
            resp = post_json(cfg.base_url, "/chat/completions", cfg.api_key, "chat", body)
            return {"final_answer": resp["choices"][0]["message"].get("content") or ""}

    return live_pure, live_agent_model


def main() -> None:
    parser = argparse.ArgumentParser(description="第 1 章分步实验：对比普通 LLM API 与最小 Agent")
    parser.add_argument("--live", action="store_true", help="使用环境变量配置的真实 Chat Completions 接口运行")
    parser.add_argument("--question", default="你好，帮我查一下订单 A100 现在发货了没有？")
    args = parser.parse_args()

    mode_label = "真实大模型在线模式 (--live)" if args.live else "零配置本地教学演示模式 (默认)"
    StepLogger.banner(f"Lab 01 · 从 LLM API 到最小 Agent 闭环 [{mode_label}]")

    orders = OrderSystem()
    try:
        if args.live:
            cfg = APIConfig.from_env(require_key=True)
            assert cfg is not None
            ask_llm, agent_model = build_live_callers(cfg)
        else:
            ask_llm, agent_model = mock_pure_llm, mock_agent_model

        step1_pure_llm_call(args.question, ask_llm)
        step2_traditional_service(orders, "A100")
        step3_minimal_agent(args.question, orders, agent_model)
    finally:
        orders.close()


if __name__ == "__main__":
    main()
