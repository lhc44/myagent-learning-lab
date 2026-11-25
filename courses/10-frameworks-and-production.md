# 第 10 章：主流框架选型（Agents SDK / LangGraph / Spring AI）与生产落地

> **第四阶段 · 复杂系统与落地** · 30 分钟 · 框架映射与企业架构毕业指南

为什么我们坚持在前九章一行第三方 Agent 框架都不装，用纯标准库把 Schema、Registry、ReAct Runtime、RBAC 幂等、MCP、RAG 与 Eval 全部亲手写了一遍？因为当你现在再打开 LangGraph、OpenAI Agents SDK 或 Spring AI 的源码和文档时，所有黑盒魔法都会瞬间变成你早已胸有成竹的工程积木！

## 本章学习目标
- 建立『手写核心组件 ↔ 主流开源框架概念』的一一映射关系，彻底祛魅框架黑盒
- 掌握 OpenAI Agents SDK、LangGraph、Anthropic 工具生态与 Java Spring AI 的选型场景对比
- 掌握将本课程 Python 原型平滑落地到企业生产环境（含 Java Spring Boot 微服务架构）的工程核对清单

> [!TIP]
> **🧭 工程师减负指南：本章什么必会？什么不用死磕？**
> - **✅ 工程实战必会**：能把前九章你亲手写过的概念对号入座到你团队选用的那一个框架上（写 Python 看 Agents SDK 或 LangGraph，写 Java 直接看 Spring AI），上线前对着 8 条核对清单过一遍即可毕业！
> - **🪶 放心做减法**：你不需要同时学会市面上所有框架！挑最适合你主力语言生态的 1 个深入用起来就够了，底层原理全是一样的。

## 从传统 / 单次 LLM API 视角过渡
- **过去熟悉的做法**：没学底层原理直接调框架：抄一段 @Tool 注解跑通了 Hello World，一旦线上出现死循环、上下文超长报 400 或跨租户越权，面对十几层框架调用栈完全无从下手。
- **AI Agent 工程视角**：先懂原理再驾驭框架：一眼看穿框架哪一层在拼 tools Schema、哪一层在跑 AgentRuntime 循环、哪一层该挂载你的业务事务与权限拦截器——你成了框架的主人，而不是配置搬运工。

> [!WARNING]
> **🎭 真实翻车现场：为调一个两步查询引入三层重型框架的代价**
> 某团队做一个简单的『查订单 + 生成物流摘要』功能，一上来就套了某重型框架的高级自治组件，结果框架大版本升级改动了内部 Prompt 模板和消息序列化类，导致线上服务大面积反序列化失败。后来团队用不到 120 行原生 SDK + 薄循环重写，代码量少了三分之二，延迟降了 40%，再也没出过框架兼容故障——懂原理，才敢做减法！

## 核心数据流：企业异构微服务生产落地推荐拓扑（Java 核心业务 + Agent 协同）
| 步骤流向 | 关键动作 | 详细说明 |
| :--- | :--- | :--- |
| `企业 API 网关` → `认证鉴权 & 限流` | **解析 JWT 身份令牌** | 生成可信 Principal 与全局 Trace ID，拦截未登录请求 |
| `Agent 编排服务` → `Spring AI 或 Python Runtime` | **状态管理 + 上下文组装** | 读取任务检查点，按权限筛选工具目录与检索企业知识库 |
| `工具执行与 MCP 层` → `Java Spring Boot 核心服务` | **RPC / MCP / 本地调用** | 执行严格校验、RBAC、数据库事务、Outbox 消息与幂等键保护 |
| `异步审批与监控平台` → `HITL 审批流 + OpenTelemetry` | **高危操作挂起待审** | 采集全链路 Span 指标，定期运行 Eval 回归测试集监控质量漂移 |

## 10.1 祛魅时刻：你前九章亲手写的代码，在成熟框架里叫什么？

回看我们在 `labs/` 目录里一步步写出来的干净模块，把它们和当今最主流的智能体开发框架放在一起对照，你会惊喜地发现底层设计哲学完全相通：

