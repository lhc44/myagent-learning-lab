import asyncio
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    server = StdioServerParameters(command=sys.executable,
        args=[str(Path(__file__).with_name("mcp_server.py"))])
    async with stdio_client(server) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            print(await session.list_tools())
            print(await session.call_tool("query_order", {"order_id":"10086"}))

if __name__ == "__main__":
    asyncio.run(main())
