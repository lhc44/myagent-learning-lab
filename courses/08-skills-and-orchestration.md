# 第 8 章：工具扩展、Skills 技能包与多智能体编排模式

> **第四阶段 · 复杂系统与落地** · 30 分钟 · 架构设计与编排模式精讲

当你的 Agent 从 Demo 走向大型企业内部平台时，很快会遇到规模化瓶颈：工具从 2 个膨胀到 200 个怎么选？重复性的复杂作业流程怎么沉淀复用？什么时候该用单 Agent，什么时候才该拆成多智能体（Multi-Agent）协作？本章为你建立清晰的大规模 Agent 架构观。

## 本章学习目标
- 掌握大规模工具库的两级路由方法：动态工具检索（Tool Search）与按领域分层挂载
- 理解现代 Agent 工程中的 Skills（可复用技能说明包）、Harness（运行支撑体系）与生命周期 Hooks（钩子）
- 熟记 Anthropic 总结的五大编排模式（Chaining、Routing、Parallelization、Orchestrator-Workers、Evaluator-Optimizer）及其选型边界

> [!TIP]
> **🧭 工程师减负指南：本章什么必会？什么不用死磕？**
> - **✅ 工程实战必会**：这是纯架构设计章，没有必背代码！记住三个实用设计思想就够了：1）工具太多就先筛出几个再给模型；2）长篇操作手册写成 Skill 按需读取；3）别盲目拆多智能体，单 Agent 能搞定就别拆。
> - **🪶 放心做减法**：不需要纠结各种花哨的多智能体学术拓扑名词——用平时后端拆分微服务和中间件（Hook 拦截器）的常识去理解就完全相通。

## 从传统 / 单次 LLM API 视角过渡
- **过去熟悉的做法**：初学者的常见误区：业务稍微复杂一点，一上来就搞『总经理 Agent + 产品经理 Agent + 程序员 Agent + 测试 Agent』四个智能体互相开会聊天——结果 Token 消耗翻十倍，错误层层放大，半天跑不出结果。
- **AI Agent 工程视角**：成熟的架构师思维：优先通过精良的工具设计、按需加载的 Skill 技能包与确定性编排把单 Agent 做到极致；只在上下文需要严格隔离或任务天然可并行分治时，才引入受控的多智能体委派。

> [!WARNING]
> **🎭 真实翻车现场：四个 Agent 开会商业互吹 15 轮，正事一行没干**
> 有开发者模仿网上的炫酷概念搭了『主管 Agent + 调研员 Agent + 审核员 Agent』自由群聊：主管说『辛苦调研员老师查一下』，调研员回『收到！感谢主管信任』，审核员插话『两位配合真默契』……三个模型在群里客套了 15 轮耗光预算，愣是没一个人去调数据库查询函数！记住：多智能体交互必须用结构化任务契约，别让大模型模拟人类职场寒暄。

## 核心数据流：大规模企业智能体支撑体系（Agent Harness）全景执行流水线
| 步骤流向 | 关键动作 | 详细说明 |
| :--- | :--- | :--- |
| `Pre-Run Hook` → `身份鉴权 + 工具检索` | **从 200 个工具筛出 Top-5** | 按部门权限与问题意图动态挂载相关工具，避免撑爆上下文 |
| `Skill Loader` → `按需注入作业手册` | **加载《上线稽核 Skill》** | 只在命中特定专业场景时展开详细 SOP 与输出规范，平时只留一行摘要 |
| `Agent Loop / 子智能体` → `执行与 Pre/Post-Tool Hook` | **拦截高危参数 · 记录耗时** | 复杂独立子任务可派生隔离上下文的 Subagent，仅向主控返回精简结论 |
| `Checkpointer` → `持久化检查点存储` | **支持长任务中断恢复** | 落盘已完成步骤与客观产物凭证，崩溃重启或人工审批后接着跑 |

## 8.1 当工具超过 50 个：先检索候选工具，再交给模型决策

如果把公司内部 200 个微服务的工具 Schema 全塞进每一次请求的 tools 数组里，光工具说明书就要吃掉两三万个 Token，而且名字相近的工具（如 query_b2b_order、query_b2c_order、query_legacy_order）会让模型的选择准确率急剧下滑。

工业界的标准解法是 **动态工具检索（Tool Search / Dynamic Tool Discovery）**：第一步先按当前登录员工的 RBAC 权限过滤掉无权使用的工具，再用轻量语义检索或领域路由选出与当前问题最相关的 5~10 个候选工具（或者给模型提供一个元工具 search_available_tools 按需拉取 Schema），只把这几个精挑细选的工具定义放进本轮请求。

## 8.2 Skills（技能包）、Harness（运行支撑体系）与 Hooks（生命周期钩子）

在近年的前沿编码与企业智能体工程中，有三个高频核心架构概念值得你准确掌握：

