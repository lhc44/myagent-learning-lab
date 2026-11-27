# 第 3 章：单轮工具执行闭环与四层错误防御

> **第二阶段 · 核心机制** · 35 分钟 · 配套 lab03_tool_execution.py

拿到大模型返回的 tool_calls 之后，许多教程直接写一句 eval 或 func(**json.loads(args)) 就草草了事——这在真实后端工程中极其危险！本章手把手带你构建带『四层防御体系』的工具注册中心（Tool Registry），并彻底搞懂 tool_call_id 如何把两轮 HTTP 请求严丝合缝地扣成闭环。

## 本章学习目标
- 理解无状态 HTTP 下『把 assistant(tool_calls) 与 role=tool 消息一并重发』的上下文拼装规则
- 分清 call_id（模型单次调用关联号）与业务主键（如 order_id）的职责差异
- 独立实现生产级执行器的四层错误拦截：JSON 语法错、工具未注册、参数类型错、业务查无记录

> [!TIP]
> **🧭 工程师减负指南：本章什么必会？什么不用死磕？**
> - **✅ 工程实战必会**：掌握两轮消息闭环：把模型刚发的 assistant(tool_calls) 和你查完库的 role='tool' 消息（带上同一个 tool_call_id）一起发回给模型；做好参数白名单与类型检查。
> - **🪶 放心做减法**：本章全是纯粹的后端接口拼装与防御性编程（if 判断 + 字典查找 + try/except），零算法、零数学。

## 从传统 / 单次 LLM API 视角过渡
- **过去熟悉的做法**：写普通 Web Controller 参数校验：用 Pydantic / Spring Validation 拦住前端非法传参，校验不过直接返回 HTTP 400 给浏览器。
- **AI Agent 工程视角**：写 Agent Tool Executor：大模型就是那个『可能传错参数的调用方』！校验拦截后不要直接让进程崩溃退出，而是把清晰的错误说明封装进 role='tool' 消息回传给模型，让模型自我修正或如实告知用户。

> [!WARNING]
> **🎭 真实翻车现场：一行 getattr 反射写出的『删库后门』**
> 有开发者嫌写 ToolRegistry 字典映射麻烦，偷懒写了一行：getattr(order_service, tool_name)(**args)。结果攻击者在对话框诱导模型输出了内部维护方法名 purge_expired_cache，直接跨过了所有公开接口限制！工具分发永远只能查显式白名单字典，严禁动态反射调用类上未公开登记的方法。

## 核心数据流：单轮工具执行闭环中 messages 数组的精确生长过程
| 步骤流向 | 关键动作 | 详细说明 |
| :--- | :--- | :--- |
| `第 1 轮发送` → `messages 长度 = 2` | **[system, user]** | 包含系统规则与用户问题『请查询 A100 的状态』 |
| `第 1 轮返回` → `assistant(tool_calls)` | **获得 id='call_tx_9001'** | 模型申请调用 query_order('{"order_id": "A100"}') |
| `本地拦截与执行` → `ToolRegistry` | **四层防线校验 → SQLite** | 解析 JSON → 核对白名单 → 核对 str 类型 → 查出 paid/pending |
| `第 2 轮发送` → `messages 长度 = 4` | **[system, user, assistant, tool]** | 原样保留第 1 轮的 assistant 消息，并紧跟 tool_call_id='call_tx_9001' 的结果消息！ |
| `第 2 轮返回` → `最终自然语言回答` | **finish_reason='stop'** | 模型综合第 4 条消息中的客观数据，输出通顺准确的中文答复 |

## 3.1 一个关键真相：大模型并没有在云端『挂起线程等你』

刚学 Agent 的同学常有一个错觉：以为第 1 次请求返回 tool_calls 时，云端大模型像打断点一样停在半空中等着你喂结果，所以第 2 次请求只要发一条工具结果过去就行了。如果你真的只发一条 [{"role": "tool", ...}]，服务端会立刻报 HTTP 400 错误！

原因很简单：主流大模型推理接口本质上是无状态的（Stateless）。第 1 次 HTTP 响应结束的那一毫秒，云端显卡早就去处理别人的请求了。因此第 2 次请求时，你必须把**完整的前因后果**按顺序排好一并发过去：[system, user, assistant(含刚才的 tool_calls), tool(含刚查出的结果)]。模型相当于快速重读一遍剧本：『哦，用户刚才问了 A100，我刚才申请调了 query_order，现在工具把结果贴在下面了，那我现在可以回答用户了！』

## 3.2 为什么要设计 tool_call_id？并发调用时的精确对号入座

细心观察第 2 章的返回报文，你会发现每个工具调用都有一个类似 "id": "call_tx_9001" 的唯一标识。当模型一次性并行提出多个调用（比如同时查 A100 和 B200 两笔订单）时，你的代码回传两条 role="tool" 消息，全靠各自的 tool_call_id 与上面的调用一一配对。

切记两个工程细节：第一，tool_call_id 必须原封不动回传模型给你的那个 id，千万不要把它填成订单号 'A100'；第二，assistant 消息里提出几个 tool_calls，后面就必须紧跟几条对应 tool_call_id 的 tool 消息，少一条或顺序乱穿插都会触发 API 协议校验失败。

