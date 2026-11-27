# 第 1 章：从 LLM API 到 Agent——控制权与最小闭环

> **第一阶段 · 认知跃迁** · 25 分钟 · 配套 lab01_llm_vs_agent.py

如果你已经用大模型写过代码、调过 /chat/completions 接口做问答或文本提取，其实你离 Agent 只差一层『外部交互循环』。本章帮你跨过第一道认知门槛：看清普通 LLM 调用、固定工作流（Workflow）与智能体（Agent）的精确边界。

## 本章学习目标
- 说清为什么单次 LLM API 调用无法独立解决企业实时业务问题
- 掌握 Anthropic 提出的权威分类：Workflow（工作流）与 Agent（自主智能体）的核心分界
- 画出最小 Agent 的三角色结构（Model、Runtime、Tools），明确执行权归属

> [!TIP]
> **🧭 工程师减负指南：本章什么必会？什么不用死磕？**
> - **✅ 工程实战必会**：彻底分清『模型只提建议、你的代码才真正查库』这条边界；知道什么时候写普通固定流程就够了，什么时候才需要写 Agent。
> - **🪶 放心做减法**：完全不用关心大模型内部神经网络是怎么训练的——把它当成一个『接收 JSON、返回下一步动作建议的远程 HTTP 服务』即可。

## 从传统 / 单次 LLM API 视角过渡
- **过去熟悉的做法**：以前调大模型 API：组装 Prompt → 发送一次 POST 请求 → 拿到生成的纯文本/JSON → 函数结束。模型与外部数据库完全隔离。
- **AI Agent 工程视角**：构建 Agent 系统：你的 Python 程序（Runtime）作为中枢，让模型『提议下一步动作』，由程序校验并调用真实数据库/API，再把客观结果塞回上下文继续推理，直到问题解决。

> [!WARNING]
> **🎭 真实翻车现场：『嘴上全额秒退』引发的客诉风暴**
> 某创业团队上线第一版客服机器人时，只写了一句提示词『遇到不满意的客户请积极安抚并协助退款』，却忘了接真实的退款工单接口。结果大模型顺着语境热情回复了上百位用户：『已为您完成全额退款，2 小时内到账！』第二天用户集体查账未果投诉到监管部门——记住：大模型嘴里说出的『已执行』只是概率生成的安慰剂，数据库没落盘就等于零！

## 核心数据流：最小 Agent 一次完整闭环的真实控制流
| 步骤流向 | 关键动作 | 详细说明 |
| :--- | :--- | :--- |
| `用户 (User)` → `运行程序 (Runtime)` | **1. 自然语言提问** | 『帮我查一下订单 A100 现在发货了没有？』 |
| `运行程序 (Runtime)` → `大模型 (LLM API)` | **2. 第 1 次请求** | 发送用户问题 + 可用工具清单（仅说明书，无数据库权限） |
| `大模型 (LLM API)` → `运行程序 (Runtime)` | **3. 返回动作提议** | 建议调用 query_order(order_id='A100') —— 注意此时尚未查库！ |
| `运行程序 (Runtime)` → `业务工具 (SQLite/Service)` | **4. 校验并执行函数** | Python 代码真正查询数据库，拿到 payment='paid', shipping='pending' |
| `运行程序 (Runtime)` → `大模型 (LLM API)` | **5. 第 2 次请求** | 附上刚才的调用记录 + 数据库真实返回结果 |
| `大模型 (LLM API)` → `用户 (User)` | **6. 基于事实生成回答** | 『订单 A100 已付款，目前处于待发货状态，尚未发出。』 |

## 1.1 你熟悉的 LLM API 调用，到底缺了哪一块拼图？

既然你已经有用大模型辅助开发或调用 API 的经验，不妨先回想一下最熟悉的代码写法：把一段提示词放进 messages 列表，发给 /v1/chat/completions，几秒后拿到模型返回的文本字符串。无论是翻译、总结文档、生成 SQL 草稿还是情感分类，本质上都是『一次输入 → 一次文本生成』的无状态函数映射。

