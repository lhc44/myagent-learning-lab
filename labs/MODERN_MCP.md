# 现代 MCP 接入实验（Python SDK 2.x）

根据官方 2026-07-28 协议发布说明、Python SDK v2 迁移文档和客户端文档编写。未在本次会话实际安装 SDK 或联调，不把源码提交等同于通过测试。

先在单独虚拟环境安装：`python -m pip install "mcp>=2,<3"`。记录 `python -m pip show mcp` 的版本；不要把旧版 1.x 和新版混在同一个环境。若 SDK 不支持 Client 或 MCPServer，请检查版本。

在仓库根目录执行：

```sh
python labs/modern_mcp_agent.py --discover-only
```

这一步不需要模型 API。客户端启动同目录的服务端，自动探测协议；必须打印 2026-07-28，否则实验失败。它读取工具目录，将 MCP 的 input_schema 转成模型使用的 parameters，并实际查询 A100。目录发现与工具执行是两个独立步骤。

然后按 REAL_API.md 配置 Chat Completions 兼容接口：

```sh
python labs/modern_mcp_agent.py "A100 能否申请退款？"
```

观察模型提出工具请求、客户端通过 MCP 执行、模型再次收到工具结果。模型选择不保证正确；只读查询不修改业务数据。示例使用白名单、参数检查、轮数与工具次数限制。没有企业 OAuth、远程服务隔离、分页完整实现和生产级监控。

官方依据：
- https://blog.modelcontextprotocol.io/posts/2026-07-28/
- https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/whats-new.md
- https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/client/index.md