| 你在本课程手写的组件 | OpenAI Agents SDK (Python) | LangGraph (Python / TS) | Spring AI (Java 企业生态) |
| --- | --- | --- | --- |
| RegisteredTool + Schema | @function_tool 装饰器 | @tool + Pydantic BaseModel | @Tool 注解 + MethodToolCallback |
| AgentRuntime.run() 循环 | Runner.run() / Runner.run_sync() | StateGraph(MessagesState) + ToolNode | ChatClient + ToolCallingManager |
| Principal 身份上下文注入 | RunContextWrapper[UserContext] | RunnableConfig / InjectedState | ToolContext (不可被模型篡改的服务端上下文) |
| HITL 待审批挂起与恢复 | Tool Approval / Guardrails | interrupt() + Checkpointer 持久化 | 自定义 ToolExecutionEligibilityPredicate / 状态机 |
| MCP 协议客户端桥接 | MCPServerStdio / MCPServerStreamableHttp | langchain-mcp-adapters | spring-ai-mcp-client-spring-boot-starter |

## 10.2 四大主流技术路线该怎么选？

没有『最好』的框架，只有最匹配你团队技术栈与任务形态的选择：

• **直接手写薄封装 Runtime（无重型框架）**：如果你的核心需求是工具数量适中的单 Agent 助手或确定性多步工作流，直接使用官方原生 SDK（`openai` / `anthropic` 客户端）配合你自己写的 200 行薄 Runtime 往往是**最清晰、最易调试、升级零包袱**的方案（这也是 Anthropic 工程团队在许多生产项目中推荐的首选做法）。

• **LangGraph**：当你的业务流程包含复杂的有向循环图、精细的多分支状态流转、频繁的『挂起等待人工审批几天后再从原节点精确恢复（Time-travel & Checkpointing）』时，基于显式状态图的 LangGraph 极具优势。

• **OpenAI Agents SDK**：轻量级、上手极快，内置了优雅的 Handoffs（智能体交接）、输入输出 Guardrails（护栏）和开箱即用的 Tracing 面板，适合快速构建 Python 端多角色协作原型。

• **Spring AI**：如果你的公司原本就是标准的 **Java / Spring Boot** 后端技术栈，拥有完善的 Spring Security 认证体系、MyBatis/JPA 数据库事务与微服务注册中心，**完全不需要为了做 Agent 把现有业务重写成 Python！**直接使用 Spring AI 的 `ChatClient` 与 `ToolContext`，就能在复用全部现有 Java Service 和事务设施的前提下，无缝获得工具调用、RAG 向量存储与 MCP Server/Client 能力。

## 10.3 给 Java / Go / TypeScript 后端开发者的跨语言迁移指南

本课程用 Python 标准库教学，是因为它能用最少样板代码让你看清 JSON 协议与控制循环的本质。当你回到自己主力语言的生产工程中时，只需做四步平滑替换：

1. 把 `common.post_json` 替换为带有连接池、超时控制与指数退避重试（仅限只读或带幂等键请求）的企业级 HTTP 客户端或官方强类型 SDK；

2. 把 `dict` 参数校验替换为强类型契约（Java Record + Bean Validation、TypeScript Zod、Python Pydantic）；

3. 把内存 SQLite 替换为生产关系型数据库（PostgreSQL + `pgvector`、MySQL 等），跨系统写入配合事务发件箱（Transactional Outbox）与下游幂等键；

4. 把 `Principal` 绑定到框架的安全上下文（如 Spring AI 的 `ToolContext`），确保模型永远无法伪造租户与用户身份。

## 10.4 生产上线前最后的 8 项核对清单（Production Checklist）

在你准备将第一个真正的 Agent 特性推向生产环境前，请逐条勾验这份架构师自检表：

1. **复杂度克制**：是否确认该场景确实需要动态工具决策，而不是几行确定性代码或固定 Workflow 就能搞定？

2. **身份硬隔离**：所有工具调用的租户 ID、用户 ID 是否 100% 取自服务端可信会话，绝不从大模型参数读取？

3. **写入双保险**：所有会产生副作用的写操作是否都具备幂等键（Idempotency Key）保护，且高风险动作已接入 HITL 人工审批状态机？

4. **双重熔断预算**：Runtime 是否强制配置了 `max_rounds`、`max_tool_calls`、单次请求超时与用户级速率配额（Rate Limit）？

