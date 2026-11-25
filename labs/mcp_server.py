from mcp.server.fastmcp import FastMCP
mcp = FastMCP("learning-lab")

@mcp.tool()
def query_order(order_id: str) -> dict:
    """按编号查询虚构订单，只读。"""
    return {"order_id": order_id, "status": "已完成" if order_id == "10086" else "不存在"}

if __name__ == "__main__":
    mcp.run(transport="stdio")
