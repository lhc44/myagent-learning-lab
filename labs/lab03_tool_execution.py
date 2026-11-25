"""第 3 章实验：单轮工具执行闭环与四层错误防御 (lab03_tool_execution.py)

上一章我们在收到模型的 `tool_calls` 时停了下来。本章把它完整走通，并拆解生产级执行器必备的 4 道防线：
  • 防线 1（`invalid_json`）：模型输出被截断或格式损坏，连合法 JSON 都不是。
  • 防线 2（`unknown_tool`）：模型产生了工具名幻觉（请求了未注册或无权调用的函数）。
  • 防线 3（`invalid_arguments`）：JSON 能解析，但缺字段、多字段或参数类型不对（如数字 100 代替字符串 '100'）。
  • 防线 4（`not_found`）：前三关全过，数据库真实执行了查询，但业务上没有这笔订单。

随后在 Stage 2 (`roundtrip`) 中，我们将亲眼观察：
  Request 1 → Assistant `tool_calls` (含 `id`) → 本地 Tool Registry 执行 → 追加 `role: "tool"` (带 `tool_call_id`) → Request 2 拿到最终回答！

运行方式：
  python lab03_tool_execution.py --mock          # 零配置运行：四层错误演练 + 完整单轮往返报文拆解
  python lab03_tool_execution.py errors          # 仅运行本地四层错误防御实验
  python lab03_tool_execution.py roundtrip       # 连接真实大模型完成一次端到端工具调用闭环
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Any, Callable

from common import APIConfig, OrderSystem, StepLogger, post_json
from lab02_tool_schema import ORDER_TOOL_SCHEMA, SYSTEM_PROMPT


# =====================================================================
# 第一部分：构建一个清晰的“工具注册中心（Tool Registry）”与四层防御
# =====================================================================

@dataclass(frozen=True)
class RegisteredTool:
    """将传给模型的 Schema 与本地真正执行的 Python 函数绑定在一起。"""

    name: str
    schema: dict[str, Any]
    required_types: dict[str, type]
    handler: Callable[..., dict[str, Any]]


class ToolRegistry:
    """工具注册中心：只允许执行明确登记过的函数，绝不使用 eval/getattr 反射任意方法！"""

    def __init__(self) -> None:
        self._tools: dict[str, RegisteredTool] = {}

    def register(self, tool: RegisteredTool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"重复注册工具：{tool.name}")
        self._tools[tool.name] = tool

    def schemas_for_llm(self) -> list[dict[str, Any]]:
        """导出供大模型请求使用的 tools 列表。"""
        return [t.schema for t in self._tools.values()]

    def execute_safely(self, tool_name: str, raw_arguments: str) -> dict[str, Any]:
        """按四层防线依次校验并执行工具。返回结构化字典，供序列化后回传给模型。"""

        # 防线 1：检查 arguments 字符串是不是合法的 JSON
        try:
            parsed_args = json.loads(raw_arguments)
        except (json.JSONDecodeError, TypeError):
            return {
                "ok": False,
                "error_type": "invalid_json",
                "message": "参数字符串不是合法的 JSON（可能因 max_tokens 截断），尚未访问数据库。",
            }

        # 防线 2：检查工具名是否在白名单注册表中
        tool = self._tools.get(tool_name)
        if tool is None:
            return {
                "ok": False,
                "error_type": "unknown_tool",
                "message": f"工具 '{tool_name}' 未注册，已拒绝执行，尚未访问数据库。",
            }

        # 防线 3：严格校验参数字典的键集合与每个值的 Python 类型（注意 Python 中 isinstance(True, int) 为真，所以用 type(...) is ...）
        if not isinstance(parsed_args, dict):
            return {
                "ok": False,
                "error_type": "invalid_arguments",
                "message": "工具参数顶层必须是 JSON 对象（object），尚未访问数据库。",
            }

        expected_keys = set(tool.required_types.keys())
        if set(parsed_args.keys()) != expected_keys:
            return {
                "ok": False,
                "error_type": "invalid_arguments",
                "message": f"参数字段不匹配：期望 {sorted(expected_keys)}，实际收到 {sorted(parsed_args.keys())}。",
            }

        for field_name, expected_type in tool.required_types.items():
            if type(parsed_args[field_name]) is not expected_type:
                return {
                    "ok": False,
                    "error_type": "invalid_arguments",
                    "message": (
                        f"字段 '{field_name}' 类型错误：期望 {expected_type.__name__}，"
                        f"实际收到 {type(parsed_args[field_name]).__name__}。"
                    ),
                }

        # 防线 4：前三关全部通过，正式调用业务函数（若查无此单，属于正常业务返回 found=False）
        business_data = tool.handler(**parsed_args)
        if business_data.get("found") is False:
            return {
                "ok": True,
                "error_type": "not_found",
                "data": business_data,
            }
        return {
            "ok": True,
            "error_type": None,
            "data": business_data,
        }


def create_order_registry(orders: OrderSystem) -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(
        RegisteredTool(
            name="query_order",
            schema=ORDER_TOOL_SCHEMA,
            required_types={"order_id": str},
            handler=orders.query_order,
        )
    )
    return registry


# =====================================================================
# 第二部分：Stage 1 —— 亲眼验证五种输入下的四层错误分类
# =====================================================================

def run_errors_demo(registry: ToolRegistry) -> None:
    StepLogger.step(1, "四层错误防御演练（本地确定性测试，区分协议错、校验错与业务空结果）")
    cases = [
        ("1. 正常合法调用", "query_order", '{"order_id": "A100"}'),
        ("2. JSON 语法截断损坏", "query_order", '{"order_id": "A100"'),
        ("3. 工具名称幻觉（未注册）", "delete_all_orders", '{"order_id": "A100"}'),
        ("4. 参数类型不符（数字代替字符串）", "query_order", '{"order_id": 100}'),
        ("5. 参数合法但订单不存在", "query_order", '{"order_id": "Z999"}'),
    ]
    for label, name, raw_json in cases:
        outcome = registry.execute_safely(name, raw_json)
        StepLogger.json_box(f"{label}  →  call({name}, {raw_json})", outcome)

    StepLogger.note(
        "为什么不直接让程序抛异常崩溃，而是返回结构化错误字典？\n"
        "  因为在多轮 Agent 中，把清晰的错误原因作为 tool 消息回传给大模型，模型往往能看懂并自动修正参数重试；\n"
        "  而面对 not_found，模型就能准确告诉用户『查无此单』，而不是瞎编！"
    )


# =====================================================================
# 第三部分：Stage 2 —— 走完一次完整的两轮 HTTP 往返闭环
# =====================================================================

def run_single_roundtrip(
    registry: ToolRegistry,
    question: str,
    use_mock: bool,
    cfg: APIConfig | None,
) -> str:
    StepLogger.step(2, f"完整单轮工具调用往返：『{question}』")
    model_name = cfg.model if cfg else "mock-gpt-4o"
    token_field = "max_tokens" if (cfg and cfg.legacy_max_tokens) else "max_completion_tokens"

    # 1. 构造初始对话列表
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]

    # 2. 第 1 次请求大模型（带上 tools 说明书）
    if use_mock:
        assistant_msg = {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "call_tx_9001",
                    "type": "function",
                    "function": {"name": "query_order", "arguments": '{"order_id": "A100"}'},
                }
            ],
        }
    else:
        assert cfg is not None
        req1 = {"model": model_name, "messages": messages, "tools": registry.schemas_for_llm(), token_field: 512}
        resp1 = post_json(cfg.base_url, "/chat/completions", cfg.api_key, "chat", req1)
        choice1 = resp1["choices"][0]
        if choice1.get("finish_reason") not in (None, "stop", "tool_calls"):
            raise RuntimeError(f"第 1 轮模型异常终止：{choice1.get('finish_reason')}（切勿执行残缺的工具参数！）")
        assistant_msg = choice1["message"]

    StepLogger.json_box("第 1 轮响应：大模型返回的 assistant 消息", assistant_msg)

    tool_calls = assistant_msg.get("tool_calls") or []
    if not tool_calls:
        direct_text = assistant_msg.get("content") or ""
        print(f"▸ 模型判断无需调用工具，直接回答：{direct_text}")
        return direct_text

    # 3. 关键一步：必须先把包含 tool_calls 的 assistant 消息原样放进历史记录！
    messages.append(
        {
            "role": "assistant",
            "content": assistant_msg.get("content"),
            "tool_calls": tool_calls,
        }
    )

    # 4. 逐个执行模型申请的工具调用，并用同一个 tool_call_id 追加 role="tool" 消息
    for call in tool_calls:
        call_id = call["id"]
        fn_name = call["function"]["name"]
        raw_args = call["function"]["arguments"]

        exec_result = registry.execute_safely(fn_name, raw_args)
        StepLogger.json_box(f"本地执行 {fn_name}（关联 ID: {call_id}）", exec_result)

        messages.append(
            {
                "role": "tool",
                "tool_call_id": call_id,  # 必须与 call["id"] 严格一致，不能填订单号 A100！
                "content": json.dumps(exec_result, ensure_ascii=False),
            }
        )

    StepLogger.json_box("准备发往第 2 轮请求的完整 messages 数组（共 4 条消息）", messages)

    # 5. 第 2 次请求大模型（模型此时看到了自己刚才提的请求 + 数据库真实结果）
    if use_mock:
        final_answer = (
            "已为您查询到订单 A100 的最新状态：该订单金额 299 元，当前『已付款（paid）』，"
            "发货状态为『待发货（pending）』，仓库尚未发出。"
        )
    else:
        assert cfg is not None
        req2 = {"model": model_name, "messages": messages, token_field: 512}
        resp2 = post_json(cfg.base_url, "/chat/completions", cfg.api_key, "chat", req2)
        final_answer = resp2["choices"][0]["message"].get("content") or ""

    print(f"\n▸ 第 2 轮响应（最终呈现给用户的回答）：\n  {final_answer}")
    return final_answer


def main() -> None:
    parser = argparse.ArgumentParser(description="第 3 章分步实验：四层错误校验与单轮工具执行闭环")
    parser.add_argument("stage", nargs="?", default="all", choices=["all", "errors", "roundtrip"])
    parser.add_argument("--mock", action="store_true", help="roundtrip 阶段使用本地模拟报文（无需 API Key）")
    parser.add_argument("--question", default="请帮我查询订单 A100 的付款和发货状态。")
    args = parser.parse_args()

    cfg = None
    if args.stage in ("all", "roundtrip") and not args.mock:
        cfg = APIConfig.from_env(require_key=True)

    StepLogger.banner("Lab 03 · 单轮工具执行闭环与四层错误防御")
    orders = OrderSystem()
    try:
        registry = create_order_registry(orders)
        if args.stage in ("all", "errors"):
            run_errors_demo(registry)
        if args.stage in ("all", "roundtrip"):
            run_single_roundtrip(registry, args.question, args.mock, cfg)
    finally:
        orders.close()


if __name__ == "__main__":
    main()
