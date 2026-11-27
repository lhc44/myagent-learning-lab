# AI Agent 工程实验室（Agent Learning Lab）

这是一套专为**具备编程基础、用过大模型进行开发或调过聊天 API，但首次系统学习 AI Agent** 的工程师打造的中文实战课程。

课程拒绝概念堆砌与黑盒框架调包，以 **“从单次 LLM API 调用，一步步亲手构建生产级 Agent Runtime”** 为主线，对齐 Anthropic *Building Effective Agents*、Yao et al. *ReAct*、OpenAI / Anthropic 原生工具调用规范、Model Context Protocol (MCP)、OWASP LLM 安全准则与 BFCL 评测方法论。

## 在线交互式学习网站

- **主线交互式课程站**：[https://lhc44.github.io/myagent-learning-lab/](https://lhc44.github.io/myagent-learning-lab/)（本地可直接用浏览器打开 [`docs/index.html`](docs/index.html)）
- **🧪 协议 JSON 生成器与步进实验台**：[`docs/playground.html`](docs/playground.html)（自然点选生成 Tool Call / MCP JSON-RPC 2.0 / JSON Schema，支持一键复制进 Postman 或内置发包两轮实验）
- **快速开始与 API 配置生成器**：[`docs/start.html`](docs/start.html)
- **分步实验源码在线预览与 ZIP 下载中心**：[`docs/downloads.html`](docs/downloads.html)
- **权威协议对照与术语速查手册**：[`docs/reference.html`](docs/reference.html)

## 课程体系（四大阶段 · 10 章主线 + 8 组递进 Python 实验）

| 阶段 | 章节 | 核心主题 | 配套分步实验 (`labs/`) |
| :--- | :--- | :--- | :--- |
| **一、认知跃迁** | [第 1 章](courses/01-llm-to-agent.md) | 从 LLM API 到 Agent：Workflow 与智能体边界、三角色最小闭环 | [`lab01_llm_vs_agent.py`](labs/lab01_llm_vs_agent.py) |
| | [第 2 章](courses/02-tool-schema.md) | Function Calling 原理、受限解码与严密的 JSON Schema 工具契约 | [`lab02_tool_schema.py`](labs/lab02_tool_schema.py) |
| **二、核心机制** | [第 3 章](courses/03-tool-execution.md) | 单轮工具执行闭环、`tool_call_id` 配对与四层错误防御注册表 | [`lab03_tool_execution.py`](labs/lab03_tool_execution.py) |
| | [第 4 章](courses/04-react-agent-loop.md) | 多轮 ReAct 执行循环、双重预算熔断与三大模型协议适配器 | [`lab04_agent_loop.py`](labs/lab04_agent_loop.py) |
| **三、连接与扩展** | [第 5 章](courses/05-enterprise-safety.md) | 企业级安全边界：Principal 租户隔离、RBAC、SHA-256 幂等与 HITL 审批 | [`lab05_enterprise_safety.py`](labs/lab05_enterprise_safety.py) |
| | [第 6 章](courses/06-mcp-protocol.md) | MCP（Model Context Protocol）架构原语与双链路协议桥接 | [`lab06_mcp_bridge.py`](labs/lab06_mcp_bridge.py) |
| | [第 7 章](courses/07-context-and-rag.md) | 管理对话长度（成对清理防报错）与按意思查文档（RAG） | [`lab07_context_rag.py`](labs/lab07_context_rag.py) |
| **四、落地与评估** | [第 8 章](courses/08-skills-and-orchestration.md) | 大规模工具检索、Skills 技能包、Agent Harness 与五大编排模式 | 架构演练 + Hook 切面 |
| | [第 9 章](courses/09-evals-and-tracing.md) | Agent 工程化评估（Evals）五维矩阵与全链路追踪（Tracing） | [`lab08_eval_harness.py`](labs/lab08_eval_harness.py) |
| | [第 10 章](courses/10-frameworks-and-production.md) | 主流框架选型（Agents SDK / LangGraph / Spring AI）与生产落地清单 | [`test_labs.py`](labs/test_labs.py) |

## 30 秒本地快速体验

实验代码仅依赖 **Python 3.11+ 标准库**，全部采用**扁平直白的真实大模型（Live）写法**（不限制 `http://` 或 `https://`，公网 API 与内网代理均直通）：

```bash
cd labs

# 1. 配置你的大模型接口（支持 http:// 或 https://）
# PowerShell 示例：
#   $env:AGENT_BASE_URL = "http://你的地址/v1"
#   $env:AGENT_MODEL    = "你的模型名"
#   $env:AGENT_API_KEY  = "你的 API Key"

# 2. 按顺序直接运行真实大模型分步实验
python lab01_llm_vs_agent.py
python lab04_agent_loop.py
python lab08_eval_harness.py

# 3. 毫秒级运行本地确定性单元测试（不消耗额度）
python -m unittest discover -v
```

若需连接真实的 OpenAI、Anthropic Claude 或兼容大模型接口，请参考 [`labs/README.md`](labs/README.md) 或打开网页 [`docs/start.html`](docs/start.html) 生成本地终端环境变量命令。

## 仓库目录结构

- [`docs/`](docs/)：零构建依赖的交互式教学网站（支持亮/暗主题、分步代码演化器、可视化时序图、在线源码预览与本地学习笔记导出）
- [`labs/`](labs/)：8 组分步递进的 Python 教学实验源码与单元测试 [`test_labs.py`](labs/test_labs.py)
- [`courses/`](courses/)：与网站内容同步的 10 章独立 Markdown 教材讲义
- [`ROADMAP.md`](ROADMAP.md)：分阶段学习计划与能力验收标准
- [`GLOSSARY.md`](GLOSSARY.md)：AI Agent 工程核心术语中英对照表
- [`references/README.md`](references/README.md)：精选一手权威论文、协议规范与官方文档索引
