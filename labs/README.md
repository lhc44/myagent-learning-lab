# 实验源码目录（Labs）

本目录提供与 10 章课程配套的 **8 组循序渐进的 Python 分步教学实验**，仅依赖 **Python 3.11+ 标准库**（第 6 章真实 MCP 进程联调可选安装官方 `mcp` SDK）。

所有实验均支持 **零配置离线教学模式**（无需 API Key 即可逐步观察请求体、响应体、数据库状态与错误拦截），同时也支持通过环境变量一键切换至 **真实大模型 API**（兼容 OpenAI Chat Completions、OpenAI Responses 与 Anthropic Messages 三大主流协议）。

## 实验地图与快速运行

请在终端进入 `labs/` 目录后按顺序体验：

| 实验文件 | 对应章节 | 分步教学重点 | 零配置直接运行命令 |
| :--- | :--- | :--- | :--- |
| `common.py` | 公共基础 | 内存 SQLite 订单/制度服务、分步日志打印器、HTTPS 安全客户端 | （被各实验导入） |
| `lab01_llm_vs_agent.py` | 第 1 章 | Step 1 纯 LLM 调用 → Step 2 传统数据库查询 → Step 3 最小三角色 Agent 闭环 | `python lab01_llm_vs_agent.py` |
| `lab02_tool_schema.py` | 第 2 章 | 工具契约 JSON Schema 拆解、有无 `tools` 对照、`tool_choice` 三种模式实验 | `python lab02_tool_schema.py --mock` |
| `lab03_tool_execution.py` | 第 3 章 | 四层错误防御（JSON/白名单/类型/空记录）与 `tool_call_id` 两轮消息往返 | `python lab03_tool_execution.py --mock` |
| `lab04_agent_loop.py` | 第 4 章 | ReAct 多轮执行循环、轮次与工具预算守卫、三大模型协议适配器（Adapter） | `python lab04_agent_loop.py --mock` |
| `lab05_enterprise_safety.py` | 第 5 章 | 多租户 SQL 隔离、RBAC 双重权限拦截、SHA-256 幂等键防重、HITL 人工审批状态机 | `python lab05_enterprise_safety.py` |
| `lab06_mcp_server.py`<br>`lab06_mcp_bridge.py` | 第 6 章 | MCP JSON-RPC `tools/list` & `tools/call` 与 LLM Function Calling 双链路桥接 | `python lab06_mcp_bridge.py --demo-protocol` |
| `lab07_context_rag.py` | 第 7 章 | Token 预算分配、`tool_calls` 成对安全裁剪算法、Embedding 余弦相似度检索 | `python lab07_context_rag.py` |
| `lab08_eval_harness.py` | 第 8–9 章 | 全链路追踪（Trace/Span）与五维自动化回归评测集（基线 vs 缺陷模型对比） | `python lab08_eval_harness.py` |
| `test_labs.py` | 全章验证 | 覆盖全部核心机制、协议回放、权限隔离、幂等冲突与上下文裁剪的单元测试 | `python -m unittest discover -v` |

## 连接真实大模型 API（可选进阶）

当你想用真实大模型检验工具选择与多轮推理行为时，在终端配置以下环境变量（切勿将密钥写入代码或提交到 Git）：

### Windows PowerShell 7.2+
```powershell
$env:AGENT_API_FORMAT = "chat"                     # 可选: chat | responses | messages
$env:AGENT_BASE_URL = "https://api.openai.com/v1"  # 替换为你的供应商 API 基础地址
$env:AGENT_MODEL = "gpt-4o-mini"                   # 替换为你有权限且支持工具调用的模型名
$env:AGENT_API_KEY = Read-Host "API Key" -MaskInput

python lab01_llm_vs_agent.py --live
python lab02_tool_schema.py compare
python lab03_tool_execution.py roundtrip
python lab04_agent_loop.py "请查一下订单 A100，并根据现行制度判断能否申请退款？"
```

### macOS / Linux (Bash / Zsh)
```bash
export AGENT_API_FORMAT="chat"
export AGENT_BASE_URL="https://api.openai.com/v1"
export AGENT_MODEL="gpt-4o-mini"
read -rs AGENT_API_KEY && export AGENT_API_KEY

python3 lab04_agent_loop.py
```

> **兼容提示**：若部分第三方兼容 Chat Completions 接口尚不支持 `max_completion_tokens` 而仅接受旧字段 `max_tokens`，可额外设置环境变量 `AGENT_CHAT_LEGACY_MAX_TOKENS=1`。第 7 章真实向量接口实验需额外设置 `AGENT_EMBEDDING_MODEL`（如 `text-embedding-3-small`）并附加 `--live-embed` 参数。