• **Skills（技能包 / 渐进式披露 SOP）**：如果把所有领域的复杂操作规程（比如『财务季度结账核对 8 步法』、『生产事故排查手册』）全写进全局 System Prompt，平时普通问答也会被迫背着沉重的包袱。Skill 将特定领域的详细指导说明、参考模板和辅助脚本打包成独立目录：平时上下文里只放每个 Skill 的『名字 + 一句话简介』；只有当模型识别出当前任务匹配某项技能时，才按需读取完整的规程正文（Progressive Disclosure 渐进式披露）。注意：Skill 提供的是『做事方法论』，不自动赋予越权执行的权限！

• **Agent Harness（智能体运行支撑体系）**：模型本身只是引擎，围绕模型构建的整套外围工程底座——包括上下文组装器、工具沙箱、权限网关、重试熔断器、检查点存储和轨迹日志——合称为 Harness。同一个基础大模型，套上粗糙的玩具脚本与套上严密的工业级 Harness，实际任务成功率往往相差数倍。

• **Hooks（生命周期钩子）**：类似 Spring AOP 拦截器或 Web 中间件，在 `before_llm_call`、`before_tool_call`、`after_tool_call` 等确定性时机自动触发。安全拦截与审计统计必须写在确定性的 Hook 代码里，而不能只靠叮嘱模型。

## 8.3 五大经典编排与多智能体设计模式

什么时候该拆多个步骤或多个智能体？下表总结了业界验证最成熟的五种组合模式，建议按从上到下的复杂度阶梯按需选用：

| 模式名称 | 核心机制 | 最适合解决的业务场景 | 主要代价与注意事项 |
| --- | --- | --- | --- |
| 1. 提示词链 (Prompt Chaining) | A 步骤输出经代码检查后作为 B 步骤输入 | 先生成大纲校验合规，再撰写正式报告 | 串行增加延迟，但每步极易单独评估 |
| 2. 路由分发 (Routing) | 先分类意图，再转交专用小模型或专用工具集 | 客服入口分流：售前咨询 / 售后退换 / 技术故障 | 需重点测试边界模糊提问的分流准确率 |
| 3. 并行扇出 (Parallelization) | 多个独立子任务并发请求模型，最后聚合 | 同时审查一份合同的法务风险、财务条款与格式规范 | 适合子任务互不依赖的场景，注意并发限流 |
| 4. 主从编排 (Orchestrator-Workers) | 中央协调者动态拆解子任务，委派给隔离上下文的 Worker 子智能体 | 跨十几个微服务源码仓库定位线上 Bug 并汇总根因 | 子智能体只回传精简结论，避免撑爆主控上下文 |
| 5. 评估-优化循环 (Evaluator-Optimizer) | 生成者产出初稿，独立审阅者按明确标准打分提修改意见 | 高标准代码重构+跑单测修复、严苛合规文案打磨 | 必须有明确的通过标准与最大迭代轮数上限 |

## 8.4 长周期任务的断点续跑（Checkpointing）

如果一个企业稽核任务需要查询十几个系统并等待人工主管第二天早上点审批，绝不能靠挂着一个几小时不断的 HTTP 长连接！工程上应当为每次任务分配唯一 task_id，每完成一步就将当前状态与客观查验凭证序列化落盘（Checkpoint）。恢复运行时，先核对数据库或文件系统中的真实产物状态，从断点下一步继续推进。

## 🔬 专业术语与底层方法显微镜（四步拆解）

### 1. [🔥 工程实战核心] Agent Skills（技能包）的真实目录结构与渐进式披露
- **① 大白话本质**：如果把公司 30 种复杂业务的作业指导书（SOP）全塞进全局 System Prompt，每次哪怕只问一句『今天几号』也要白白消耗三万个 Token！Anthropic 提出的 **Agent Skills** 就像一本带目录的活页夹：平时只让模型看每章『标题 + 一句话简介』，只有真遇到那类活儿时，模型才翻开对应文件夹去读详细说明书和脚本！
- **② 底层协议与工作机制**：一个标准的 Skill 就是一个独立文件夹，核心是一个带 YAML 头部元数据的 `SKILL.md` 文件（还可附带 `scripts/` 确定性校验脚本与 `examples/` 模板）。这种『先读轻量元数据，命中后再按需加载正文』的上下文省流技术，专业名称就叫 **Progressive Disclosure（渐进式披露）**。
- **③ 标准实现代码（Markdown · 一个标准企业级 SKILL.md 文件的真实长相）**：
```markdown
---
name: release-compliance-audit
description: 当用户要求核查某个服务或版本是否满足生产上线放行条件时使用此技能。
---

# 生产发布合规稽核标准步骤
1. 先调用 `get_ci_report` 确认单元测试通过率 = 100% 且无高危 CVE 漏洞；
2. 读取 `policy://P3` 核对变更窗口要求；
3. 按固定 Markdown 表格输出【检查项 | 实测值 | 是否达标】，严禁代替人类负责人点击放行。
```
- **④ 实现后的真实效果**：实现后效果：你的 Agent 可以同时掌握上百种专业岗位技能，而日常待机时的上下文开销只有几百个 Token；一旦触发特定领域任务，又能立刻展现出资深专家级的严谨作业流程！

### 2. [🔥 工程实战核心] 动态工具检索（Tool Search Tool）是怎么写出来的？
- **① 大白话本质**：当公司 MCP 工具多达 300 个时，不把这 300 个工具 Schema 直接发给模型，而是先只给模型 **1 个『查工具黄页的元工具』**（`search_tools`）！模型先搜关键词拿到最相关的 3 个工具说明书，下一轮再真正调用它。
- **② 底层协议与工作机制**：Runtime 维护全量 300 个工具的内存索引，但初始请求只暴露 `search_tools(keyword)`。当模型搜了 `'refund'`，Runtime 在下一轮请求中动态把搜出来的 `query_order`、`submit_refund_ticket` 的完整 JSON Schema 追加进 `active_tools` 列表。
- **③ 标准实现代码（Python · 10 行实现动态工具按需挂载核心逻辑）**：
```python
if call.name == "search_tools":
    kw = args["keyword"].lower()
    matched = [t for t in ALL_300_TOOLS if kw in t.name.lower() or kw in t.description.lower()][:5]
    active_tools.extend(t for t in matched if t not in active_tools)  # 动态挂载进下一轮请求！
    return {"loaded_tools": [t.name for t in matched], "hint": "相关工具已挂载，下一轮可直接调用"}
