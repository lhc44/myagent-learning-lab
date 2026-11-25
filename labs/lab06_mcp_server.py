"""第 6 章配套服务端：完整演示 MCP 三大核心原语 (lab06_mcp_server.py)

本文件用最清晰的代码展示一个标准 MCP Server 如何同时暴露三类不同性质的能力（Primitives）：
  1. Tools (`@server.tool`)         → 给【大模型】按需申请调用的业务动作（如查询实时订单）。
  2. Resources (`@server.resource`) → 给【宿主应用/用户】像读文件一样按 URI 直接挂载的只读数据源（如 `policy://P1`）。
  3. Prompts (`@server.prompt`)     → 给【终端用户】在菜单或斜杠命令 `/...` 中一键选用的标准提问模板。

⚠️ 极其重要的工程细节：
  当使用 `transport="stdio"`（标准输入输出管道）运行时，stdout 被专门用来传输 JSON-RPC 2.0 报文！
  因此在服务端代码里【绝对不能用普通的 print(...)】，否则杂乱文字混进 stdout 会直接破坏 JSON 报文解析；
  如需打印服务端调试日志，必须输出到 `sys.stderr`（例如 `print("debug", file=sys.stderr)`）。
"""

from __future__ import annotations

import json
import sys
from common import OrderSystem


# =====================================================================
# 纯业务逻辑实现（与 MCP 装饰器解耦，方便离线教学演示与单元测试直接复用）
# =====================================================================

def tool_query_order(order_id: str) -> dict:
    """【Tool 实现】根据订单编号查询实时付款和发货状态（只读）。"""
    orders = OrderSystem()
    try:
        return orders.query_order(order_id)
    finally:
        orders.close()


def resource_read_policy(doc_id: str) -> str:
    """【Resource 实现】按 URI `policy://{doc_id}` 直接读取企业制度原文。"""
    orders = OrderSystem()
    try:
        for pid, title, content in orders.list_policies():
            if pid.upper() == doc_id.upper():
                return json.dumps({"uri": f"policy://{pid}", "title": title, "content": content}, ensure_ascii=False)
        raise ValueError(f"未找到编号为 {doc_id} 的制度资源")
    finally:
        orders.close()


def prompt_refund_audit(order_id: str, customer_reason: str = "未说明原因") -> str:
    """【Prompt 实现】为用户生成一套结构严谨的『售后退款资格审查』标准提问模板。"""
    return (
        f"请作为企业售后合规专员，对订单【{order_id}】执行标准退款资格审查：\n"
        f"客户陈述原因：{customer_reason}\n"
        "请严格按以下步骤操作：\n"
        "1. 调用 query_order 工具核实该订单的付款状态、发货状态与订单金额；\n"
        "2. 结合退款管理制度（P1）判断该单是否允许提交申请、是否触发 200 元人工审批门槛，或是否需要先退货入库；\n"
        "3. 输出结构化结论（实时事实 / 适用条款 / 下一步操作建议），严禁承诺已直接打款。"
    )


# =====================================================================
# 挂载到官方 MCP Python SDK (兼容 FastMCP / MCPServer)
# =====================================================================

def create_mcp_app():
    try:
        from mcp.server.fastmcp import FastMCP
        server = FastMCP("order-learning-server")
    except ImportError:
        from mcp.server import MCPServer  # type: ignore[no-redef]
        server = MCPServer("order-learning-server")

    # 1. 注册 Tool（模型控制 Model-controlled：由大模型在推理时动态决定是否调用）
    @server.tool()
    def query_order(order_id: str) -> dict:
        """根据订单编号查询客户订单实时付款状态和发货状态，只读不修改数据。"""
        return tool_query_order(order_id)

    # 2. 注册 Resource（应用控制 Application-controlled：通过 URI 模板直接读取只读文档）
    @server.resource("policy://{doc_id}")
    def get_company_policy(doc_id: str) -> str:
        """按文档编号（P1/P2/P3）读取公司现行规章制度全文。"""
        return resource_read_policy(doc_id)

    # 3. 注册 Prompt（用户控制 User-controlled：在客户端显示为可填参数的快捷斜杠指令模板）
    @server.prompt()
    def audit_refund(order_id: str, customer_reason: str = "未发货想退款") -> str:
        """生成针对指定订单号的标准化售后退款合规审查提示词。"""
        return prompt_refund_audit(order_id, customer_reason)

    return server


if __name__ == "__main__":
    print("[MCP Server] 正在通过 stdio 启动（本日志走 stderr，不污染 stdout JSON-RPC 管道）", file=sys.stderr)
    app = create_mcp_app()
    app.run(transport="stdio")
