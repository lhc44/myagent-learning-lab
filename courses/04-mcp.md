# MCP 协议与开发

## 学习目标
掌握客户端、服务端和传输边界。完成后能独立解释数据流，并用失败实验验证边界。

## 原理与设计
Host 管理模型交互及多个 Client；Client 与 Server 建立会话、初始化并协商能力。tools/list 返回名称与 inputSchema；tools/call 传入名称与 arguments。Tools、Resources、Prompts 是不同能力；stdio 与 Streamable HTTP 是传输方式。工具注册是 SDK 内部行为，不是通用 tools/register RPC。

## 数据流
```text
Host → Client → initialize → tools/list → tools/call → Server
```

## 实验与观察
安装 python -m pip install mcp；执行 npx @modelcontextprotocol/inspector，选择 stdio，命令 python 参数 labs/mcp_server.py；再运行 python labs/mcp_client.py。观察工具列表与返回内容。

先预测输出，再运行，记录实际输出与预测差异。修改一个变量后复测，不要只截图成功结果。

## 企业场景
对业务 API 建立细粒度 MCP 工具；远程 HTTP 需鉴权、授权与租户隔离。

## 验收问题
MCP 和 Function Calling 有什么不同？为何客户端需要把 MCP schema 转换成模型格式？

用自己的话回答，并提交一条正常测试和一条失败测试；不能解释原因则回到原理部分。

## 官方阅读
[参考资料](https://modelcontextprotocol.io/specification/) · [完整索引](../references/README.md) · [返回首页](../README.md)