```
- **④ 实现后的真实效果**：实现后效果：把原本每轮必花的 40,000 个工具定义 Token 骤降了 95% 以上，同时避免了上百个相似工具名互相干扰导致的选错工具问题。

## 分步代码拆解：分步架构演练：如何用 Hooks 与子上下文隔离重构复杂任务

通过代码结构示意，看清生命周期 Hook 拦截器与主从上下文隔离在 Python 中有多直观：

### 1 · 生命周期 Hook — 在不污染业务函数的前提下，统一注入权限审计、参数脱敏与耗时统计。
```python
def run_tool_with_hooks(principal, call, registry, hooks):
    for h in hooks:
        h.before_tool_call(principal, call)   # 确定性拦截高危参数、校验配额

    t0 = time.perf_counter()
    result = registry.execute_safely(call.name, call.raw_arguments)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    for h in hooks:
        h.after_tool_call(principal, call, result, elapsed_ms)  # 写 Trace Span 与审计表
    return result
```
- **核心要点**：这种切面设计让你的业务函数保持纯粹，同时保证没有任何一次工具调用能逃过监控与权限检查。

### 2 · 子智能体上下文隔离 — 为什么要派 Subagent？最重要的收益其实是『保护主智能体的上下文干净』！
```python
def delegate_log_investigation(service_name: str) -> dict:
    """子智能体在独立 messages 列表里翻阅几千行报错日志，只把 200 字根因结论返回给主 Agent！"""
    sub_runtime = AgentRuntime(adapter, send_fn, log_tools, max_rounds=6)
    concise_report, _ = sub_runtime.run(model, f"排查服务 {service_name} 最近 1 小时异常根因")
    return {"service": service_name, "root_cause_summary": concise_report}
```
- **核心要点**：在主 Agent 眼里，子智能体就像一个高智商的工具函数：脏活累活和海量中间日志留在子上下文里销毁，主上下文只接收高信噪比的结论。

## 动手实验：结合上线放行稽核场景做架构拆解，并预热全链路追踪代码 (`labs/lab08_eval_harness.py`)

1. 架构思考练习：假设公司要做一个『版本上线放行稽核助手』，需要核查单元测试报告、安全扫描结果和发布审批制度。请判断这更适合做成确定性 Workflow 还是全自由多智能体？答案：步骤明确固定，优先采用 Parallelization / Chaining 工作流 + 只读工具，仅在生成审阅建议时调用模型，且最终放行按钮留给人类负责人！
2. 运行 python lab08_eval_harness.py，提前观察 run_with_tracing 函数是如何用 Span 记录每一次 llm_call 和 tool_exec 耗时的（下一章我们将深入拆解评测指标）。

```bash
python lab08_eval_harness.py
```

**预期观察结果**：清晰建立『能用单步不用循环、能用固定工作流不用自由多智能体、用子智能体做上下文隔离』的理性架构选型标准。

## 本章权威参考资料
- [Anthropic · Building Effective Agents (Workflows & Multi-Agent)](https://www.anthropic.com/research/building-effective-agents) — 详解五大编排模式何时使用、何时避免的权威指南
- [OpenAI · Practical Guide to Building Agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) — OpenAI 官方发布的企业级单智能体与多智能体拆分决策白皮书

---
[← 上一章](07-context-and-rag.md) · [返回目录](../README.md) · [下一章 →](09-evals-and-tracing.md)