5. **四层参数防御**：是否正确处理了 `finish_reason='length'` 截断、非法 JSON、未注册工具名、类型不符与业务空结果？

6. **上下文配对安全**：长对话裁剪逻辑是否保证了 System 指令置顶，且绝不拆散 `tool_calls` 与 `tool` 消息对？

7. **全链路可观测**：每次请求是否有唯一 `trace_id` 串联所有模型推理与工具执行耗时、Token 用量，并已完成敏感信息脱敏？

8. **自动化回归门禁**：是否已建立至少 30~50 条覆盖正例、查无结果、缺参、无关问题与越权诱导的黄金 Eval 评测集，在每次更换模型或修改提示词前自动跑分？

> **结语：从 API 调用者到 Agent 系统工程师**：走到这里，你已经完成了从『只会调聊天接口』到『真正理解并能亲手构建可靠智能体系统』的完整跨越。大模型的推理能力每年都在飞速进化，但你在本课程掌握的边界划分、契约规范、控制循环、安全隔离、上下文工程与科学评估，是穿越技术周期、永不过时的硬核软件工程基本功。

## 🔬 专业术语与底层方法显微镜（四步拆解）

### 1. [🔥 工程实战核心] LangGraph 的 interrupt() 与 Command(resume=...) 是怎么实现跨天人工审批的？
- **① 大白话本质**：第 5 章我们自己用 SQLite 表写了 `pending_approval` 状态机。如果你使用 **LangGraph** 框架，它内置了 `Checkpointer`（自动存档器）+ `interrupt()`（原地冻结函数）：代码跑到高危步骤调一句 `interrupt(...)`，整个工作流状态就会自动打包存进数据库并立刻释放线程；等财务三天后点同意，用 `Command(resume='批准')` 一唤醒，代码就像刚睡醒一样接着往下跑！
- **② 底层协议与工作机制**：需要掌握一个非常关键的官方底层细节：调用 `graph.invoke(Command(resume=...), config)` 恢复时，LangGraph 会加载该 `thread_id` 保存的快照，**从那个被中断节点函数的第一行重新开始执行**，但这一次执行到 `interrupt(...)` 那一行时不会再暂停，而是直接把 `'批准'` 作为 `interrupt()` 的返回值赋给变量继续往下走！因此，节点里排在 `interrupt()` 之前的逻辑必须是无副作用或幂等的。
- **③ 标准实现代码（Python · LangGraph 最新官方 HITL 人工审批中断与恢复标准写法）**：
```python
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import interrupt, Command

def refund_approval_node(state: dict):
    # 第 1 次跑到这儿会立即暂停落盘，把字典抛给前端审批页；恢复时 decision 直接拿到审批结果！
    decision = interrupt({"ticket": state["order_id"], "amount": 299, "tip": "满200元请财务确认"})
    if decision == "approved":
        return {"status": "refunded"}
    return {"status": "rejected"}

# 挂起后，三天后财务点击同意时，带着同一个 thread_id 唤醒：
config = {"configurable": {"thread_id": "order-A100-session"}}
graph.invoke(Command(resume="approved"), config)
```
- **④ 实现后的真实效果**：实现后效果：无需占用任何后台挂起线程或长连接，哪怕期间服务器发版重启了十次，只要 Postgres/SQLite Checkpointer 里存着 `thread_id` 的状态快照，工作流就能丝滑衔接继续执行。

