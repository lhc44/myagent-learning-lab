"""现代 MCP 2.x SDK 教学服务；本地只读虚构数据。"""
from mcp.server import MCPServer
from real_api_agent import OrderStore

mcp = MCPServer("学习用订单服务")

@mcp.tool()
def query_order(order_id: str) -> dict:
    """查询模拟订单的付款与发货状态，不修改订单。"""
    store = OrderStore()
    try:
        return store.execute("query_order", {"order_id": order_id})
    finally:
        store.db.close()

@mcp.tool()
def read_refund_policy() -> dict:
    """读取模拟退款制度，只读。"""
    store = OrderStore()
    try:
        return store.execute("read_refund_policy", {})
    finally:
        store.db.close()

if __name__ == "__main__":
    mcp.run(transport="stdio")
