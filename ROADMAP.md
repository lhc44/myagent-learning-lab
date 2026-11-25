# 学习路线与验收指南（Roadmap）

建议投入 **2–4 周**（每天 45–60 分钟），遵循 **“读懂架构时序 → 跑通本地分步实验 → 接入真实模型验证 → 完成能力自检”** 的节奏推进。

## 第一阶段：认知跃迁（第 1–2 章）
- **核心目标**：跨越从“调聊天 API”到“写 Agent 控制流”的第一道门槛。
- **动手任务**：运行 `lab01_llm_vs_agent.py` 与 `lab02_tool_schema.py --mock`。
- **过关标准**：能脱稿画出 Model、Runtime、Tools 三者的数据流向；能独立手写一份包含 `required` 与 `additionalProperties: false` 的 JSON Schema 工具契约，并解释 `tool_choice="auto"` 与 `"required"` 的评估差异。

## 第二阶段：核心机制（第 3–4 章）
- **核心目标**：亲手实现稳健的工具注册表、单轮往返闭环与多轮 ReAct 运行时。
- **动手任务**：运行 `lab03_tool_execution.py --mock` 与 `lab04_agent_loop.py --mock`（分别切换 `chat`、`responses`、`messages` 三种格式），并配置真实 API Key 实测一次多步查询。
- **过关标准**：能区分四层错误（非法 JSON、未知工具、参数类型错、业务查无记录）各自拦截的位置；能解释为什么必须同时设置 `max_rounds` 与 `max_tool_calls`。

## 第三阶段：连接与扩展（第 5–7 章）
- **核心目标**：掌握企业生产落地必备的安全护栏、标准化协议与上下文管理。
- **动手任务**：依次运行 `lab05_enterprise_safety.py`、`lab06_mcp_bridge.py --demo-protocol` 与 `lab07_context_rag.py`。
- **过关标准**：能说明为什么 `Principal` 身份绝不能放入工具 Schema；理解 SHA-256 事务幂等键与 HITL 待审批状态机；看懂 MCP JSON-RPC 与 LLM Function Calling 的双链路桥接；写出不产生孤儿 `tool` 消息的历史裁剪逻辑。

## 第四阶段：复杂系统与工程落地（第 8–10 章）
- **核心目标**：建立大规模编排、科学评估与主流框架选型视野。
- **动手任务**：对比运行 `lab08_eval_harness.py` 与 `lab08_eval_harness.py --flawed`，执行 `python -m unittest discover -v` 确保全套测试通过。
- **过关标准**：能根据任务确定性选择 Workflow 或 Agent 五大编排模式；能为自己的真实业务编写覆盖五个维度的黄金 Eval 回归测试集，并清晰指出 LangGraph、OpenAI Agents SDK 或 Spring AI 各自封装了哪一层职责。
