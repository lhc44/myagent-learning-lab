# 第 2 章：Function Calling 原理与工具契约（JSON Schema）

> **第一阶段 · 认知跃迁** · 30 分钟 · 配套 lab02_tool_schema.py

上一章我们看到模型能『提议调用工具』。但远在云端的大模型既不能反射扫描你的 Python 源码，也不认识你的业务类，它是怎么知道你有哪些函数、该传什么参数的？本章深入拆解原生 Function Calling 机制与 JSON Schema 工具说明书。

## 本章学习目标
- 理解原生 Function Calling 与『在普通提示词里求模型输出 JSON』的区别
- 准确区分 system、user、assistant、tool 四种消息角色在接口里的作用
- 能够独立编写严密的 JSON Schema 工具说明书，并用 tool_choice 控制调用策略

> [!TIP]
> **🧭 工程师减负指南：本章什么必会？什么不用死磕？**
> - **✅ 工程实战必会**：会写工具的 JSON Schema（名字、清楚的中文描述、字段类型、必填项 required），知道 auto 和 required 模式的区别。
> - **🪶 放心做减法**：服务端底层是怎么靠算法（如状态机屏蔽非法词）锁死 JSON 格式的，属于大模型厂商内部实现，做应用工程只需会开 strict: true 开关即可，不用研究底层算法！

## 从传统 / 单次 LLM API 视角过渡
- **过去熟悉的做法**：早期用大模型做结构化输出：在提示词里反复叮嘱『请务必只返回合法 JSON，不要带 Markdown 代码块！』，然后祈祷 json.loads() 别报错。
- **AI Agent 工程视角**：现代原生 Tool Use：通过 API 的 tools 字段提交 JSON Schema 并加上 strict: true 开关，服务端会自动锁死输出格式，确保拿到的参数结构合法。

> [!WARNING]
> **🎭 真实翻车现场：神秘蒸发的订单前导零 '00128'**
> 一位后端工程师在定义工具 Schema 时，顺手把 order_id 的类型写成了 integer（整数）。平时测 '9527' 一切正常，直到大客户来查编号为 '00128' 的早期订单——大模型乖乖输出了 {"order_id": 128}，前导零在 JSON 整数化瞬间人间蒸发，数据库永远返回『查无此单』！切记：凡是不参与加减乘除的编号、邮编、手机号，Schema 里永远写 string！

## 核心数据流：有无 tools 字段时，同一个问题的模型推理分支对比
| 步骤流向 | 关键动作 | 详细说明 |
| :--- | :--- | :--- |
| `请求对照组 (无 tools)` → `LLM 推理服务` | **仅传 messages** | 模型上下文里没有任何可用能力声明 |
| `LLM 推理服务` → `请求对照组 (无 tools)` | **finish_reason='stop'** | 返回普通 content 文本（拒答或猜测） |
| `请求实验组 (带 tools)` → `LLM 推理服务` | **messages + tools Schema** | 模型在系统上下文中看到 query_order 的名称、描述与参数规范 |
| `LLM 推理服务` → `请求实验组 (带 tools)` | **finish_reason='tool_calls'** | content 为空，返回结构化 tool_calls: [{id, function: {name, arguments}}] |

## 2.1 为什么模型不用写 if/else 就能选对工具？

很多写惯后端路由的同学第一次看到 Function Calling 时会好奇：『我并没有写 if "发货" in question: query_order()，模型是怎么挑中这个函数的？』

这背后由模型厂商在服务端帮你做好了两件事：第一是模型出厂前专门练过海量『看工具说明书选函数、缺信息时追问用户』的样本；第二是当你开启严格模式（`strict: true`）时，大模型服务端会在生成每个字时自动按你的 JSON Schema 做硬性格式约束，直接挡掉缺引号、错字段名的输出！

但请务必保持清醒：**结构 100% 合规 ≠ 业务语义 100% 正确**。受限解码能保证模型一定输出形如 {"order_id": "..."} 的合法 JSON，但如果两个工具的中文描述写得含糊不清、职责高度重叠，模型依然会张冠李戴选错工具，或者把客户手机号误填进订单号字段里。

> **工具描述工程（Tool Prompting）最佳实践**：Anthropic 在 SWE-bench 夺冠经验分享中强调：他们花在打磨『工具描述（Tool Descriptions）』上的精力甚至超过了写主 System Prompt！一份优秀的工具 description 必须像给新入职工程师写 API 文档一样，明确回答三件事：1）它返回什么数据；2）什么场景下应该调用它；3）什么边界情况下绝对不要调用它（例如缺少订单号时应先询问用户）。

