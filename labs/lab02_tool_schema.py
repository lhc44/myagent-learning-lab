"""第 2 章实验：Function Calling 原理与工具契约 JSON Schema (lab02_tool_schema.py)

本脚本分 3 步带你彻底看清“怎么把 Python 函数介绍给大模型”：
  • Stage 1 (`schema`)：拆解一份标准工具说明书（JSON Schema），搞懂每个字段防什么错。
  • Stage 2 (`compare`)：同一个问题『A100 发货了吗？』，对比不传 `tools` 与传入 `tools` 时请求体和响应体的结构变化。
  • Stage 3 (`choice`)：对比 `tool_choice` 为 `auto`、`none`、`required` 时，模型面对闲聊问题与业务问题的行为差异。

运行方式：
  python lab02_tool_schema.py --mock               # 零配置一次跑完 3 个分步实验（推荐先跑）
  python lab02_tool_schema.py schema               # 只看工具说明书结构
  python lab02_tool_schema.py compare --mock       # 对比有无工具时的报文差异
  python lab02_tool_schema.py compare              # 使用真实大模型 API 实测（需配置环境变量）
  python lab02_tool_schema.py choice --mock        # 观察 tool_choice 控制参数的作用
"""

from __future__ import annotations

import argparse
from typing import Any

from common import APIConfig, StepLogger, post_json


# =====================================================================
# 1. 定义一份标准的工具契约（Tool Definition / JSON Schema）
# =====================================================================
# 注意：这里只有“说明书”（字典数据），没有任何数据库密码或可执行代码！
ORDER_TOOL_SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "query_order",
        "description": (
            "根据订单编号查询客户订单的实时付款状态（paid/unpaid）和发货状态（pending/shipped）。"
            "仅当用户明确提供了订单编号并询问订单进度或状态时调用；若缺少订单号请先向用户追问。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "订单唯一编号（字符串格式，保留字母前缀或前导零，例如 'A100'）",
                }
            },
            "required": ["order_id"],
            "additionalProperties": False,
        },
        "strict": True,  # 开启 Strict Structured Outputs：配合封闭 Schema 启用服务端受限解码
    },
}

SYSTEM_PROMPT = (
    "你是企业订单助手。查询实时订单状态必须申请调用 query_order 工具，严禁猜测。"
    "若用户询问一般编程概念，直接回答即可；若用户问订单却没给编号，请先礼貌询问编号。"
)


def build_chat_request(
    model: str,
    question: str,
    with_tools: bool = True,
    tool_choice: str | None = None,
    legacy_max_tokens: bool = False,
) -> dict[str, Any]:
    """组装发往 /chat/completions 的 HTTP 请求正文，所有字段一目了然。"""
    token_field = "max_tokens" if legacy_max_tokens else "max_completion_tokens"
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        token_field: 512,
    }
    if with_tools:
        body["tools"] = [ORDER_TOOL_SCHEMA]
        if tool_choice is not None:
            body["tool_choice"] = tool_choice
    return body


# =====================================================================
# 2. 离线报文模拟器（无 API Key 时精确展示标准 OpenAI 协议响应结构）
# =====================================================================

def mock_chat_completions(body: dict[str, Any]) -> dict[str, Any]:
    question = body["messages"][-1]["content"]
    has_tools = "tools" in body
    choice_mode = body.get("tool_choice", "auto")

    # 情况 A：未提供工具，或者强制禁止调用工具 (tool_choice="none")
    if not has_tools or choice_mode == "none":
        return {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {
                        "role": "assistant",
                        "content": "当前未挂载订单查询工具（或已被禁止调用），我无法核实 A100 的实时发货状态。",
                    },
                }
            ]
        }

    # 情况 B：强制必须调用工具 (tool_choice="required")，哪怕用户问的是“什么是 JSON”
    if choice_mode == "required" and "A100" not in question:
        return {
            "choices": [
                {
                    "finish_reason": "tool_calls",
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_forced_01",
                                "type": "function",
                                "function": {"name": "query_order", "arguments": '{"order_id":"UNKNOWN"}'},
                            }
                        ],
                    },
                }
            ]
        }

    # 情况 C：auto 模式下，问题包含订单查询意图与编号 -> 生成原生 tool_calls
    if "A100" in question:
        return {
            "choices": [
                {
                    "finish_reason": "tool_calls",
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_a100_01",
                                "type": "function",
                                "function": {"name": "query_order", "arguments": '{"order_id":"A100"}'},
                            }
                        ],
                    },
                }
            ]
        }

    # 情况 D：auto 模式下，普通技术问题 -> 直接文本作答，不调工具
    return {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": "JSON Schema 是一种用于声明和校验 JSON 数据结构的标准规范。",
                },
            }
        ]
    }


def send_request(body: dict[str, Any], use_mock: bool, cfg: APIConfig | None) -> dict[str, Any]:
    if use_mock:
        return mock_chat_completions(body)
    assert cfg is not None
    return post_json(cfg.base_url, "/chat/completions", cfg.api_key, "chat", body)