## 3.3 生产级执行器的『四层错误防御漏斗』

大模型传过来的 function.name 和 function.arguments 本质上是『不可信的外部字符串输入』。我们在 lab03_tool_execution.py 中构建了标准的四层防御：

• 第一层（invalid_json）：模型输出因 max_tokens 太小被半路截断，生成了 '{"order_id": "A100"'（缺右花括号）。json.loads 直接捕获，绝不往下走。

• 第二层（unknown_tool）：模型出现幻觉编造了一个 delete_all_orders 工具名。ToolRegistry 查白名单字典不存在，立即拦截——绝不能用 getattr(service, name) 反射调用任意方法！

• 第三层（invalid_arguments）：JSON 语法合法，但模型传了数字 {"order_id": 100} 甚至布尔值 {"order_id": true}。注意 Python 中 isinstance(True, int) 居然是 True！所以我们用严格的 type(val) is expected_type 校验字段集合与精确类型。

• 第四层（not_found）：前三关全过，SQLite 真正执行了 SELECT，但库里没有 Z999 这笔单号。注意：这不是代码报错，而是合法的业务查询结果（found=False）！

| 错误层级 | 错误码示例 | 是否已访问数据库？ | 回传给模型后的期望行为 |
| --- | --- | --- | --- |
| 第 1 层：JSON 语法损坏 | invalid_json | 否（解析阶段拦截） | 检查 max_tokens 是否过小，或让模型重新生成合法 JSON |
| 第 2 层：工具未注册 | unknown_tool | 否（白名单注册表拦截） | 模型意识到无此工具，改用合法工具或说明能力边界 |
| 第 3 层：参数契约不符 | invalid_arguments | 否（Schema 校验拦截） | 模型阅读类型错误提示（如数字改字符串），自动修正参数重试 |
| 第 4 层：业务查无此单 | not_found | 是（SQL 已安全执行） | 模型停止重试，诚实告知用户订单号不存在，请核对输入 |

## 🔬 专业术语与底层方法显微镜（四步拆解）

### 1. [🔥 工程实战核心] 并行工具调用（Parallel Function Calling）与 tool_call_id 配对机制
- **① 大白话本质**：当用户一句话问两件事：『帮我同时查一下 A100 和 B200 哪个发货了』，聪明的大模型不会傻乎乎分两轮查，而是在同一条回复里一次性甩出两张『派工单』，每张派工单右上角印着不同的流水号（id）！
- **② 底层协议与工作机制**：模型返回的 assistant.tool_calls 数组此时包含 2 个元素（例如 id 分别为 call_01 和 call_02）。你的程序必须把这两个调用全部执行完，并在后面紧跟 2 条 role='tool' 消息，分别填上 tool_call_id='call_01' 和 tool_call_id='call_02'。哪怕其中一个查库报错了，也必须给那个 id 回传一条错误说明——如果只回了 1 条而漏掉另 1 条，下一次请求大模型 API 会直接报 400 InvalidRequestError（缺少匹配的 tool 输出）！
- **③ 标准实现代码（JSON · 单轮并发调用 2 个工具时的完整消息配对长相）**：
```json
[
  { "role": "user", "content": "对比一下 A100 和 B200 的发货状态" },
  {
    "role": "assistant",
    "content": null,
    "tool_calls": [
      { "id": "call_01", "type": "function", "function": { "name": "query_order", "arguments": "{\"order_id\":\"A100\"}" } },
      { "id": "call_02", "type": "function", "function": { "name": "query_order", "arguments": "{\"order_id\":\"B200\"}" } }
    ]
  },
  { "role": "tool", "tool_call_id": "call_01", "content": "{\"order_id\":\"A100\",\"shipping\":\"pending\"}" },
  { "role": "tool", "tool_call_id": "call_02", "content": "{\"order_id\":\"B200\",\"shipping\":\"shipped\"}" }
]
```
- **④ 实现后的真实效果**：实现后效果：两次查库可以在本地并发或连续瞬间跑完，只需往返大模型 2 次（而非 3 次）就能同时回答两笔订单的对比结果，端到端延迟直接省掉三分之一！

### 2. [🔥 工程实战核心] 错误即观察（Error-as-Observation）自愈机制
- **① 大白话本质**：传统程序调接口传错参数会直接 throw Exception 崩掉整个请求；而在 Agent 循环里，我们把校验报错包装成『一条友好的中文提示 JSON』顺着 tool 消息传回给大模型，让大模型像程序员看编译器报错一样自己改对了再调一次！
- **② 底层协议与工作机制**：无论是 OpenAI 的 role='tool' 内容字符串，还是 Anthropic Claude 专门提供的 tool_result.is_error = True 字段，本质都是告诉模型：『你刚才这次调用没成功，具体原因是 XXX』。只要错误原因写得具体（如『日期格式应为 YYYY-MM-DD，你传成了 2026/11/25』），模型在下一轮有极高概率自动修正格式。
- **③ 标准实现代码（Python · 把异常转化为可供模型阅读并自我修正的结构化返回）**：
```python
if not re.match(r"^[A-Z]\d{3,}$", order_id):
    # 不要 raise 导致主进程崩溃！返回清晰修正指引给模型：
    return {
        "ok": False,
        "error_type": "invalid_format",
        "message": f"订单号 '{order_id}' 格式不合法：必须以大写字母开头加至少3位数字（如 A100）。若用户口误输入了小写 a100，请转为大写重试。"
    }
```
- **④ 实现后的真实效果**：实现后效果：当用户在聊天框随手敲小写『查一下 a100』而模型第一次原样传了 'a100' 被拦住后，模型读到这段报错，第 2 轮会自动改成 'A100' 查出结果，终端用户甚至感觉不到中间发生过一次自愈！