但放到真实的后端业务里，这种模式立刻会撞上一堵墙。假设用户在客服窗口问：『我昨天买的 A100 发货了吗？如果没发货能不能退？』云端的大模型既没有连接你公司的订单数据库，也不知道你们部门上周刚更新的《退款管理制度》。如果不给它外部工具，它只能做两件事之一：要么诚实地回答『我无法访问贵司数据库』，要么顺着语境产生幻觉（Hallucination），信口编造一个『已通过顺丰发出』。

反过来，你原本写的后端接口 query_order(order_id) 拥有 100% 准确的数据库记录，但它只认识结构化参数 A100，听不懂自然语言，更不会根据查出来的结果自己决定要不要再去翻一翻退款规定。Agent 工程的起点，就是把『大模型的自然语言理解与动态规划能力』和『传统业务代码的确定性执行能力』缝合在一起。

## 1.2 权威界定：什么是 Workflow，什么才是真正的 Agent？

市面上几乎所有带点大模型调用的软件都喜欢自称 Agent，这让很多刚入门的开发者一头雾水。为了消除概念混乱，工业界目前最广泛采纳的定义来自 Anthropic 工程团队发表的《Building Effective Agents》架构指南：两者统称为智能体系统（Agentic Systems），但在控制权上存在本质差异。

• 工作流（Workflows）：大模型与工具的调用顺序是由开发者预先写死在代码路径里的（例如：第一步固定提取单号 → 第二步固定查订单表 → 第三步固定渲染话术模板）。控制流由确定性的 if/else 或流程图决定。

• 智能体（Agents）：大模型能够根据当前观察到的环境反馈，动态决定下一步调用什么工具、调用几次以及何时停止。例如用户问『A100 能退吗』，模型先申请查订单；看到返回『已发货』后，它自主决定去查《退货入库流程》；若看到『未发货』，它转而去查《未发货退款审批门槛》。

> **工程黄金法则（Anthropic《Building Effective Agents》）**：始终寻找最简单的解决方案，只在真正需要灵活性时才增加自主度。如果业务步骤完全固定、可预知，优先写确定性的 Workflow（更快、更省钱、更好测）；只有当解决路径取决于中间查询结果、无法穷举硬编码分支时，才引入自主 Agent 循环。

| 对比维度 | 单次 LLM API 调用 | LLM Workflow（工作流） | Autonomous Agent（智能体） |
| --- | --- | --- | --- |
| 下一步做什么由谁定 | 无下一步（一问一答） | 开发者预先写死的代码分支 | 模型根据每轮工具返回动态决策 |
| 外部工具与数据交互 | 无（仅靠训练权重与输入文本） | 按固定流水线顺序调用 | 按需选择、组合、多轮迭代调用 |
| 延迟与 Token 成本 | 最低（1 次请求） | 可预测（固定 N 次请求） | 动态变化（受 max_rounds 预算约束） |
| 典型适用场景 | 翻译、摘要、单步结构化提取 | 固定审批前预审、标准日报生成 | 复杂售后诊断、代码调试助手、深度调研 |

## 1.3 最小 Agent 的三大角色：大脑、控制循环与手脚

剥开所有花哨的框架名词，任何一个能工作的 Agent 在代码层面都只由三个清晰分离的角色组成：

1. 模型（Model / 大脑参谋）：接收当前对话历史和可用工具说明，输出文本回答或『建议调用某个工具及参数』。注意，模型只是一个参谋，它没有手脚，连一行本地 SQL 都执行不了。

2. 运行时（Runtime / 控制循环）：这就是你用 Python、Java 或 TypeScript 编写的主控程序。它负责组装请求、解析模型提议、检查安全性、调用真实函数、把结果打包送回模型，并决定何时跳出循环。

3. 工具（Tools / 确定性手脚）：你原有的业务 Service、SQLite/MySQL 查询接口、内部微服务客户端。工具完全不需要懂 AI，输入确定参数，返回客观业务数据。

## 1.4 铁律：谁对最终业务结果负责？

