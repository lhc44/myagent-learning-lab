"""第 6 章实验：显微镜级解剖 JSON-RPC 2.0 与 MCP 三大原语 (lab06_mcp_bridge.py)

如果你第一次看到『MCP 基于 JSON-RPC 2.0 暴露 Tools、Resources、Prompts 三大原语』觉得太专业、太抽象，
直接运行本脚本！我们不用任何黑盒省略，分 6 个清晰步骤在终端把窗户纸彻底捅破：

  • Step 0：看懂 JSON-RPC 2.0 的三种信封（Request 请求、Response 响应、Notification 无 ID 通知）与 `initialize` 握手。
  • Step 1：【原语 1 · Prompts（用户点选快捷模板）】演示 `prompts/list` 与 `prompts/get` —— 用户输入 `/audit_refund A100` 后变成了什么？
  • Step 2：【原语 2 · Resources（应用按 URI 挂载只读数据）】演示 `resources/read` 读取 `policy://P1` —— 像访问网页链接一样直接拿制度原文！
  • Step 3：【原语 3 · Tools（给大模型用的动作按钮）】演示 `tools/list` 拿到 `inputSchema`，并翻译为大模型 API 的 `parameters`。
  • Step 4：大模型输出 `tool_calls` 后，Host 通过 JSON-RPC `tools/call` 跨进程调服务端拿到真实订单状态。
  • Step 5：汇总 Prompt 模板 + Resource 制度全文 + Tool 实时订单数据，交回大模型得出严谨结论！

运行方式：
  python lab06_mcp_bridge.py --demo-protocol     # 零依赖完整跑通上面 6 步显微镜级协议与三大原语演示（默认）
  python lab06_mcp_bridge.py --discover          # 使用真实 mcp SDK 拉起子进程，实测列出并调用 Tool / Resource / Prompt
  python lab06_mcp_bridge.py --live              # 真实 mcp SDK 子进程 + 真实大模型 API 端到端闭环
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from common import APIConfig, StepLogger, post_json
from lab06_mcp_server import prompt_refund_audit, resource_read_policy, tool_query_order


ALLOWED_MCP_TOOLS = {"query_order"}


def mcp_tool_to_openai_schema(mcp_tool_dict: dict[str, Any]) -> dict[str, Any]:
    """桥接翻译官：把 MCP `tools/list` 返回的 `inputSchema` 转换成 OpenAI `tools[].function.parameters`。"""
    return {
        "type": "function",
        "function": {
            "name": mcp_tool_dict["name"],
            "description": mcp_tool_dict.get("description", ""),
            "parameters": mcp_tool_dict["inputSchema"],
        },
    }


# =====================================================================
# 模式 1：零依赖显微镜级演示 —— JSON-RPC 2.0 + Prompts / Resources / Tools 全流程
# =====================================================================

def run_protocol_anatomy_demo() -> None:
    StepLogger.banner("Lab 06 · 显微镜级解剖：JSON-RPC 2.0 报文格式与 MCP 三大原语实战效果")

    # -----------------------------------------------------------------
    # Step 0: JSON-RPC 2.0 到底长什么样？握手 + 单向通知
    # -----------------------------------------------------------------
    StepLogger.step(0, "JSON-RPC 2.0 基础语法：带 id 的请求-响应 vs 不带 id 的单向通知")
    init_req = {
        "jsonrpc": "2.0",
        "id": 1,  # 关键特征：Request 必须带唯一非空 id，服务端回复时原样带上 id=1 对号入座！
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "my-agent-host", "version": "1.0.0"},
        },
    }
    init_resp = {
        "jsonrpc": "2.0",
        "id": 1,  # 与上面 id=1 配对成功！成功包用 "result" 字段，失败包则用 "error": {"code": -32601, ...}
        "result": {
            "protocolVersion": "2025-06-18",
            "capabilities": {"tools": {}, "resources": {}, "prompts": {}},  # 服务端宣告：我同时支持三大原语！
            "serverInfo": {"name": "order-learning-server", "version": "1.0.0"},
        },
    }
    initialized_notification = {
        "jsonrpc": "2.0",
        "method": "notifications/initialized",  # 注意：没有 "id" 字段！这就是 Notification（只发不等回复）
    }
    StepLogger.json_box("① Request（请求包，必含 jsonrpc + id + method）", init_req)
    StepLogger.json_box("② Response（响应包，相同 id + result 宣告支持三大能力）", init_resp)
    StepLogger.json_box("③ Notification（单向通知包，无 id 字段）", initialized_notification)

    # -----------------------------------------------------------------
    # Step 1: 原语一 Prompts（用户控制 User-controlled）
    # -----------------------------------------------------------------
    StepLogger.step(1, "原语 1 · Prompts（给用户选的『快捷斜杠模板』）：prompts/get 实战效果")
    prompt_get_req = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "prompts/get",
        "params": {"name": "audit_refund", "arguments": {"order_id": "A100", "customer_reason": "刚拍下还没发货，想退单"}},
    }
    rendered_prompt = prompt_refund_audit("A100", "刚拍下还没发货，想退单")
    prompt_get_resp = {
        "jsonrpc": "2.0",
        "id": 2,
        "result": {
            "description": "标准化售后退款合规审查提示词",
            "messages": [{"role": "user", "content": {"type": "text", "text": rendered_prompt}}],
        },
    }
    StepLogger.json_box("用户在界面选择 `/audit_refund` 并填入 A100 后，Host 发送请求", prompt_get_req)
    StepLogger.json_box("MCP Server 自动渲染返回的完整高质量提问消息", prompt_get_resp)
    StepLogger.note("实际效果：普通员工不用自己绞尽脑汁写长串 Prompt，在菜单里点一下斜杠指令填个单号，就能发出专家级指令！")

    # -----------------------------------------------------------------
    # Step 2: 原语二 Resources（应用控制 Application-controlled）
    # -----------------------------------------------------------------
    StepLogger.step(2, "原语 2 · Resources（像读文件 URI 一样挂载只读背景资料）：resources/read 实战效果")
    resource_read_req = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "resources/read",
        "params": {"uri": "policy://P1"},
    }
    policy_text = resource_read_policy("P1")
    resource_read_resp = {
        "jsonrpc": "2.0",
        "id": 3,
        "result": {
            "contents": [{"uri": "policy://P1", "mimeType": "application/json", "text": policy_text}]
        },
    }
    StepLogger.json_box("应用或用户勾选挂载 `policy://P1` 资源时发送请求", resource_read_req)
    StepLogger.json_box("MCP Server 返回的只读制度文档内容", resource_read_resp)
    StepLogger.note("实际效果：Resources 就像只读的 GET 接口或本地 `@文件` 引用，不经过大模型瞎猜参数，安全零副作用地直接注入上下文！")

    # -----------------------------------------------------------------
    # Step 3 & 4: 原语三 Tools（模型控制 Model-controlled）发现、转换与跨进程调用
    # -----------------------------------------------------------------
    StepLogger.step(3, "原语 3 · Tools（给大模型按需调用的动作按钮）：tools/list 发现与 Schema 翻译")
    tools_list_resp = {
        "jsonrpc": "2.0",
        "id": 4,
        "result": {
            "tools": [
                {
                    "name": "query_order",
                    "description": "根据订单编号查询实时付款和发货状态（只读）。",
                    "inputSchema": {
                        "type": "object",
                        "properties": {"order_id": {"type": "string"}},
                        "required": ["order_id"],
                        "additionalProperties": False,
                    },
                }
            ]
        },
    }
    llm_tools = [mcp_tool_to_openai_schema(t) for t in tools_list_resp["result"]["tools"] if t["name"] in ALLOWED_MCP_TOOLS]
    StepLogger.json_box("MCP `tools/list` 返回后，经 Host 翻译成发给大模型的 tools 参数", llm_tools)

    StepLogger.step(4, "大模型返回 `tool_calls` → Host 转发为 MCP `tools/call` 执行实时查库")
    llm_tool_call = {"id": "call_mcp_88", "type": "function", "function": {"name": "query_order", "arguments": '{"order_id": "A100"}'}}
    parsed_args = json.loads(llm_tool_call["function"]["arguments"])
    tools_call_req = {
        "jsonrpc": "2.0",
        "id": 5,
        "method": "tools/call",
        "params": {"name": "query_order", "arguments": parsed_args},
    }
    order_data = tool_query_order(parsed_args["order_id"])
    tools_call_resp = {
        "jsonrpc": "2.0",
        "id": 5,
        "result": {"content": [{"type": "text", "text": json.dumps(order_data, ensure_ascii=False)}], "isError": False},
    }
    StepLogger.json_box("Host 发往 MCP Server 的 `tools/call` 请求", tools_call_req)
    StepLogger.json_box("MCP Server 查 SQLite 后返回的订单实时状态", tools_call_resp)

    # -----------------------------------------------------------------
    # Step 5: 三大原语合力送回大模型，完成闭环！
    # -----------------------------------------------------------------
    StepLogger.step(5, "三大原语完美合力：Prompt 定规矩 + Resource 给制度 + Tool 查实情 → 回传大模型")
    tool_msg_for_llm = {
        "role": "tool",
        "tool_call_id": llm_tool_call["id"],
        "content": tools_call_resp["result"]["content"][0]["text"],
    }
    StepLogger.json_box("回传给大模型的 `role='tool'` 消息", tool_msg_for_llm)
    StepLogger.note(
        "一句话总结三大原语的分工：\n"
        "  • Prompt   帮【人】把问题问专业（斜杠模板）；\n"
        "  • Resource 帮【应用】把静态/文档背景喂进去（URI 只读数据源）；\n"
        "  • Tool     帮【大模型】在推理中途动手查实时状态或执行动作（函数调用）！"
    )


# =====================================================================
# 模式 2：连接真实 MCP Python SDK 子进程实测三大原语
# =====================================================================

async def run_real_mcp_sdk(question: str, discover_only: bool) -> None:
    try:
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
    except ImportError as exc:
        raise SystemExit(
            "未检测到 `mcp` Python SDK。请先在虚拟环境安装：`python -m pip install mcp`，\n"
            "或直接运行零依赖完整协议解剖模式：`python lab06_mcp_bridge.py --demo-protocol`"
        ) from exc

    server_script = str(Path(__file__).with_name("lab06_mcp_server.py"))
    server_params = StdioServerParameters(command=sys.executable, args=[server_script])

    StepLogger.banner("Lab 06 · 真实 MCP 子进程联调（同时验证 Prompt / Resource / Tool）")
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            # 1. 验证 Prompt 原语
            prompts_res = await session.list_prompts()
            prompt_detail = await session.get_prompt("audit_refund", {"order_id": "A100"})
            StepLogger.step(1, f"已发现 MCP Prompts: {[p.name for p in prompts_res.prompts]}")
            StepLogger.json_box("调用 get_prompt('audit_refund') 效果", prompt_detail.model_dump(mode="json"))

            # 2. 验证 Resource 原语
            policy_res = await session.read_resource("policy://P1")
            StepLogger.step(2, "调用 read_resource('policy://P1') 效果")
            StepLogger.json_box("读取到的只读制度资源", policy_res.model_dump(mode="json"))

            # 3. 验证 Tool 原语
            tools_res = await session.list_tools()
            raw_tools = [{"name": t.name, "description": t.description or "", "inputSchema": t.inputSchema} for t in tools_res.tools]
            llm_tools = [mcp_tool_to_openai_schema(t) for t in raw_tools if t["name"] in ALLOWED_MCP_TOOLS]
            StepLogger.step(3, "已发现并转换为大模型格式的 Tools")
            StepLogger.json_box("LLM Tools Schema", llm_tools)

            if discover_only:
                call_res = await session.call_tool("query_order", {"order_id": "A100"})
                StepLogger.step(4, "调用 call_tool('query_order', {'order_id': 'A100'}) 效果")
                StepLogger.json_box("子进程实时查询返回", call_res.model_dump(mode="json"))
                return

            cfg = APIConfig.from_env(require_key=True)
            assert cfg is not None
            token_field = "max_tokens" if cfg.legacy_max_tokens else "max_completion_tokens"
            policy_content = policy_res.contents[0].text  # type: ignore[attr-defined]
            messages: list[dict[str, Any]] = [
                {"role": "system", "content": f"你是售后合规助手。参考已挂载的制度资源：{policy_content}"},
                {"role": "user", "content": question},
            ]
            for turn in range(1, 5):
                body = {"model": cfg.model, "messages": messages, "tools": llm_tools, token_field: 1024}
                resp = await asyncio.to_thread(post_json, cfg.base_url, "/chat/completions", cfg.api_key, "chat", body)
                msg = resp["choices"][0]["message"]
                calls = msg.get("tool_calls") or []
                if not calls:
                    print(f"\n✅ 最终回答：{msg.get('content')}")
                    return
                messages.append({"role": "assistant", "content": msg.get("content"), "tool_calls": calls})
                for c in calls:
                    fn_name = c["function"]["name"]
                    fn_args = json.loads(c["function"]["arguments"])
                    mcp_out = await session.call_tool(fn_name, fn_args)
                    payload = mcp_out.model_dump(mode="json")
                    messages.append({"role": "tool", "tool_call_id": c["id"], "content": json.dumps(payload, ensure_ascii=False)})


def main() -> None:
    parser = argparse.ArgumentParser(description="第 6 章分步实验：JSON-RPC 2.0 与 MCP 三大原语实战")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--demo-protocol", action="store_true", help="零依赖展示 JSON-RPC 2.0 与三大原语完整效果（默认）")
    group.add_argument("--discover", action="store_true", help="启动真实 MCP 子进程验证 Prompt / Resource / Tool")
    group.add_argument("--live", action="store_true", help="真实 MCP 子进程 + 真实大模型端到端问答")
    parser.add_argument("--question", default="请查一下订单 A100 现在能否申请退款？")
    args = parser.parse_args()

    if args.discover or args.live:
        asyncio.run(run_real_mcp_sdk(args.question, discover_only=args.discover))
    else:
        run_protocol_anatomy_demo()


if __name__ == "__main__":
    main()
