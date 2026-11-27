# 第 4 章：多轮 ReAct 循环与多模型协议适配（Agent Runtime）

> **第二阶段 · 核心机制** · 40 分钟 · 配套 lab04_agent_loop.py

第 3 章我们写死了『请求 2 次就结束』。但在真实世界里，用户一句『订单 A100 现在能不能申请退款？』需要模型先查订单状态，看到结果后再去查退款制度，甚至可能继续核对审批门槛。本章引入 AI Agent 领域最经典的 ReAct 论文范式，手写一个支持三大主流 API 协议的通用 AgentRuntime！

## 本章学习目标
- 透彻理解 Yao et al. 提出的 ReAct（Reasoning + Acting）交替推理循环机制
- 用不到 50 行核心代码写出带 max_rounds 与 max_tool_calls 双重预算保护的 AgentRuntime
- 掌握适配器模式（Adapter Pattern），一举打通 OpenAI Chat Completions、OpenAI Responses 与 Anthropic Messages 三种协议格式

> [!TIP]
> **🧭 工程师减负指南：本章什么必会？什么不用死磕？**
> - **✅ 工程实战必会**：看懂 Agent 主循环其实就是一个不超过 30 行的 for 循环（发请求 → 有 tool_calls 就执行并追加历史 → 没 tool_calls 就返回最终文本），记得加上最大轮数和最大调用次数限制。
> - **🪶 放心做减法**：『ReAct』虽然出自顶会论文，但工程上不要被论文名字吓到——它就是上面说的『想一步、调一次工具、看一眼结果再接着想』的普通循环！至于三种 API 格式差异，平时主用你手头那一种就行，换厂商时再查表对照。

## 从传统 / 单次 LLM API 视角过渡
- **过去熟悉的做法**：在代码里硬编码两次 HTTP 调用（第 1 次拿工具，第 2 次拿答案），一旦任务需要第 3 步查询就彻底卡死；且换一家大模型供应商就要重写整套业务循环。
- **AI Agent 工程视角**：用 while / for 循环驱动 ReAct 状态演进，直到模型不再返回 tool_calls 为止；同时用一层薄薄的 ProtocolAdapter 隔离不同厂商的字段命名差异。

> [!WARNING]
> **🎭 真实翻车现场：周五忘设 max_rounds，周一喜提 $800 账单**
> 某内部数据分析 Agent 用 while True 跑工具循环。周五傍晚一个下游报表接口挂了返回 502，执着的大模型决定『再试一次说不定就好了』，于是以每秒 2 次的速度不眠不休重试了整整一个周末，上下文越滚越长，周一早上团队打开账单直接眼前一黑——没有双重预算熔断器（max_rounds + max_tool_calls）的 while 循环就是定时炸弹！

## 核心数据流：ReAct 多轮循环解决『A100 能否退款』的三轮完整轨迹
| 步骤流向 | 关键动作 | 详细说明 |
| :--- | :--- | :--- |
| `Round 1 · Reasoning & Act` → `调用 query_order('A100')` | **缺订单事实，先查单** | Observation 1：A100 金额 299 元，已付款 (paid)，待发货 (pending) |
| `Round 2 · Reasoning & Act` → `调用 read_refund_policy()` | **已知未发货，再查制度门槛** | Observation 2：P1 规定已付款未发货可申请退款，满 200 元须人工审批 |
| `Round 3 · Final Synthesis` → `输出最终结论 (无 tool_calls)` | **两项证据齐备，跳出循环** | 综合回答：可提交退款申请，因金额 299 元满 200 元需人工审批 |

## 4.1 什么是 ReAct 范式？（Reasoning + Acting）

2022 年底，普林斯顿大学与 Google Research 联合发表了奠基性论文《ReAct: Synergizing Reasoning and Acting in Language Models》（Yao et al., ICLR 2023）。在此之前，学术界要么只研究让模型纯靠内部思维链空想（Chain-of-Thought，容易在缺少外部事实时一路错到底），要么只研究盲目输出动作序列。

ReAct 的核心洞见极其优雅：让大模型交替进行 **Thought（思考当前缺什么信息） → Action（调用外部工具获取信息） → Observation（观察工具返回的真实结果）**，再基于新的观察进入下一轮 Thought！现代大模型的原生多轮 Tool Use，正是把 ReAct 范式直接内化到了 API 协议与模型训练之中。