### 2. [🔥 工程实战核心] OpenAI Agents SDK 的 Handoffs（交接）与 Guardrails（并行护栏）
- **① 大白话本质**：在 OpenAI 官方轻量框架 Agents SDK 中，有两个最常被问到的专业词：**Handoff（交接）** 就像医院前台分诊护士发现你是眼科问题，直接把你的病历本转交给眼科专科医生 Agent 接管对话；**Guardrail（护栏）** 则像安检仪，在主模型干活的同时并发检查输入有没有违规攻击、输出有没有泄露隐私，一旦报警立即掐断！
- **② 底层协议与工作机制**：底层其实完全不神秘：Handoff 在协议层就是自动注册了一个名为 `transfer_to_refund_specialist` 的特殊 Tool——当前台模型调用这个 Tool 时，Runner 循环自动把后续轮次的 `system_prompt` 和 `tools` 切换成售后专家的配置！而 Input Guardrail 则是用 `asyncio` 并行跑一个极便宜快速的小分类器，发现异常直接触发 Tripwire 熔断，省下主模型推理开销。
- **③ 标准实现代码（Python · OpenAI Agents SDK 中定义交接（Handoff）的极简官方写法）**：
```python
from agents import Agent, Runner

refund_agent = Agent(name="售后退款专家", instructions="专职核查订单状态与 P1 退款制度", tools=[query_order])
triage_agent = Agent(
    name="总台分诊助手",
    instructions="普通咨询直接答；涉及订单退款请交接给售后退款专家。",
    handoffs=[refund_agent],   # 底层自动生成 transfer_to_... 工具实现会话控制权移交！
)
```
- **④ 实现后的真实效果**：透彻理解前九章手写 Runtime 后，看到 `handoffs=[...]` 你一秒就能反应过来它底层是怎么靠切换 System Prompt 和 Tools 列表实现的——再也没有任何框架概念能难倒你！

## 分步代码拆解：跨语言实战对照：把本课手写 Python 映射到 Java Spring AI

看看当底层原理完全想通后，用 Java Spring AI 写出同等安全的企业级工具调用有多么顺理成章：

### 1 · 定义带 ToolContext 的安全工具 — 租户身份从 Spring AI 的 ToolContext 获取，对大模型 Schema 完全隐藏！
```java
public class OrderAgentTools {
    private final OrderService orderService;

    @Tool(description = "根据订单编号查询实时付款和发货状态（只读）。缺少订单号时请先询问用户。")
    public OrderDto queryOrder(
            @ToolParam(description = "订单唯一编号，如 A100") String orderId,
            ToolContext toolContext) { // ToolContext 由服务端注入，不会暴露给大模型！
        String tenantId = (String) toolContext.getContext().get("tenantId");
        return orderService.findByTenantAndId(tenantId, orderId);
    }
}
```
- **核心要点**：看！这和我们在第 5 章手写的 query_order(p: Principal, order_id: str) 在安全设计上分毫不差！

### 2 · 注入身份并启动运行循环 — ChatClient 在内部自动完成你第 4 章手写的工具 Schema 组装、ReAct 循环与 tool_call_id 回传。
```java
String answer = chatClient.prompt()
    .system("你是严谨的企业订单助手，请依据工具查询结果如实回答。")
    .user("帮我查一下订单 A100 现在发货了没有？")
    .tools(orderAgentTools)
    .toolContext(Map.of("tenantId", authenticatedUser.getTenantId()))
    .call()
    .content();
```
- **核心要点**：没学过前九章的人看到这段链式调用会觉得是黑魔法；而现在的你，连它底下发了几次 HTTP 请求、每次拼了什么 JSON 都一清二楚！

## 动手实验：运行全量工程验证套件，并绘制你自己的第一个业务 Agent 架构图 (`labs/test_labs.py`)

1. 在 labs/ 目录下运行 python -m unittest discover -v，确认全套 8 个实验模块的 12 项核心工程断言全部通过。
2. 毕业实战练习：从你日常工作的真实项目里挑一个小场景（例如：查询线上接口报错日志、核对配置变更单或回答内部研发规范），按照 10.4 节的 8 项核对清单，设计它的工具 JSON Schema、Principal 权限边界和 5 条黄金 Eval 测试用例！

```bash
python -m unittest discover -v
```

**预期观察结果**：12 项自动化测试全部 OK，你能够脱离任何教程模板，独立设计并评审一个安全、可控、可评估的 AI Agent 系统。

## 本章权威参考资料
- [OpenAI Agents SDK Documentation](https://openai.github.io/openai-agents-python/) — 轻量级 Python 智能体编排、Guardrails 与 Tracing 官方文档
- [LangGraph Official Documentation](https://docs.langchain.com/oss/python/langgraph/overview) — 状态图编排、持久化 Checkpointer 与人工介入官方文档
- [Spring AI Reference Documentation](https://docs.spring.io/spring-ai/reference/) — Java / Spring Boot 生态接入工具调用、RAG 与 MCP 的权威参考手册

---
[← 上一章](09-evals-and-tracing.md) · [返回目录](../README.md)