## 分步代码拆解：分步代码追踪：ToolRegistry 与两轮消息拼装

点击下方步骤，逐段读懂 lab03_tool_execution.py 是如何把安全校验与消息拼装写得既严密又干净的：

### Step 1 · 白名单注册表 — 用 dataclass 显式绑定函数名、Schema、期望类型与真实处理函数。
```python
@dataclass(frozen=True)
class RegisteredTool:
    name: str
    schema: dict[str, Any]
    required_types: dict[str, type]
    handler: Callable[..., dict[str, Any]]

registry = ToolRegistry()
registry.register(RegisteredTool(
    name="query_order",
    schema=ORDER_TOOL_SCHEMA,
    required_types={"order_id": str},
    handler=orders.query_order,   # 只传入函数引用，此时并未调用！
))
```
- **核心要点**：在 Python 中函数是一等公民（类似 Java 的方法引用 orders::queryOrder），只有注册进字典的函数才可能被调用。

### Step 2 · 四层防御校验 — 先挡住坏 JSON、假工具、错类型，最后才放行进数据库。
```python
try:
    parsed_args = json.loads(raw_arguments)                # 防线 1: JSON 语法
except (json.JSONDecodeError, TypeError):
    return {"ok": False, "error_type": "invalid_json"}

tool = self._tools.get(tool_name)                          # 防线 2: 白名单查找
if tool is None:
    return {"ok": False, "error_type": "unknown_tool"}

if not isinstance(parsed_args, dict) or set(parsed_args) != set(tool.required_types):
    return {"ok": False, "error_type": "invalid_arguments"}
for k, t in tool.required_types.items():                   # 防线 3: 精确类型检查
    if type(parsed_args[k]) is not t:
        return {"ok": False, "error_type": "invalid_arguments"}

return {"ok": True, "data": tool.handler(**parsed_args)}   # 防线 4: 执行业务查询
```
- **核心要点**：**parsed_args 表示把校验干净的字典按关键字参数展开传给 handler，等价于 orders.query_order(order_id='A100')。

### Step 3 · 关联 ID 拼回历史 — 保留 assistant 原消息 + 追加带 tool_call_id 的 tool 消息 → 发第 2 轮请求。
```python
# 1. 必须先把模型刚才包含 tool_calls 的 assistant 消息追加进历史
messages.append({
    "role": "assistant",
    "content": assistant_msg.get("content"),
    "tool_calls": tool_calls,
})

# 2. 逐一执行并按原 call['id'] 追加 role='tool' 结果
for call in tool_calls:
    result = registry.execute_safely(call["function"]["name"], call["function"]["arguments"])
    messages.append({
        "role": "tool",
        "tool_call_id": call["id"],
        "content": json.dumps(result, ensure_ascii=False),
    })

# 3. 带着 4 条完整上下文再次请求模型，获取最终自然语言答复
resp2 = post_json(base_url, "/chat/completions", api_key, "chat", {"model": model, "messages": messages})
```
- **核心要点**：只要看懂这三段代码，你就已经亲手打通了 Function Calling 从模型到数据库再回到模型的全部任督二脉！

## 动手实验：演练四层错误拦截器并走通真实大模型两轮消息闭环 (`labs/lab03_tool_execution.py`)

1. 执行 python lab03_tool_execution.py，先观察 Step 1 五组固定输入分别触发哪一层防线（正常、invalid_json、unknown_tool、invalid_arguments、not_found）。
2. 接着观察 Step 2 打印出的『准备发往第 2 轮请求的完整 messages（共 4 条）』，核对第 3 条里的 id 与第 4 条里的 tool_call_id 是否完全一致。

```bash
python lab03_tool_execution.py
```

**预期观察结果**：前三种异常均在访问 SQLite 之前被精准拦截；Z999 正常访问数据库并返回 found=False；两轮真实往返后准确输出订单 A100 的金额与状态。

## 本章权威参考资料
- [OpenAI · Handling Function Calls & Errors](https://platform.openai.com/docs/guides/function-calling#handling-function-calls) — 官方关于 tool_call_id 配对与 finish_reason 检查的规范说明
- [Anthropic · Handling Tool Calls & is_error](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/handle-tool-calls) — 工具执行错误回传让模型自愈的工程模式

---
[← 上一章](02-tool-schema.md) · [返回目录](../README.md) · [下一章 →](04-react-agent-loop.md)