> **经典论文溯源：ReAct (Yao et al., ICLR 2023)**：ReAct 证明了将内部推理轨迹与外部环境交互交织在一起，能够显著消除思维链中的事实幻觉，并在遇到意外查询结果（如订单已发货或查无此单）时动态调整后续计划。今天几乎所有编码智能体（如 Claude Code、Cursor、Antigravity）的底层主循环都是 ReAct 的工程化变体。

## 4.2 为什么 Agent 循环必须加『双重熔断器』？

一旦你把两次调用改成了 while 循环，就引入了一个新的工程风险：**如果模型陷入死循环怎么办？**比如某个工具返回了模糊的报错，模型不服气，每一轮都用一模一样的参数反复重试查询，如果不加限制，一个请求就能跑几百轮，不仅前端一直转圈超时，还会瞬间烧光你的 API 账单余额！

因此在生产级 AgentRuntime 中，必须同时设置两道硬性预算守卫：

1. 最大模型轮数（max_rounds，如 5 轮）：限制最多往返请求大模型几次；

2. 最大工具调用总次数（max_tool_calls，如 8 次）：因为模型在一轮里可能并发提出 10 个工具调用，单靠轮数限制防不住单轮并发爆炸。任一预算触顶时，Runtime 必须立即熔断并明确报告未收敛，绝不静默假装成功。

## 4.3 一表打通三大主流 API 协议（Adapter 模式）

在实际企业开发中，你今天可能用 OpenAI 或兼容接口（DeepSeek / Qwen / vLLM），明天可能切到 OpenAI 新版 Responses API，后天又想评测 Anthropic Claude 的工具准确率。虽然它们底层都在做同一件事（传工具说明 → 收调用请求 → 按 ID 回传结果），但 JSON 字段名各有各的脾气！

千万不要在业务循环里写满 if fmt == 'chat' elif fmt == 'messages' 的面条代码！在 lab04_agent_loop.py 中，我们定义了统一的 ProtocolAdapter 接口，用三个清爽的子类把差异彻底关进笼子里：

| 协议维度 | OpenAI Chat Completions | OpenAI Responses API | Anthropic Claude Messages |
| --- | --- | --- | --- |
| 请求路径 | POST /chat/completions | POST /responses | POST /messages |
| 系统提示词位置 | messages 首条 role='system' | 顶层 instructions 字段 | 顶层 system 字段 |
| 工具参数规范字段名 | tools[].function.parameters | tools[].parameters (平铺) | tools[].input_schema |
| 模型输出的调用结构 | message.tool_calls[] (arguments 为字符串) | output[] 中 type='function_call' | content[] 中 type='tool_use' (input 已是字典) |
| 工具结果回传格式 | role='tool' + tool_call_id | type='function_call_output' + call_id | role='user' 内嵌 type='tool_result' + tool_use_id |

## 4.4 进阶避坑：流式输出（SSE Streaming）下的工具参数拼接

当你在前端需要打字机流式效果（stream=True）时，大模型不仅会把回答文字切成小碎片推送，连工具调用的参数 JSON 也会切成一段段 delta 碎片发过来——比如第 1 个 chunk 发来 '{"order_'，第 2 个 chunk 发来 'id":"A10'，第 3 个 chunk 发来 '0"}'。

切记：在流式模式下，必须按 index / id 把所有 arguments 碎片拼接到缓冲区里，直到明确收到流结束标志（finish_reason == 'tool_calls' 或 message_stop 事件）后，才能做 json.loads 与业务执行！绝对不能收到半截 chunk 就去调数据库。

## 🔬 专业术语与底层方法显微镜（四步拆解）

