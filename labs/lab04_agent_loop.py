"""第 4 章实验：多轮 ReAct 执行循环与多协议适配器 (lab04_agent_loop.py)

当用户问『订单 A100 现在能不能申请退款？』时，只查一次订单还不够——
模型往往需要先调 `query_order` 看付款/发货状态，发现未发货后，再调 `read_refund_policy` 查公司退款规定，最后综合给出结论。

本脚本用清晰的分层架构教你手写一个生产原型的 Agent Runtime：
  1. 内部统一数据结构：`ToolSpec`（工具声明）、`ToolCall`（模型调用请求）、`TurnOutput`（单轮解析结果）。
  2. 协议适配层（Adapter Pattern）：分别封装 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 三种报文格式，
     让核心循环代码完全不被单一供应商绑定！
  3. ReAct 循环层（`AgentRuntime`）：驱动“思考/选工具 → 执行工具 → 观察结果 → 再思考”，并强制执行轮数与调用次数预算。

运行方式：
  python lab04_agent_loop.py --mock                       # 零配置观察完整 3 轮 ReAct 推理与工具调用轨迹
  python lab04_agent_loop.py --mock --format responses    # 观察同一业务在 OpenAI Responses 协议下的报文流转
  python lab04_agent_loop.py --mock --format messages     # 观察同一业务在 Anthropic Messages 协议下的报文流转
  python lab04_agent_loop.py                              # 连接环境变量配置的真实大模型运行多轮 Agent！
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Any, Callable

from common import APIConfig, OrderSystem, StepLogger, post_json


# =====================================================================
# 第一层：与具体大模型供应商解耦的内部标准结构
# =====================================================================

@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(frozen=True)
class ToolCall:
    call_id: str
    name: str
    raw_arguments: str | dict[str, Any]


@dataclass
class TurnOutput:
    text: str
    tool_calls: list[ToolCall]
    usage: dict[str, Any] | None = None


AGENT_SYSTEM_PROMPT = (
    "你是严谨的企业订单与售后顾问。回答用户关于订单退款资格的问题时：\n"
    "1. 必须先调用 query_order 获取订单真实的付款与发货状态；\n"
    "2. 必须调用 read_refund_policy 获取现行退款制度条文；\n"
    "3. 严格依据两项真实结果用中文给出结论，严禁猜测或承诺已直接完成打款。"
)

AGENT_TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="query_order",
        description="根据订单编号查询实时付款状态、发货状态和订单金额（只读）。",
        parameters={
            "type": "object",
            "properties": {"order_id": {"type": "string", "description": "订单编号，如 A100"}},
            "required": ["order_id"],
            "additionalProperties": False,
        },
    ),
    ToolSpec(
        name="read_refund_policy",
        description="读取公司现行退款管理制度与审批门槛规定（只读）。",
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    ),
]


# =====================================================================
# 第二层：三大主流 API 格式的协议适配器（Adapter）
# =====================================================================

class ProtocolAdapter:
    """将不同供应商的请求体组装、工具调用提取、工具结果回传封装为统一接口。"""

    endpoint: str

    def init_history(self, system_prompt: str, user_question: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    def build_request(self, model: str, system_prompt: str, history: list[dict[str, Any]], tools: list[ToolSpec]) -> dict[str, Any]:
        raise NotImplementedError

    def parse_and_record(self, raw_response: dict[str, Any], history: list[dict[str, Any]]) -> TurnOutput:
        raise NotImplementedError

    def append_tool_results(self, history: list[dict[str, Any]], results: list[tuple[str, dict[str, Any]]]) -> None:
        raise NotImplementedError


class ChatCompletionsAdapter(ProtocolAdapter):
    """适配 OpenAI /chat/completions 及其生态兼容接口。"""

    endpoint = "/chat/completions"

    def __init__(self, legacy_max_tokens: bool = False) -> None:
        self.token_key = "max_tokens" if legacy_max_tokens else "max_completion_tokens"

    def init_history(self, system_prompt: str, user_question: str) -> list[dict[str, Any]]:
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_question},
        ]

    def build_request(self, model: str, system_prompt: str, history: list[dict[str, Any]], tools: list[ToolSpec]) -> dict[str, Any]:
        body: dict[str, Any] = {"model": model, "messages": history, self.token_key: 1024}
        if tools:
            body["tools"] = [
                {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}}
                for t in tools
            ]
        return body

    def parse_and_record(self, raw_response: dict[str, Any], history: list[dict[str, Any]]) -> TurnOutput:
        choice = raw_response["choices"][0]
        if choice.get("finish_reason") not in (None, "stop", "tool_calls"):
            raise RuntimeError(f"模型未正常结束：{choice.get('finish_reason')}")
        msg = choice["message"]
        raw_calls = msg.get("tool_calls") or []
        history.append({"role": "assistant", "content": msg.get("content"), "tool_calls": raw_calls} if raw_calls else msg)
        calls = [
            ToolCall(call_id=c["id"], name=c["function"]["name"], raw_arguments=c["function"]["arguments"])
            for c in raw_calls
            if c.get("type") == "function"
        ]
        return TurnOutput(text=msg.get("content") or "", tool_calls=calls, usage=raw_response.get("usage"))

    def append_tool_results(self, history: list[dict[str, Any]], results: list[tuple[str, dict[str, Any]]]) -> None:
        for call_id, payload in results:
            history.append({"role": "tool", "tool_call_id": call_id, "content": json.dumps(payload, ensure_ascii=False)})


class ResponsesAdapter(ProtocolAdapter):
    """适配 OpenAI /responses 接口（使用 instructions + input + function_call_output）。"""

    endpoint = "/responses"

    def init_history(self, system_prompt: str, user_question: str) -> list[dict[str, Any]]:
        return [{"role": "user", "content": user_question}]

    def build_request(self, model: str, system_prompt: str, history: list[dict[str, Any]], tools: list[ToolSpec]) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": model,
            "instructions": system_prompt,
            "input": history,
            "max_output_tokens": 1024,
            "store": False,
        }
        if tools:
            body["tools"] = [
                {"type": "function", "name": t.name, "description": t.description, "parameters": t.parameters, "strict": True}
                for t in tools
            ]
        return body

    def parse_and_record(self, raw_response: dict[str, Any], history: list[dict[str, Any]]) -> TurnOutput:
        if raw_response.get("status") not in (None, "completed"):
            raise RuntimeError(f"Responses 状态未完成：{raw_response.get('status')}")
        items = raw_response["output"]
        history.extend(items)
        calls = [
            ToolCall(call_id=item["call_id"], name=item["name"], raw_arguments=item["arguments"])
            for item in items
            if item.get("type") == "function_call"
        ]
        texts = [
            part.get("text", "")
            for item in items
            if item.get("type") == "message"
            for part in item.get("content", [])
            if part.get("type") == "output_text"
        ]
        return TurnOutput(text="".join(texts), tool_calls=calls, usage=raw_response.get("usage"))

    def append_tool_results(self, history: list[dict[str, Any]], results: list[tuple[str, dict[str, Any]]]) -> None:
        for call_id, payload in results:
            history.append({"type": "function_call_output", "call_id": call_id, "output": json.dumps(payload, ensure_ascii=False)})


class AnthropicMessagesAdapter(ProtocolAdapter):
    """适配 Anthropic Claude /messages 接口（使用 input_schema + tool_use + tool_result）。"""

    endpoint = "/messages"

    def init_history(self, system_prompt: str, user_question: str) -> list[dict[str, Any]]:
        return [{"role": "user", "content": user_question}]

    def build_request(self, model: str, system_prompt: str, history: list[dict[str, Any]], tools: list[ToolSpec]) -> dict[str, Any]:
        body: dict[str, Any] = {"model": model, "system": system_prompt, "messages": history, "max_tokens": 1024}
        if tools:
            body["tools"] = [{"name": t.name, "description": t.description, "input_schema": t.parameters} for t in tools]
        return body

    def parse_and_record(self, raw_response: dict[str, Any], history: list[dict[str, Any]]) -> TurnOutput:
        if raw_response.get("stop_reason") not in (None, "end_turn", "tool_use", "stop_sequence"):
            raise RuntimeError(f"Claude 响应异常停止：{raw_response.get('stop_reason')}")
        blocks = raw_response["content"]
        history.append({"role": "assistant", "content": blocks})
        calls = [
            ToolCall(call_id=b["id"], name=b["name"], raw_arguments=b["input"])
            for b in blocks
            if b.get("type") == "tool_use"
        ]
        text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        return TurnOutput(text=text, tool_calls=calls, usage=raw_response.get("usage"))

    def append_tool_results(self, history: list[dict[str, Any]], results: list[tuple[str, dict[str, Any]]]) -> None:
        blocks = [
            {
                "type": "tool_result",
                "tool_use_id": call_id,
                "content": json.dumps(payload, ensure_ascii=False),
                "is_error": "error" in payload,
            }
            for call_id, payload in results
        ]
        history.append({"role": "user", "content": blocks})


def make_adapter(api_format: str, legacy_max_tokens: bool = False) -> ProtocolAdapter:
    if api_format == "chat":
        return ChatCompletionsAdapter(legacy_max_tokens=legacy_max_tokens)
    if api_format == "responses":
        return ResponsesAdapter()
    if api_format == "messages":
        return AnthropicMessagesAdapter()
    raise ValueError(f"不支持的接口格式：{api_format}")


# =====================================================================
# 第三层：干净、纯粹的 ReAct 智能体运行时（AgentRuntime）
# =====================================================================

class AgentRuntime:
    """核心 Agent 执行循环：与具体供应商报文格式彻底解耦！"""

    def __init__(
        self,
        adapter: ProtocolAdapter,
        send_fn: Callable[[str, dict[str, Any]], dict[str, Any]],
        execute_tool_fn: Callable[[str, dict[str, Any] | None], dict[str, Any]],
        max_rounds: int = 5,
        max_tool_calls: int = 8,
    ) -> None:
        self.adapter = adapter
        self.send_fn = send_fn
        self.execute_tool_fn = execute_tool_fn
        self.max_rounds = max_rounds
        self.max_tool_calls = max_tool_calls

    def run(self, model: str, question: str, with_tools: bool = True, verbose: bool = True) -> tuple[str, int]:
        history = self.adapter.init_history(AGENT_SYSTEM_PROMPT, question)
        active_tools = AGENT_TOOLS if with_tools else []
        total_calls = 0

        for round_no in range(1, self.max_rounds + 1):
            if verbose:
                StepLogger.step(round_no, f"Agent Loop 第 {round_no}/{self.max_rounds} 轮 → POST {self.adapter.endpoint}")

            request_body = self.adapter.build_request(model, AGENT_SYSTEM_PROMPT, history, active_tools)
            raw_response = self.send_fn(self.adapter.endpoint, request_body)
            turn = self.adapter.parse_and_record(raw_response, history)

            if verbose and turn.usage:
                print(f"▸ 本轮 Token 用量：{json.dumps(turn.usage, ensure_ascii=False)}")

            # 终止条件：模型不再申请调用任何工具，且给出了有效文本答案
            if not turn.tool_calls:
                if not turn.text.strip():
                    raise RuntimeError("模型既未请求工具，也未返回有效文本内容")
                return turn.text, total_calls

            # 安全守卫 1：未开启工具却收到调用
            if not with_tools:
                raise RuntimeError("当前已禁用工具，拒绝执行模型返回的工具请求")

            # 安全守卫 2：工具调用总预算检查（防止死循环消耗高额费用）
            if total_calls + len(turn.tool_calls) > self.max_tool_calls:
                raise RuntimeError(f"超出单次任务最大工具调用预算（上限 {self.max_tool_calls} 次）")

            # 安全守卫 3：同轮调用 ID 唯一性校验
            ids = [c.call_id for c in turn.tool_calls]
            if len(ids) != len(set(ids)):
                raise RuntimeError("检测到重复的工具调用 ID，中止本轮执行")

            # 逐个解析参数、执行本地业务工具，并收集配对结果
            round_results: list[tuple[str, dict[str, Any]]] = []
            for call in turn.tool_calls:
                if isinstance(call.raw_arguments, str):
                    try:
                        parsed_args = json.loads(call.raw_arguments)
                    except json.JSONDecodeError:
                        parsed_args = None
                else:
                    parsed_args = call.raw_arguments

                result_payload = self.execute_tool_fn(call.name, parsed_args)
                total_calls += 1

                if verbose:
                    StepLogger.json_box(f"模型申请调用 {call.name} (id={call.call_id})", parsed_args)
                    StepLogger.json_box("本地业务工具执行结果", result_payload)

                round_results.append((call.call_id, result_payload))

            # 将本轮所有工具结果追加回历史记录，进入下一轮循环！
            self.adapter.append_tool_results(history, round_results)

        raise RuntimeError(f"已达到最大推理轮数（{self.max_rounds} 轮），任务仍未收敛出最终回答")


# =====================================================================
# 第四层：业务工具分发与离线三轮多协议模拟器
# =====================================================================

def dispatch_business_tool(orders: OrderSystem, name: str, args: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(args, dict):
        return {"error": "参数格式错误：必须是 JSON 对象"}
    if name == "query_order":
        if set(args.keys()) != {"order_id"} or type(args["order_id"]) is not str:
            return {"error": "query_order 仅接受字符串类型的 order_id"}
        return orders.query_order(args["order_id"])
    if name == "read_refund_policy":
        if args != {}:
            return {"error": "read_refund_policy 不接受任何参数"}
        return orders.read_refund_policy()
    return {"error": f"未知工具：{name}"}


def build_mock_sender(api_format: str) -> Callable[[str, dict[str, Any]], dict[str, Any]]:
    """模拟一个标准的三轮 ReAct 思考过程：第 1 轮查订单 → 第 2 轮查退款制度 → 第 3 轮综合给出结论。"""
    step_counter = {"n": 0}

    def sender(_path: str, _body: dict[str, Any]) -> dict[str, Any]:
        step_counter["n"] += 1
        n = step_counter["n"]
        if api_format == "chat":
            if n == 1:
                return {"choices": [{"finish_reason": "tool_calls", "message": {"role": "assistant", "content": None, "tool_calls": [{"id": "call_step1", "type": "function", "function": {"name": "query_order", "arguments": '{"order_id":"A100"}'}}]}}], "usage": {"total_tokens": 148}}
            if n == 2:
                return {"choices": [{"finish_reason": "tool_calls", "message": {"role": "assistant", "content": None, "tool_calls": [{"id": "call_step2", "type": "function", "function": {"name": "read_refund_policy", "arguments": "{}"}}]}}], "usage": {"total_tokens": 236}}
            return {"choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "经查询：1）订单 A100 金额为 299 元，当前已付款（paid）且未发货（pending）；2）依据《退款管理制度》（P1），已付款未发货订单可提交退款申请，但因金额满 200 元，提交后需经人工审批方可打款。"}}], "usage": {"total_tokens": 342}}

        if api_format == "responses":
            if n == 1:
                return {"status": "completed", "output": [{"type": "function_call", "call_id": "fc_1", "name": "query_order", "arguments": '{"order_id":"A100"}'}]}
            if n == 2:
                return {"status": "completed", "output": [{"type": "function_call", "call_id": "fc_2", "name": "read_refund_policy", "arguments": "{}"}]}
            return {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": "订单 A100 已付款且未发货（299 元），符合 P1 退款申请条件，满 200 元需人工审批。"}]}]}

        # messages (Anthropic Claude)
        if n == 1:
            return {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_01", "name": "query_order", "input": {"order_id": "A100"}}]}
        if n == 2:
            return {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_02", "name": "read_refund_policy", "input": {}}]}
        return {"stop_reason": "end_turn", "content": [{"type": "text", "text": "订单 A100 已付款未发货（299 元），按 P1 制度可提交退款申请，等待人工审批。"}]}

    return sender


def main() -> None:
    parser = argparse.ArgumentParser(description="第 4 章分步实验：多轮 ReAct 执行循环与多协议适配")
    parser.add_argument("question", nargs="?", default="请帮我查一下订单 A100，并根据公司现行制度判断能否申请退款？")
    parser.add_argument("--mock", action="store_true", help="使用本地三轮 ReAct 模拟器运行（无需 API Key）")
    parser.add_argument("--format", choices=["chat", "responses", "messages"], default=None, help="指定接口协议格式")
    parser.add_argument("--no-tools", action="store_true", help="禁用工具以观察对比效果")
    args = parser.parse_args()

    orders = OrderSystem()
    try:
        if args.mock:
            fmt = args.format or "chat"
            adapter = make_adapter(fmt)
            sender = build_mock_sender(fmt)
            model_name = f"mock-{fmt}-model"
            mode_desc = f"离线 ReAct 模拟 | 协议={fmt}"
        else:
            cfg = APIConfig.from_env(require_key=True)
            assert cfg is not None
            fmt = args.format or cfg.api_format
            adapter = make_adapter(fmt, legacy_max_tokens=cfg.legacy_max_tokens)
            model_name = cfg.model
            mode_desc = f"真实模型 ({model_name}) | 协议={fmt}"

            def sender(path: str, body: dict[str, Any]) -> dict[str, Any]:
                return post_json(cfg.base_url, path, cfg.api_key, fmt, body)

        StepLogger.banner(f"Lab 04 · 多轮 ReAct 循环与多协议运行时 [{mode_desc}]")
        runtime = AgentRuntime(
            adapter=adapter,
            send_fn=sender,
            execute_tool_fn=lambda name, parsed: dispatch_business_tool(orders, name, parsed),
        )
        answer, call_count = runtime.run(model_name, args.question, with_tools=not args.no_tools, verbose=True)
        print("\n" + "=" * 68)
        print(f"✅ 最终回答：{answer}")
        print(f"📊 累计执行本地工具次数：{call_count}")
    finally:
        orders.close()


if __name__ == "__main__":
    main()
