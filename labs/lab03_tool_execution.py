"""第 3 章实验：四层错误防御与完整单轮工具闭环 (lab03_tool_execution.py)

本脚本分 2 步直白展示：
  • Step 1（本地确定性演练）：用 5 组固定输入验证四道防线（坏 JSON / 未注册工具 / 参数类型错 / 业务查无此单）。
  • Step 2（真实大模型闭环）：完整走完 Request 1 → 本地校验查库 → 追加带 tool_call_id 的消息 → Request 2 拿到最终回答。

运行方式：
  python lab03_tool_execution.py
"""

from __future__ import annotations

import json
from typing import Any

from common import OrderSystem, call_llm, show, step_title
from lab02_tool_schema import ORDER_TOOL_SCHEMA, SYSTEM_PROMPT


def execute_tool_safely(orders: OrderSystem, tool_name: str, raw_arguments: str) -> dict[str, Any]:
    """生产级工具执行器的四道防线：永远不信任大模型发来的原始字符串！"""

    # 防线 1：先检查是不是合法 JSON（防止输出被截断）
    try:
        args = json.loads(raw_arguments)
    except (json.JSONDecodeError, TypeError):
        return {"ok": False, "error_type": "invalid_json", "message": "参数不是合法 JSON，尚未查库"}

    # 防线 2：白名单检查工具名（绝不能用 getattr/eval 任意反射！）
    if tool_name != "query_order":
        return {"ok": False, "error_type": "unknown_tool", "message": f"未注册工具 {tool_name}，已拒绝执行"}

    # 防线 3：严格检查字段名与类型（用 type(...) is str 防止数字 100 或布尔值混入）
    if not isinstance(args, dict) or set(args.keys()) != {"order_id"} or type(args["order_id"]) is not str:
        return {"ok": False, "error_type": "invalid_arguments", "message": "参数必须且只能包含字符串类型的 order_id"}

    # 防线 4：前三关通过，真正查询 SQLite 数据库
    data = orders.query_order(args["order_id"])
    if not data["found"]:
        return {"ok": True, "error_type": "not_found", "data": data}
    return {"ok": True, "error_type": None, "data": data}


def main() -> None:
    orders = OrderSystem()
    try:
        # =============================================================
        # Step 1：先直观观察 5 种输入分别触发哪一层防线
        # =============================================================
        step_title(1, "四层错误防御演示（区分格式错、白名单错、类型错与业务空结果）")
        test_cases = [
            ("1. 正常调用", "query_order", '{"order_id": "A100"}'),
            ("2. JSON 被截断损坏", "query_order", '{"order_id": "A100"'),
            ("3. 模型编造未注册工具", "delete_all_orders", '{"order_id": "A100"}'),
            ("4. 传了数字而不是字符串", "query_order", '{"order_id": 100}'),
            ("5. 参数合法但订单不存在", "query_order", '{"order_id": "Z999"}'),
        ]
        for label, name, raw_args in test_cases:
            res = execute_tool_safely(orders, name, raw_args)
            show(f"{label}  ({name}, {raw_args})", res)

        # =============================================================
        # Step 2：连接真实大模型，走完完整两轮 HTTP 闭环
        # =============================================================
        step_title(2, "真实大模型完整两轮往返（观察 4 条 messages 的完整拼装）")
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "请帮我查一下订单 A100 的付款和发货状态。"},
        ]

        # 第 1 轮：发问题 + 工具说明书
        resp1 = call_llm(messages, tools=[ORDER_TOOL_SCHEMA], tool_choice="auto")
        choice1 = resp1["choices"][0]
        if choice1.get("finish_reason") not in (None, "stop", "tool_calls"):
            raise RuntimeError(f"第 1 轮模型异常中断：{choice1.get('finish_reason')}")

        assistant_msg = choice1["message"]
        show("第 1 轮模型返回", assistant_msg)

        tool_calls = assistant_msg.get("tool_calls") or []
        if not tool_calls:
            print("▸ 模型未调用工具，直接回复：", assistant_msg.get("content"))
            return

        # 把第 1 轮的模型消息原样加入历史
        messages.append({
            "role": "assistant",
            "content": assistant_msg.get("content"),
            "tool_calls": tool_calls,
        })

        # 逐个校验并执行，按原 tool_call_id 塞回历史
        for call in tool_calls:
            result = execute_tool_safely(orders, call["function"]["name"], call["function"]["arguments"])
            show(f"本地安全执行结果 (关联 id={call['id']})", result)
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })

        show("准备发往第 2 轮请求的完整 messages（共 4 条）", messages)

        # 第 2 轮：带着工具结果再问大模型
        resp2 = call_llm(messages)
        show("第 2 轮最终回答", resp2["choices"][0]["message"].get("content"))
    finally:
        orders.close()


if __name__ == "__main__":
    main()
