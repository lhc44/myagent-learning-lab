# AI Agent 工程核心术语表（Glossary）

| 术语（英文 / 中文） | 精确工程定义 | 对应章节 |
| :--- | :--- | :--- |
| **Workflow vs Agent**（工作流与智能体） | Workflow 由确定性代码控制执行路径；Agent 由大模型根据每轮工具返回动态决定下一步行动与终止时机。 | 第 1 章 |
| **Agent Runtime**（智能体运行时） | 围绕大模型编写的主控循环程序，负责上下文组装、解析工具请求、权限拦截、函数调度与预算熔断。 | 第 1, 4 章 |
| **Function Calling / Tool Use**（原生工具调用） | 模型结合后训练对齐与服务端受限解码，根据工具 JSON Schema 输出结构化调用请求的能力。 | 第 2 章 |
| **JSON Schema**（工具参数契约） | 声明工具入参字段名、数据类型、必填项（`required`）与封闭性（`additionalProperties: false`）的规范。 | 第 2 章 |
| **Tool Registry**（工具注册中心） | 维护协议工具名称到受控业务函数的白名单映射表，并在调用前执行严格类型校验。 | 第 3 章 |
| **`tool_call_id`**（单次调用关联标识） | 模型为每项工具请求生成的唯一 ID，回传 `role="tool"` 结果时必须精确匹配以支持并发调用对号入座。 | 第 3 章 |
| **ReAct**（Reasoning + Acting） | 交替进行“推理分析缺口 → 调用外部工具 → 观察客观结果”的多轮智能体核心执行范式。 | 第 4 章 |
| **Protocol Adapter**（协议适配器） | 屏蔽 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 等不同报文格式差异的封装层。 | 第 4 章 |
| **Principal**（可信身份主体） | 由企业认证网关验证生成的租户、用户与权限上下文，直接注入数据层查询，对大模型完全隐藏。 | 第 5 章 |
| **Excessive Agency**（过度代理） | OWASP LLM 十大安全风险之一：赋予智能体过大权限或允许其未经审批直接执行不可逆高危写操作。 | 第 5 章 |
| **Idempotency Key**（幂等键） | 绑定单次业务写入意图的唯一标识（配合参数哈希指纹），确保网络超时重试不会产生重复扣款或重复建单。 | 第 5 章 |
| **HITL**（Human-in-the-Loop 人工介入） | 将高危操作设计为持久化状态机（如 `pending_approval`），由独立权限的人类审批者确认后方可执行。 | 第 5 章 |
| **MCP**（Model Context Protocol） | 基于 JSON-RPC 2.0 的开放标准协议，用于统一宿主应用（Host）发现与调用外部系统 Tools、Resources 与 Prompts 的方式。 | 第 6 章 |
| **Context Engineering**（上下文工程） | 围绕有限注意力窗口进行的 Token 预算分配、原子交互组配对裁剪、摘要压缩与高信噪比证据注入。 | 第 7 章 |
| **RAG & Embedding**（检索增强生成与向量化） | 将文本映射为稠密语义向量，通过余弦相似度从企业知识库召回相关片段作为模型回答依据。 | 第 7 章 |
| **Skills & Agent Harness**（技能包与支撑底座） | Skill 是支持渐进式按需加载的领域标准作业规程；Harness 是涵盖沙箱、钩子、检查点与日志的外围运行体系。 | 第 8 章 |
| **Eval Harness & Trajectory**（评估基准与轨迹） | 面向概率性智能体的回归测试体系，同时断言中间工具调用序列、参数精确度、结果忠实度与拒止安全性。 | 第 9 章 |
| **Tracing & Span**（全链路追踪） | 使用全局 `trace_id` 记录每次模型推理与工具执行的输入、输出、耗时和 Token 消耗，支撑线上排障。 | 第 9 章 |