### 1. [🔥 工程实战核心] SSE 流式工具参数拼接（Streaming Tool Call Deltas）
- **① 大白话本质**：开启打字机流式模式（stream: true）时，大模型不仅说话是一个词一个词往外蹦，连调用工具的 JSON 字符串也是『切成十几块小碎片』推给你的——你必须拿个篮子按编号把碎片全接齐了，才能拼出完整的 JSON 去查库！
- **② 底层协议与工作机制**：服务端通过 Server-Sent Events (SSE) 推送一连串 data: {...} 事件块。第 1 个块告诉你 tool_calls[0].id = 'call_1'、name = 'query_order'；随后的五六个块里只有 arguments 的几颗字符碎片（比如 '{"ord'、'er_id"'、':"A100"}'）。你的客户端必须用字典按 index 累加字符串，直到收到 finish_reason == 'tool_calls' 信号后才统一 json.loads。
- **③ 标准实现代码（Python · 12 行代码彻底看懂流式工具碎片是怎么拼完整的）**：
```python
buffers: dict[int, dict[str, str]] = {}   # 按流式槽位 index 暂存碎片

for chunk in sse_stream:
    delta = chunk["choices"][0]["delta"]
    for tc in delta.get("tool_calls", []):
        idx = tc["index"]
        buf = buffers.setdefault(idx, {"id": "", "name": "", "arguments": ""})
        if tc.get("id"): buf["id"] = tc["id"]
        if tc.get("function", {}).get("name"): buf["name"] += tc["function"]["name"]
        if tc.get("function", {}).get("arguments"): buf["arguments"] += tc["function"]["arguments"]

# 直到流结束且 finish_reason == 'tool_calls'，此时 buffers[0]['arguments'] 才是完整的 '{"order_id":"A100"}'！
```
- **④ 实现后的真实效果**：实现后效果：用户在网页上既能毫秒级看到模型先输出的安抚话术（如『正在为您核查订单 A100，请稍候…』），后台又能零差错地拼齐完整参数安全触发数据库查询。

## 分步代码拆解：分步代码精读：干净解耦的 AgentRuntime 核心循环

观察当我们用 ProtocolAdapter 屏蔽了厂商格式差异后，核心的 ReAct 循环代码变得多么清晰易读：

### 1 · 统一内部模型 — 定义与任何大模型厂商无关的 3 个纯 Python 数据类。
```python
@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]

@dataclass(frozen=True)
class ToolCall:
    call_id: str
    name: str
    raw_arguments: str | dict[str, Any]

@dataclass
class TurnOutput:
    text: str
    tool_calls: list[ToolCall]
```
- **核心要点**：不管外面接的是 OpenAI、Claude 还是开源模型，进到 Runtime 里统统变成标准的 ToolCall 和 TurnOutput。

### 2 · ReAct 主循环 — 请求模型 → 无工具则收工 → 预算检查 → 执行工具并追加观察结果 → 下一轮！
```python
for round_no in range(1, self.max_rounds + 1):
    req = self.adapter.build_request(model, SYSTEM_PROMPT, history, active_tools)
    raw = self.send_fn(self.adapter.endpoint, req)
    turn = self.adapter.parse_and_record(raw, history)

    if not turn.tool_calls:                 # 收敛条件：模型不再申请工具，直接返回最终答案
        return turn.text, total_calls

    if total_calls + len(turn.tool_calls) > self.max_tool_calls:
        raise RuntimeError("超出最大工具调用预算")

    round_results = []
    for call in turn.tool_calls:
        args = json.loads(call.raw_arguments) if isinstance(call.raw_arguments, str) else call.raw_arguments
        result_payload = self.execute_tool_fn(call.name, args)
        total_calls += 1
        round_results.append((call.call_id, result_payload))

    self.adapter.append_tool_results(history, round_results)  # 把观察结果喂回下一轮
```
- **核心要点**：这就是 LangGraph、OpenAI Agents SDK、Spring AI ChatClient 内部最核心的驱动引擎——现在你每一行都能自己写出来！

## 动手实验：运行 40 行核心 ReAct 循环，观察真实模型自动查订单与查制度 (`labs/lab04_agent_loop.py`)

1. 直接运行 python lab04_agent_loop.py，观察你的真实大模型是『分两轮依次查单和查制度』，还是『在第 1 轮并发提出两个工具调用』。
2. 再试试传入自定义问题查询已发货的 B200，看模型能否根据制度说明『已发货需先办理退货入库』。

```bash
python lab04_agent_loop.py
```

**预期观察结果**：累计调用 query_order 与 read_refund_policy 两项工具，准确指出 A100 金额 299 元满 200 元需人工审批。

## 本章权威参考资料
- [Yao et al. (ICLR 2023) · ReAct Paper](https://arxiv.org/abs/2210.03629) — 提出 Reasoning + Acting 交替推理范式的经典奠基论文
- [OpenAI · Responses API Migration Guide](https://platform.openai.com/docs/guides/responses-vs-chat-completions) — 对比 Chat Completions 与新一代 Responses API 的工具调用差异
- [Anthropic · Messages API Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/implement-tool-use) — Claude tool_use 与 tool_result 官方协议文档

---
[← 上一章](03-tool-execution.md) · [返回目录](../README.md) · [下一章 →](05-enterprise-safety.md)
