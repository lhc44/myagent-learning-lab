"""第 4 章实验：用不到 40 行核心代码手写多轮 ReAct Agent 循环 (lab04_agent_loop.py)

不再写死“请求两次”，而是用一个清晰的 for 循环驱动真实大模型：
  只要模型还想调工具（例如先查订单 A100，再查公司退款制度 P1），就执行并把结果喂回去；
  一旦模型不再返回 tool_calls，就立刻输出最终答案跳出循环！
同时加上 max_rounds（最大轮数）和 max_tool_calls（最大工具调用总次数）双重预算熔断。

运行方式：
  python lab04_agent_loop.py
  python lab04_agent_loop.py "帮我看看已发货的 B200 还能直接退款吗？"
"""

from __future__ import annotations

import json
import sys
from typing import Any

from common import OrderSystem, call_llm, show, step_title


SYSTEM_PROMPT = (
    "你是严谨的企业订单与售后顾问。回答用户关于退款资格的问题时：\n"
    "1. 必须调用 query_order 查明订单真实的付款与发货状态；\n"
    "2. 必须调用 read_refund_policy 核对现行退款管理制度；\n"
    "3. 严格依据查到的两项结果用中文答复，严禁猜测或声称已直接完成打款。"
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_order",
            "description": "根据订单编号查询实时付款状态、发货状态和订单金额（只读）。",
            "parameters": {
                "type": "object",
                "properties": {"order_id": {"type": "string", "description": "订单编号，如 A100"}},
                "required": ["order_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_refund_policy",
            "description": "读取公司现行退款管理制度与审批门槛规定（只读）。",
            "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        },
    },
]


def dispatch_tool(orders: OrderSystem, name: str, raw_arguments: str) -> dict[str, Any]:
    """统一工具分发器：解析参数、白名单检查、执行业务查询。"""
    try:
        args = json.loads(raw_arguments) if raw_arguments else {}
    except (json.JSONDecodeError, TypeError):
        return {"error": "参数不是合法 JSON"}

    if name == "query_order":
        if not isinstance(args, dict) or type(args.get("order_id")) is not str:
            return {"error": "query_order 需要字符串类型的 order_id"}
        return orders.query_order(args["order_id"])

    if name == "read_refund_policy":
        return orders.read_refund_policy()

    return {"error": f"未知工具：{name}"}


def run_agent(orders: OrderSystem, question: str, max_rounds: int = 5, max_tool_calls: int = 8) -> tuple[str, list[str]]:
    """核心 ReAct 执行循环 —— 所有 Agent 框架最底层的引擎就长这样！"""
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]
    called_names: list[str] = []

    for round_no in range(1, max_rounds + 1):
        step_title(round_no, f"Agent Loop 第 {round_no}/{max_rounds} 轮请求真实大模型")
        resp = call_llm(messages, tools=TOOLS, tool_choice="auto")
        choice = resp["choices"][0]
        msg = choice["message"]

        if resp.get("usage"):
            print(f"▸ 本轮 Token 用量：{json.dumps(resp['usage'], ensure_ascii=False)}")

        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            # 终止条件：模型不再申请调工具，直接返回最终答案！
            return msg.get("content") or "", called_names

        # 预算熔断：防止模型一轮并发或在循环里失控刷爆接口
        if len(called_names) + len(tool_calls) > max_tool_calls:
            raise RuntimeError(f"触发预算熔断：工具调用次数超过上限 {max_tool_calls}")

        messages.append({"role": "assistant", "content": msg.get("content"), "tool_calls": tool_calls})

        for call in tool_calls:
            fn_name = call["function"]["name"]
            fn_args = call["function"]["arguments"]
            result = dispatch_tool(orders, fn_name, fn_args)
            called_names.append(fn_name)

            show(f"模型申请调用 {fn_name}({fn_args})", result)
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })

    raise RuntimeError(f"已达到最大轮数上限（{max_rounds} 轮），任务仍未收敛")


def main() -> None:
    question = sys.argv[1] if len(sys.argv) > 1 else "请帮我查一下订单 A100，并根据公司现行制度判断能否申请退款？"
    orders = OrderSystem()
    try:
        answer, called = run_agent(orders, question)
        print("\n" + "=" * 60)
        print(f"✅ 最终回答：\n{answer}")
        print(f"\n📊 本次累计调用工具：{called}")
    finally:
        orders.close()


if __name__ == "__main__":
    main()