# =====================================================================
# 3. 三个分步教学实验环节
# =====================================================================

def run_stage_schema() -> None:
    StepLogger.step(1, "拆解工具说明书（Tool Schema）的四个核心设计点")
    StepLogger.json_box("传给大模型的 ORDER_TOOL_SCHEMA", ORDER_TOOL_SCHEMA)
    print(
        "\n  1) name ('query_order')        → 协议层标识符，你的代码靠它在注册表里查真实 Python 函数。\n"
        "  2) description                 → 模型选工具的核心依据！写清『查什么、何时调、缺参数怎么办』。\n"
        "  3) properties + required       → 约束 order_id 必须是 string（防止前导零丢失，如 '0012' 变 12）。\n"
        "  4) additionalProperties: false → 配合 strict: true 开启服务端受限解码，杜绝模型编造额外字段。"
    )


def run_stage_compare(use_mock: bool, cfg: APIConfig | None, question: str) -> None:
    model_name = cfg.model if cfg else "mock-gpt-4o"

    StepLogger.step("2A", f"对照组：不提供 tools，直接问『{question}』")
    req_no_tool = build_chat_request(
        model_name, question, with_tools=False, legacy_max_tokens=bool(cfg and cfg.legacy_max_tokens)
    )
    StepLogger.json_box("请求报文（无 tools 字段）", req_no_tool)
    resp_no_tool = send_request(req_no_tool, use_mock, cfg)
    StepLogger.json_box("响应报文 choices[0]", resp_no_tool["choices"][0])

    StepLogger.step("2B", f"实验组：提供 ORDER_TOOL_SCHEMA，再问『{question}』")
    req_with_tool = build_chat_request(
        model_name, question, with_tools=True, tool_choice="auto", legacy_max_tokens=bool(cfg and cfg.legacy_max_tokens)
    )
    StepLogger.json_box("请求报文（附带 tools 与 tool_choice='auto'）", req_with_tool)
    resp_with_tool = send_request(req_with_tool, use_mock, cfg)
    StepLogger.json_box("响应报文 choices[0]", resp_with_tool["choices"][0])

    StepLogger.note(
        "重点观察 finish_reason 从 'stop' 变成了 'tool_calls'，且 message 里多出了 tool_calls 数组！"
        "注意：本章到这里故意停下——收到 tool_calls 只代表『模型提出了查询申请』，数据库一行代码都还没跑！"
    )


def run_stage_choice(use_mock: bool, cfg: APIConfig | None) -> None:
    model_name = cfg.model if cfg else "mock-gpt-4o"
    tech_question = "请用一句话解释什么是 JSON Schema？"

    StepLogger.step("3A", f"普通知识问题 + tool_choice='auto'：『{tech_question}』")
    req_auto = build_chat_request(
        model_name, tech_question, with_tools=True, tool_choice="auto", legacy_max_tokens=bool(cfg and cfg.legacy_max_tokens)
    )
    resp_auto = send_request(req_auto, use_mock, cfg)
    StepLogger.json_box("auto 模式响应（模型自主判断无需调订单工具）", resp_auto["choices"][0])

    StepLogger.step("3B", f"同一个知识问题 + tool_choice='required'（强制调用工具）")
    req_req = build_chat_request(
        model_name, tech_question, with_tools=True, tool_choice="required", legacy_max_tokens=bool(cfg and cfg.legacy_max_tokens)
    )
    resp_req = send_request(req_req, use_mock, cfg)
    StepLogger.json_box("required 模式响应（被接口强迫硬凑了一个工具调用！）", resp_req["choices"][0])

    StepLogger.note(
        "工程启示：评估模型『会不会选工具』时必须用 tool_choice='auto'。"
        "如果用 'required'，哪怕问天气它也会硬调订单接口并乱填参数！"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="第 2 章分步实验：工具契约 JSON Schema 与 tool_choice")
    parser.add_argument(
        "stage",
        nargs="?",
        default="all",
        choices=["all", "schema", "compare", "choice"],
        help="选择要运行的实验阶段（默认 all 依次执行全部三步）",
    )
    parser.add_argument("--mock", action="store_true", help="使用本地标准协议模拟响应（无需 API Key）")
    parser.add_argument("--question", default="A100 发货了吗？", help="compare 阶段的测试提问")
    args = parser.parse_args()

    cfg = None
    if args.stage != "schema" and not args.mock:
        cfg = APIConfig.from_env(require_key=True)

    mode = "离线协议模拟 (--mock)" if args.mock or args.stage == "schema" else f"真实模型 ({cfg.model})"  # type: ignore[union-attr]
    StepLogger.banner(f"Lab 02 · 工具契约 JSON Schema 与决策对照 [{mode}]")

    if args.stage in ("all", "schema"):
        run_stage_schema()
    if args.stage in ("all", "compare"):
        run_stage_compare(args.mock, cfg, args.question)
    if args.stage in ("all", "choice"):
        run_stage_choice(args.mock, cfg)


if __name__ == "__main__":
    main()
