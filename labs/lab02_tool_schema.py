"""第 2 章实验：工具说明书（JSON Schema）与 tool_choice 对照 (lab02_tool_schema.py)

全部直连真实大模型，分 3 步直观观察：
  • Step 1：打印工具契约 JSON Schema（含 strict: true）。
  • Step 2：同一个订单问题，对比『不传 tools』与『传入 tools』时真实返回的差异（收到 tool_calls 后故意停止，不查库）。
  • Step 3：同一个技术闲聊问题，对比 `tool_choice="auto"` 与 `tool_choice="required"` 时模型的不同行为。

运行方式：
  python lab02_tool_schema.py
"""

from __future__ import annotations

from common import call_llm, show, step_title


ORDER_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "query_order",
        "description": (
            "根据订单编号查询实时付款状态和发货状态（只读）。"
            "仅当用户明确提到订单编号并询问订单状态时调用；普通知识问答不要调用。"
        ),
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "订单编号，字符串格式，例如 A100",
                }
            },
            "required": ["order_id"],
            "additionalProperties": False,
        },
    },
}

SYSTEM_PROMPT = "你是订单助手。查询订单请调用 query_order；回答一般技术概念直接文字答复即可。"


def main() -> None:
    # Step 1：看清发给大模型的工具说明书
    step_title(1, "查看工具说明书 ORDER_TOOL_SCHEMA")
    show("ORDER_TOOL_SCHEMA", ORDER_TOOL_SCHEMA)

    # Step 2：对比有无 tools 时的真实响应
    question = "A100 发货了吗？"
    step_title("2A", f"对照组：不传 tools，直接问『{question}』")
    resp_no_tools = call_llm([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ])
    show("无工具时的 choices[0]", resp_no_tools["choices"][0])

    step_title("2B", f"实验组：传入 tools（auto），再问『{question}』")
    resp_with_tools = call_llm(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        tools=[ORDER_TOOL_SCHEMA],
        tool_choice="auto",
    )
    show("有工具时的 choices[0]（注意 finish_reason 与 tool_calls，此处尚未查库）", resp_with_tools["choices"][0])

    # Step 3：普通技术问题对比 auto 与 required
    tech_question = "用一句话解释什么是 JSON？"
    step_title("3A", f"闲聊问题 + tool_choice='auto'：『{tech_question}』")
    resp_auto = call_llm(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": tech_question},
        ],
        tools=[ORDER_TOOL_SCHEMA],
        tool_choice="auto",
    )
    show("auto 模式响应（模型应自主判断不调工具，直接文字回答）", resp_auto["choices"][0])

    step_title("3B", f"同一个问题 + tool_choice='required'（强制必须调工具）")
    try:
        resp_req = call_llm(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": tech_question},
            ],
            tools=[ORDER_TOOL_SCHEMA],
            tool_choice="required",
        )
        show("required 模式响应（被接口强迫硬凑了一次工具调用！）", resp_req["choices"][0])
    except RuntimeError as exc:
        print(f"▸ 提示：当前兼容接口不支持 tool_choice='required'，服务端返回：{exc}")


if __name__ == "__main__":
    main()
