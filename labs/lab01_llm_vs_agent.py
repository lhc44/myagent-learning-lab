"""第 1 章实验：从普通 LLM 调用到最小 Agent 闭环 (lab01_llm_vs_agent.py)

从上往下直白走完 3 步（全部调用你配置的真实大模型）：
  • Step 1：普通调大模型（不给工具）—— 看它因为连不上数据库而无法核实 A100。
  • Step 2：直接查本地 SQLite 数据库 —— 准确但听不懂自然语言。
  • Step 3：最小 Agent 闭环 —— 把工具说明书给模型 → 模型提议查 A100 → Python 真正查库 → 把结果回传模型生成最终回答！

运行方式：
  python lab01_llm_vs_agent.py
"""

from __future__ import annotations

import json
from common import OrderSystem, call_llm, show, step_title


# 传给大模型的工具说明书（不包含任何代码或数据库密码）
QUERY_ORDER_TOOL = {
    "type": "function",
    "function": {
        "name": "query_order",
        "description": "根据订单编号查询实时付款状态和发货状态（只读）。",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {"type": "string", "description": "订单编号，例如 A100"},
            },
            "required": ["order_id"],
            "additionalProperties": False,
        },
    },
}


def main() -> None:
    question = "你好，帮我查一下订单 A100 现在发货了没有？"
    orders = OrderSystem()

    try:
        # =============================================================
        # Step 1：以前调大模型 API 的方式（没有工具，只有一问一答）
        # =============================================================
        step_title(1, "普通 LLM 调用（不给工具，看真实模型怎么答）")
        resp1 = call_llm([
            {"role": "system", "content": "你是客服助手。如果查不到实时订单数据，请如实说明，不要猜测。"},
            {"role": "user", "content": question},
        ])
        show("大模型直接回复", resp1["choices"][0]["message"].get("content"))

        # =============================================================
        # Step 2：传统后端查数据库的方式（准确，但不懂自然语言）
        # =============================================================
        step_title(2, "传统业务函数直接查 SQLite 数据库")
        db_row = orders.query_order("A100")
        show("orders.query_order('A100') 返回", db_row)

        # =============================================================
        # Step 3：最小 Agent 闭环（模型提议 → Python 查库 → 结果回传）
        # =============================================================
        step_title(3, "最小 Agent 闭环（挂载工具，真实走完两轮请求）")
        messages = [
            {"role": "system", "content": "你是订单助手。查订单必须调用 query_order 工具，严禁编造。"},
            {"role": "user", "content": question},
        ]

        # 第 1 轮：带上 tools 请求大模型
        first_resp = call_llm(messages, tools=[QUERY_ORDER_TOOL])
        assistant_msg = first_resp["choices"][0]["message"]
        show("第 1 轮大模型返回（注意 tool_calls）", assistant_msg)

        tool_calls = assistant_msg.get("tool_calls") or []
        if not tool_calls:
            print("\n⚠️ 模型本轮没有发起工具调用，直接回复了文本。")
            return

        # 关键：先把模型的回复原样追加到历史消息里
        messages.append({
            "role": "assistant",
            "content": assistant_msg.get("content"),
            "tool_calls": tool_calls,
        })

        # 由你的 Python 代码真正查询数据库，并把结果按 tool_call_id 追加进历史
        for call in tool_calls:
            args = json.loads(call["function"]["arguments"])
            real_result = orders.query_order(args["order_id"])
            show(f"Python 本地真正查库 query_order({args['order_id']!r})", real_result)

            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": json.dumps(real_result, ensure_ascii=False),
            })

        # 第 2 轮：把“问题 + 调用申请 + 数据库真实结果”一起发给大模型生成最终回答
        second_resp = call_llm(messages)
        final_answer = second_resp["choices"][0]["message"].get("content")
        show("第 2 轮大模型基于真实数据生成的最终回答", final_answer)
    finally:
        orders.close()


if __name__ == "__main__":
    main()
