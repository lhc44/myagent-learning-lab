"""第 6 章实验：真实 MCP 子进程联调（三大原语 Prompt / Resource / Tool + 真实大模型）(lab06_mcp_bridge.py)

本脚本直接启动同目录下的 `lab06_mcp_server.py` 子进程，通过标准 MCP 协议（JSON-RPC 2.0 over stdio）
一次性带你亲眼看到三个原语如何联手配合真实大模型工作：
  • Step 1：【Prompt 原语】调 `get_prompt('audit_refund')` 生成专家级审查提示词；
  • Step 2：【Resource 原语】调 `read_resource('policy://P1')` 直接挂载公司退款制度原文；
  • Step 3：【Tool 原语】调 `list_tools()` 发现 `query_order`，把 `inputSchema` 转成大模型认识的 `parameters`；
  • Step 4：把 Prompt + Resource + Tool 一起发给真实大模型，收到 `tool_calls` 后通过 MCP `call_tool` 跨进程查库并拿到最终结论！

前置依赖（只需安装官方 mcp SDK）：
  python -m pip install mcp

运行方式：
  python lab06_mcp_bridge.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from common import call_llm, show, step_title


def mcp_tool_to_openai_schema(mcp_tool: Any) -> dict[str, Any]:
    """把 MCP 工具的 `inputSchema` 翻译成大模型 `/chat/completions` 认识的 `parameters`。"""
    schema = getattr(mcp_tool, "inputSchema", None) or getattr(mcp_tool, "input_schema", {})
    return {
        "type": "function",
        "function": {
            "name": mcp_tool.name,
            "description": mcp_tool.description or "",
            "parameters": schema,
        },
    }


async def main() -> None:
    try:
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
    except ImportError:
        raise SystemExit(
            "\n⚠️  本实验需要官方 MCP Python SDK，请先运行：\n"
            "  python -m pip install mcp\n"
            "安装后再执行：python lab06_mcp_bridge.py"
        ) from None

    server_script = str(Path(__file__).with_name("lab06_mcp_server.py"))
    server_params = StdioServerParameters(command=sys.executable, args=[server_script])

    # 启动子进程并建立 stdio JSON-RPC 2.0 通信管道
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            # Step 1：原语 1 —— 读取 Prompt 模板（帮用户把问题问专业）
            step_title(1, "MCP 原语 1 · Prompts：调用 get_prompt('audit_refund')")
            prompt_res = await session.get_prompt("audit_refund", {"order_id": "A100", "customer_reason": "刚下单未发货想退款"})
            user_prompt_text = prompt_res.messages[0].content.text  # type: ignore[attr-defined]
            show("MCP Server 自动渲染出的专业提问", user_prompt_text)

            # Step 2：原语 2 —— 读取 Resource 只读资源（按 URI 直接挂载制度原文）
            step_title(2, "MCP 原语 2 · Resources：调用 read_resource('policy://P1')")
            resource_res = await session.read_resource("policy://P1")
            policy_text = resource_res.contents[0].text  # type: ignore[attr-defined]
            show("从 URI policy://P1 读到的制度原文", policy_text)

            # Step 3：原语 3 —— 发现 Tools 并翻译成大模型格式
            step_title(3, "MCP 原语 3 · Tools：调用 list_tools() 并转换 Schema")
            tools_res = await session.list_tools()
            llm_tools = [mcp_tool_to_openai_schema(t) for t in tools_res.tools]
            show("转换后发给大模型的 tools 数组", llm_tools)

            # Step 4：把三大原语合力交给真实大模型执行多轮问答！
            step_title(4, "接入真实大模型，通过 MCP call_tool 跨进程查订单并给出结论")
            messages: list[dict[str, Any]] = [
                {"role": "system", "content": f"你是企业售后专员。已挂载现行制度资源：{policy_text}"},
                {"role": "user", "content": user_prompt_text},
            ]

            for round_no in range(1, 5):
                resp = await asyncio.to_thread(call_llm, messages, llm_tools, "auto")
                msg = resp["choices"][0]["message"]
                calls = msg.get("tool_calls") or []
                if not calls:
                    show(f"第 {round_no} 轮大模型最终结论", msg.get("content"))
                    return

                messages.append({"role": "assistant", "content": msg.get("content"), "tool_calls": calls})
                for c in calls:
                    fn_name = c["function"]["name"]
                    fn_args = json.loads(c["function"]["arguments"])
                    # 真正跨进程发 JSON-RPC tools/call 给 MCP Server 执行！
                    mcp_out = await session.call_tool(fn_name, fn_args)
                    payload = mcp_out.model_dump(mode="json")
                    show(f"通过 MCP 子进程执行 {fn_name}({fn_args})", payload)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": c["id"],
                        "content": json.dumps(payload, ensure_ascii=False),
                    })


if __name__ == "__main__":
    asyncio.run(main())