初学者最容易犯的致命错误，是把『模型说它做了某事』当成『系统真的做了某事』。比如模型在回复里热情洋溢地写着：『已为您完成 A100 全额退款，资金将于 2 小时内原路退回！』——如果后台根本没有触发退款工单接口，这句话就是纯粹的文本幻觉，会直接引发客诉甚至资损。

因此请从第一章就刻下这条铁律：大模型只拥有『建议权』，你的代码（Runtime + 业务服务）才拥有唯一的『执行权』与『审计权』。真实状态永远以数据库事务和下游系统的返回凭证为准。

> **安全底线提醒**：本课程前四章的实验全部设计为只读查询（Read-Only），操作内存中的虚构订单 A100、B200、C300。先把『模型提议 → 代码执行 → 结果回传』的机制摸透，第 5 章我们再专门加上多租户隔离、RBAC 权限与幂等写入保护。

## 🔬 专业术语与底层方法显微镜（四步拆解）

### 1. [🔥 工程实战核心] 无状态推理（Stateless Inference）与上下文重放
- **① 大白话本质**：云端大模型就像一个『每次调完立刻失忆的纯函数 f(x) = y』——它服务器内存里根本不保存你们上一句聊了什么！所谓『多轮对话和 Agent 记忆』，全靠你的客户端代码每次把从头到尾的聊天记录打包重发一遍。
- **② 底层协议与工作机制**：在传统后端里，Session 存在服务端 Redis 里，客户端只传一个 session_id；但在主流 Chat Completions 接口中，服务端每次推理完就释放显存状态。第 1 轮发 2 条消息，第 2 轮发 4 条，第 3 轮发 6 条——你的 messages 数组就是整个智能体唯一的『工作内存』。
- **③ 标准实现代码（Python · 揭秘多轮状态其实保存在你本地的列表里）**：
```python
# 大模型服务端并没有记住第一轮！是你每次把累积的 messages 全量发过去：
messages = [{"role": "user", "content": "我叫张三，帮我查 A100"}]
resp1 = call_llm(messages)                # 第 1 次发送：长度 1

messages.append(resp1["message"])         # 把模型的工具申请存进本地列表
messages.append(tool_result_msg)          # 把本地查库结果存进本地列表
resp2 = call_llm(messages)                # 第 2 次发送：长度 3（全量重放！）
```
- **④ 实现后的真实效果**：理解这一点后你就会豁然开朗：为什么对话越长 Token 账单越贵（因为历史被一遍遍重复计费发送），以及为什么你可以在半路修改、裁剪 messages 列表来精确操控模型看到的世界！

### 2. [🪶 选读拓展] 聊天模板与特殊控制标记（Chat Template & Special Tokens）
- **① 大白话本质**：【选读背景 · 不用写代码】你通过 JSON 发过去的 role: 'system' / 'user' / 'assistant' / 'tool'，进显卡前会被服务端自动套上『特殊防伪分隔符』，让模型分清哪句话是老板定的规矩、哪句话是顾客说的、哪段是工具查出来的客观数据。
- **② 底层协议与工作机制**：大模型的神经网络底层其实只认识一串整数编号（Token IDs）。推理服务在收到你的 messages JSON 数组后，会套用模型专属的 Chat Template（例如 ChatML 格式的 <|im_start|>role ... <|im_end|>），这些特殊标记对应的 Token ID 普通用户输入的纯文本无法直接伪造，从而在模型注意力层面建立来源区分。
- **③ 标准实现代码（底层视角 · 你发的 JSON 在模型眼里实际长这样（以 ChatML 模板为例））**：
```text
<|im_start|>system
你是订单助手，严禁编造数据。<|im_end|>
<|im_start|>user
A100 发货了吗？<|im_end|>
<|im_start|>assistant
<|tool_call|>{"name": "query_order", "arguments": {"order_id": "A100"}}<|/tool_call|><|im_end|>
<|im_start|>tool
{"order_id": "A100", "shipping": "pending"}<|im_end|>
<|im_start|>assistant
订单 A100 目前待发货。<|im_end|>
```
- **④ 实现后的真实效果**：实际效果：如果你偷懒不用原生的 role='tool'，而是自己把数据库结果拼在 role='user' 里发过去，模型就会误以为那是『顾客自己口头声称的数据』而非『系统可信工具返回』，推理准确率会明显下降。

