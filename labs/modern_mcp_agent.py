"""把现代 MCP 服务接入真实 Chat Completions 模型。
安装 mcp 2.x；先运行 --discover-only，在线实验需自己配置模型接口。
只启动同目录中受信任的教学服务，绝不执行模型指定的命令。
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import sys
from mcp import Client, StdioServerParameters
from real_api_agent import post

ALLOWED = {"query_order", "read_refund_policy"}

def model_tools(listing):
    # 真实 MCP 工具定义转换成 Chat Completions 所需的 JSON 结构。
    return [
        {"type": "function", "function": {
            "name": t.name,
            "description": t.description or "",
            "parameters": t.input_schema,
        }}
        for t in listing.tools if t.name in ALLOWED
    ]

def valid(name, args):
    if not isinstance(args, dict):
        return False
    if name == "query_order":
        return set(args) == {"order_id"} and type(args["order_id"]) is str
    return name == "read_refund_policy" and args == {}

async def run(question, discover_only):
    spec = StdioServerParameters(
        command=sys.executable,
        args=[str(Path(__file__).with_name("modern_mcp_server.py"))],
    )
    async with Client(spec, mode="auto") as client:
        print("实际协议版本：", client.protocol_version)
        if client.protocol_version != "2026-07-28":
            raise RuntimeError("没有连接到目标现代协议，请核对 SDK 版本。")
        listing = await client.list_tools()
        if listing.next_cursor is not None:
            raise RuntimeError("本教学服务预期只有一页工具。")
        tools = model_tools(listing)
        if {t["function"]["name"] for t in tools} != ALLOWED:
            raise RuntimeError("教学工具目录不完整。")
        print("由 MCP 发现并转换的工具：", json.dumps(tools, ensure_ascii=False, indent=2))
        if discover_only:
            result = await client.call_tool("query_order", {"order_id": "A100"})
            print("MCP 实际执行结果：", result.model_dump_json())
            if result.is_error:
                raise RuntimeError("MCP 查询失败。")
            return
        key = os.environ["AGENT_API_KEY"]
        model = os.environ["AGENT_MODEL"]
        base = os.getenv("AGENT_BASE_URL", "https://api.openai.com/v1")
        messages = [
            {"role": "system", "content": "先查订单与适用制度，再据结果用中文回答。没有证据就说明。只读，不执行退款。"},
            {"role": "user", "content": question},
        ]
        remaining = 6
        for turn in range(4):
            body = {"model": model, "messages": messages, "tools": tools}
            field = "max_tokens" if os.getenv("AGENT_CHAT_LEGACY_MAX_TOKENS") == "1" else "max_completion_tokens"
            body[field] = 1024
            response = await asyncio.to_thread(post, base, "/chat/completions", key, "chat", body)
            choice = response["choices"][0]
            if choice.get("finish_reason") not in ("stop", "tool_calls"):
                raise RuntimeError("模型未正常结束。")
            msg = choice["message"]
            calls = msg.get("tool_calls") or []
            if not calls:
                if not msg.get("content"):
                    raise RuntimeError("未得到回答。")
                print("模型最终回答：", msg["content"])
                return
            if len(calls) > remaining:
                raise RuntimeError("工具预算耗尽。")
            remaining -= len(calls)
            ids = [c["id"] for c in calls]
            if len(set(ids)) != len(ids):
                raise RuntimeError("模型调用编号重复。")
            messages.append({"role": "assistant", "content": msg.get("content"), "tool_calls": calls})
            for call in calls:
                f = call["function"]
                name = f["name"]
                try:
                    args = json.loads(f["arguments"])
                except (ValueError, TypeError):
                    args = None
                if call.get("type") != "function" or not valid(name, args):
                    payload = {"error": "未知工具或无效参数"}
                else:
                    print("模型申请调用：", name, args)
                    result = await asyncio.wait_for(client.call_tool(name, args), timeout=15)
                    # 保留结构化结果、错误标志与文本，方便模型判断。
                    payload = result.model_dump(mode="json", by_alias=True, exclude_none=True)
                    print("MCP 实际执行结果：", json.dumps(payload, ensure_ascii=False))
                messages.append({"role": "tool", "tool_call_id": call["id"],
                                 "content": json.dumps(payload, ensure_ascii=False)})
        raise RuntimeError("模型轮数达到上限。")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--discover-only", action="store_true")
    p.add_argument("question", nargs="?", default="A100 能否申请退款？")
    a = p.parse_args()
    asyncio.run(run(a.question, a.discover_only))
