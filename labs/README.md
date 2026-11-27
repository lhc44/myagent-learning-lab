# 实验源码目录（Labs）

本目录提供与 10 章课程配套的 **8 组扁平直白的 Python 真实大模型（Live）实战脚本**，仅依赖 **Python 3.11+ 标准库**（仅第 6 章 MCP 子进程联调需安装官方 `pip install mcp`）。

- **不限制 `http://` 或 `https://`**：公网 API、公司内网代理、本地 Ollama / vLLM 全部直通。
- **零多余抽象与假数据分支**：每个脚本从上到下按 `Step 1 → Step 2 → Step 3` 直接运行你配置的真实大模型，打开就能一眼看懂。

## 第一步：配置环境变量（支持 http 或 https）

### Windows PowerShell
```powershell
$env:AGENT_BASE_URL = "http://你的地址/v1"     # 支持 http:// 或 https://
$env:AGENT_MODEL    = "你的模型名称"
$env:AGENT_API_KEY  = "你的 API Key"
# 若部分兼容接口只支持 max_tokens（不支持 max_completion_tokens），额外加上：
# $env:AGENT_CHAT_LEGACY_MAX_TOKENS = "1"
```

### macOS / Linux (Bash / Zsh)
```bash
export AGENT_BASE_URL="http://你的地址/v1"
export AGENT_MODEL="你的模型名称"
export AGENT_API_KEY="你的 API Key"
```

## 第二步：按顺序直接运行实验

| 实验文件 | 对应章节 | 运行命令 | 演示内容（全程真实大模型） |
| :--- | :--- | :--- | :--- |
| `common.py` | 公共基础 | （被各实验导入） | 内存 SQLite 模拟订单/制度库、`call_llm` / `call_embedding` 极简请求封装 |
| `lab01_llm_vs_agent.py` | 第 1 章 | `python lab01_llm_vs_agent.py` | Step 1 纯调 LLM → Step 2 直接查库 → Step 3 最小 Agent 两轮闭环 |
| `lab02_tool_schema.py` | 第 2 章 | `python lab02_tool_schema.py` | 打印 JSON Schema、有无 `tools` 真实对比、`auto` vs `required` 对照 |
| `lab03_tool_execution.py` | 第 3 章 | `python lab03_tool_execution.py` | 四层错误防御演练 + 真实模型完整两轮 `tool_call_id` 闭环 |
| `lab04_agent_loop.py` | 第 4 章 | `python lab04_agent_loop.py` | 40 行核心 ReAct `for` 循环，自动查订单 + 查退款制度 |
| `lab05_enterprise_safety.py` | 第 5 章 | `python lab05_enterprise_safety.py` | 真实大模型提示词注入越权攻防 + SHA-256 幂等键 + 人工审批流 |
| `lab06_mcp_server.py`<br>`lab06_mcp_bridge.py` | 第 6 章 | `python lab06_mcp_bridge.py` | 真实拉起 MCP 子进程，一次演示 Prompt / Resource / Tool 三大原语 + 真实模型问答 |
| `lab07_context_rag.py` | 第 7 章 | `python lab07_context_rag.py` | 安全清理旧聊天记录发给真实模型验证 + 真实 RAG 制度问答 |
| `lab08_eval_harness.py` | 第 8–9 章 | `python lab08_eval_harness.py` | 用当前真实大模型自动跑完 5 道回归考题，打印耗时与成绩单 |
| `test_labs.py` | 单元测试 | `python -m unittest discover -v` | 毫秒级验证本地确定性逻辑（不联网、不消耗额度） |