## 分步代码拆解：分步代码演进：用 3 步从普通函数走到最小 Agent

依次点击下方三个步骤，观察 Python 代码是如何从『纯调模型』和『纯查库』合体为最小 Agent 闭环的（完整可运行代码见 labs/lab01_llm_vs_agent.py）：

### Step 1 · 纯调 LLM — 只有 messages 输入输出，模型拿不到任何实时订单数据。
```python
messages = [
    {"role": "system", "content": "你是客服助手，不知道实时数据时请如实说明。"},
    {"role": "user", "content": "帮我查一下订单 A100 现在发货了没有？"},
]
reply = ask_llm(messages)
# 输出：抱歉，我无法直接访问贵公司的实时订单系统……
```
- **核心要点**：无论你的 Prompt 写得多精妙，没有外部工具接入，模型都不可能知道数据库里 A100 的实时状态。

### Step 2 · 纯业务函数 — 确定性 SQLite 查询，结果精确，但只能接收提取好的 order_id。
```python
def query_order(db, order_id: str) -> dict:
    row = db.execute(
        "SELECT payment_status, shipping_status FROM orders WHERE order_id = ?",
        (order_id,),
    ).fetchone()
    return {"order_id": order_id, "payment": row[0], "shipping": row[1]}

# query_order(db, 'A100') -> {'order_id': 'A100', 'payment': 'paid', 'shipping': 'pending'}
```
- **核心要点**：这和你平时写的后端 DAO / Service 完全一样：参数确定、行为可控、带 SQL 参数化防注入。

### Step 3 · 最小 Agent 缝合 — Runtime 居中调度：第 1 次问模型要动作 → 调本地函数拿事实 → 第 2 次让模型据实作答。
```python
messages = [{"role": "user", "content": question}]
first = decide_or_answer(messages)              # 1. 模型提议: {'action': 'query_order', 'order_id': 'A100'}

if first.get("action") == "query_order":
    db_fact = orders.query_order(first["order_id"])  # 2. 你的代码真正查库
    messages.append({"role": "assistant", "content": json.dumps(first)})
    messages.append({"role": "tool", "content": json.dumps(db_fact)})
    second = decide_or_answer(messages)         # 3. 模型看到真实数据后生成人话回答
    print(second["final_answer"])
```
- **核心要点**：恭喜！这短短 10 行调度逻辑，就是所有现代 AI Agent 框架最核心的骨架。

## 动手实验：直接用真实大模型跑通『纯 LLM vs 查库 vs 最小 Agent』三步对比 (`labs/lab01_llm_vs_agent.py`)

1. 先在终端设置好 AGENT_BASE_URL（支持 http 或 https）、AGENT_MODEL、AGENT_API_KEY。
2. 进入实验目录 labs/，直接执行 python lab01_llm_vs_agent.py。
3. 在终端依次对照 [Step 1]、[Step 2]、[Step 3] 的真实输出，找到哪一行是『模型提议的 tool_calls』，哪一行是『Python 本地查询 SQLite 的真实结果』。

```bash
python lab01_llm_vs_agent.py
```

**预期观察结果**：Step 1 中模型因无工具无法给出 A100 状态；Step 2 直接输出 paid/pending 字典；Step 3 通过两次真实大模型调用加一次本地 SQLite 查询，准确输出订单 A100（299 元）已付款、待发货。

## 本章权威参考资料
- [Anthropic · Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — 工业界区分 Workflow 与 Agent 最权威的架构设计文章
- [OpenAI · Agents & Function Calling Guide](https://platform.openai.com/docs/guides/function-calling) — 官方工具调用与智能体控制流基础文档
- [Hugging Face · AI Agents Course (Unit 1)](https://huggingface.co/learn/agents-course/en/unit1/what-are-agents) — 系统化的智能体核心概念导论

---
[返回目录](../README.md) · [下一章 →](02-tool-schema.md)