## 2.2 四种消息角色：不是随便拼在一起的字符串

在 Agent 协议中，messages 数组里的每条消息都带有明确的 role（角色），服务端会用特殊控制 Token 将它们隔离开来：

• system（或 developer / instructions）：应用开发者下达的最高行为准则与边界说明。

• user：终端用户的输入提问（不可信外部输入，可能包含提示词注入攻击）。

• assistant：大模型自己过去生成的内容——既可能是给用户看的自然语言回复，也可能是它发出的 tool_calls 工具调用申请。

• tool：你的 Runtime 程序执行完本地工具后，将客观业务数据回传给模型的专用通道。

## 2.3 逐行解剖一份严密的 JSON Schema 工具契约

假设你本地写好了 Python 函数 def query_order(order_id: str) -> dict。要把它介绍给大模型，我们需要编写一份 JSON Schema 数据结构放进请求体的 tools 列表中。

初学者常问：『订单号如果是 00128，用 integer 整数类型行不行？』绝对不行！一旦声明为 integer，JSON 解析为数字 128 后前导零就会永久丢失，去数据库里根本查不到 '00128'。凡是编号、手机号、邮编等不做加减乘除运算的标识符，一律声明为 string。

同时请养成工程习惯：显式声明 required 必填字段列表，并加上 additionalProperties: false，明确禁止模型自作聪明塞入你没定义过的参数字段。

## 2.4 用 tool_choice 掌控模型的决策自由度

除了提供 tools 清单，请求体还支持通过 tool_choice 字段精细控制本轮是否允许调工具：

• "auto"（默认且最常用）：交由模型自主判断——问订单就返回 tool_calls，问『什么是 JSON』就直接返回普通文本。

• "none"：即使传了 tools 清单，本轮也严禁模型发起任何工具调用，强制它仅输出文本。

• "required"（或指定具体函数名）：强制模型本轮至少调用一个工具。这在固定流水线（Workflow）抽取结构化参数时很有用，但绝不能用来测试模型『懂不懂何时该用工具』——因为在 required 模式下，哪怕你问它『今天星期几』，它也会被接口逼着硬调一次订单查询并瞎编一个单号！

## 🔬 专业术语与底层方法显微镜（四步拆解）

### 1. [🔥 工程实战核心] strict: true 严格模式（让服务端替你锁死 JSON 格式，不用懂底层算法）
- **① 大白话本质**：以前让大模型输出 JSON 就像『考驾照靠自觉不压线』，偶尔还是会多吐一句废话或漏个引号；加上 strict: true 开关后，相当于在车道两边装了物理护栏——服务端在吐出每个字时都会自动把不符合你 JSON Schema 格式的词挡掉！
- **② 底层协议与工作机制**：工程上你完全不需要关心服务端内部是怎么实现这层护栏的（官方文档里常叫受限解码 Constrained Decoding），你只需要记住开启 strict: true 时的**三条配置口诀**：
1. 在 function 里写上 `"strict": true`；
2. 在 parameters 里写上 `"additionalProperties": false`（禁止乱加字段）；
3. 把 properties 里定义的所有字段名都写进 `required` 数组（如果有可填可不填的参数，把它的类型写成 `["string", "null"]` 即可）。
- **③ 标准实现代码（JSON · 符合 OpenAI 最新 Strict Structured Outputs 规范的工具定义（含可选参数写法））**：
```json
{
  "type": "function",
  "function": {
    "name": "query_order",
    "description": "查询订单实时状态",
    "strict": true,
    "parameters": {
      "type": "object",
      "properties": {
        "order_id": { "type": "string", "description": "必填订单号，如 A100" },
        "include_items": { "type": ["boolean", "null"], "description": "可选：是否返回商品明细，不指定传 null" }
      },
      "required": ["order_id", "include_items"],
      "additionalProperties": false
    }
  }
}
```
- **④ 实现后的真实效果**：实现后效果：模型输出的 function.arguments 永远不会再出现缺右花括号、多塞未定义字段或把 string 写成 number 的格式错误（但注意：如果模型因 max_tokens 太小被半途截断，仍需检查 finish_reason != 'length'）。

### 2. [🔥 工程实战核心] JSON Schema 五大核心关键字逐词拆解
- **① 大白话本质**：如果你平时写 Java Class 或 TypeScript Interface，JSON Schema 其实就是『用 JSON 写出来的接口参数类型声明书』。
- **② 底层协议与工作机制**：下面把工具定义里最常出现的 5 个关键字一次性对照清楚：type 定大类（object/string/integer/boolean/array）；properties 列字段清单；enum 限定只能从固定几个枚举值里选（防止模型乱造状态词！）；required 定必填项；additionalProperties: false 关死后门不准乱加字段。
- **③ 标准实现代码（JSON · 带 enum 枚举约束的高质量参数规范示例）**：
```json
{
  "type": "object",
  "properties": {
    "order_id": { "type": "string" },
    "channel": {
      "type": "string",
      "enum": ["web", "ios", "wechat_mini"],
      "description": "下单渠道，仅限枚举值之一"
    }
  },
  "required": ["order_id", "channel"],
  "additionalProperties": false
}
```
- **④ 实现后的真实效果**：加上 enum 之后，模型绝不会自己发明出 "weixin"、"apple" 这种让后端枚举反序列化报错的野生字符串，只会乖乖从你给定的三个标准值里挑一个。

## 分步代码拆解：分步拆解：从 JSON Schema 定义到三种响应形态

点击切换标签页，对比『工具契约定义』、『无工具响应』与『原生 tool_calls 响应』的精确字段差异：

### 1 · 工具契约 Schema — 传给大模型的纯配置说明书，不包含任何函数实现或数据库密码。
```python
ORDER_TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "query_order",
        "description": "根据订单编号查询实时付款和发货状态。若缺少订单号请先向用户追问。",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "订单唯一编号，如 'A100'"
                }
            },
            "required": ["order_id"],
            "additionalProperties": False,
        },
    },
}
```
- **核心要点**：记住四个关键位置：name（映射名）、description（选工具依据）、properties/required（字段约束）、additionalProperties: False（封闭契约）。

### 2 · 不传 tools 时的响应 — finish_reason 为 'stop'，只有普通文本 content。
```json
{
  "finish_reason": "stop",
  "message": {
    "role": "assistant",
    "content": "当前未挂载订单查询工具，我无法核实 A100 的实时发货状态。"
  }
}
```
- **核心要点**：没有 tools 时，这就是你以前最熟悉的普通聊天补全返回结构。

### 3 · 传入 tools 后的响应 — finish_reason 变为 'tool_calls'，模型输出结构化调用申请！
```json
{
  "finish_reason": "tool_calls",
  "message": {
    "role": "assistant",
    "content": null,
    "tool_calls": [
      {
        "id": "call_a100_01",
        "type": "function",
        "function": {
          "name": "query_order",
          "arguments": "{\"order_id\":\"A100\"}"
        }
      }
    ]
  }
}
```
- **核心要点**：仔细看两点：1) finish_reason 明确告诉你它停下来等工具结果了；2) function.arguments 是一个 JSON 格式的字符串（String），下一章我们要先 json.loads 解析它！

## 动手实验：用真实大模型对比有无 tools 以及 auto vs required 的返回报文 (`labs/lab02_tool_schema.py`)

1. 直接执行 python lab02_tool_schema.py，依次走完 Step 1 (Schema)、Step 2 (有无工具对照) 与 Step 3 (auto vs required)。
2. 对比 Step 2A 与 Step 2B 打印出的真实响应 choices[0]，确认 finish_reason 和 tool_calls 的变化。
3. 观察 Step 3B：当问『用一句话解释什么是 JSON？』却指定 tool_choice='required' 时，看看真实模型是如何被迫硬凑一个工具调用的。

```bash
python lab02_tool_schema.py
```

**预期观察结果**：在 auto 模式下，问 A100 会触发 query_order 调用申请，问 JSON 则直接文字回答；而在 required 模式下，哪怕问技术概念也会被迫产出 tool_calls。

## 本章权威参考资料
- [OpenAI · Function Calling & Structured Outputs](https://platform.openai.com/docs/guides/function-calling) — 详解 tools、tool_choice 与 strict JSON Schema 规范
- [JSON Schema Official Understanding Guide](https://json-schema.org/understanding-json-schema) — JSON Schema 字段类型与约束标准手册
- [Anthropic · Tool Use Documentation](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview) — Claude 工具定义与描述工程官方指南

---
[← 上一章](01-llm-to-agent.md) · [返回目录](../README.md) · [下一章 →](03-tool-execution.md)
