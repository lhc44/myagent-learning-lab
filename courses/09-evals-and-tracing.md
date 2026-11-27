# 第 9 章：Agent 工程化评估（Evals）与全链路可观测性

> **第四阶段 · 复杂系统与落地** · 35 分钟 · 配套 lab08_eval_harness.py

很多团队做 Agent 原型只花三天，上线前却痛苦挣扎三个月——因为每次改了一句提示词、升级了模型版本或新增了一个工具，原本测得好好的问题突然开始乱调工具或胡说八道！本章教你告别凭感觉试聊的『玄学调优（Vibe Check）』，建立基于 Trace 全链路追踪与自动化回归评测集（Eval Harness）的科学工程闭环。

## 本章学习目标
- 分清『确定性单元测试（Unit Test）』与『概率性智能体评估（Agent Eval）』各自检验的对象
- 掌握参考 BFCL 标准的五大评估维度：选工具准确率、参数精确度、抗幻觉忠实度、免工具直答率与缺参澄清率
- 读懂并扩展 lab08_eval_harness.py，用同一套评测基准秒级揪出模型的偷懒与幻觉缺陷

> [!TIP]
> **🧭 工程师减负指南：本章什么必会？什么不用死磕？**
> - **✅ 工程实战必会**：养成一个好习惯：准备 10~30 个代表性的测试问题（正常查单、单号不存在、没给单号、闲聊问题、需要查两步的问题），每次改提示词或换模型时用脚本批量跑一遍，既看最终回答，也检查它中间调没调对工具。
> - **🪶 放心做减法**：不需要搞复杂的学术排行榜指标体系——你在业务里写几个贴合自己场景的 if 判断检查脚本（就像 lab08 那样），比任何高大上的评测理论都管用！

## 从传统 / 单次 LLM API 视角过渡
- **过去熟悉的做法**：传统软件靠单元测试断言 assert add(2, 3) == 5，跑一次绿了就永远是绿的；而刚接触 AI 的同学改完 Prompt 后只手工问两句『A100 发货没』，看着通顺就敢发版上线。
- **AI Agent 工程视角**：双层质量保障体系：第一层用 unittest 100% 锁死你的 Runtime、权限网关与参数校验等确定性代码；第二层构建涵盖正例、反例、缺参、无关问题与越权诱导的固定评测集（Eval Suite），每次变更自动跑分对比轨迹！

> [!WARNING]
> **🎭 真实翻车现场：为了省一半成本换小模型，『凭感觉试聊』酿大祸**
> 某售后团队为了降本，把线上主力模型换成了参数量更小的轻量模型，上线前工程师手工问了三个正常订单，看回答挺利索就发版了。没想到小模型在遇到复杂退款咨询时，学会了『跳过 read_refund_policy 直接拍脑袋答应退全款』——如果当时有本章 lab08 里哪怕 5 道题的轨迹评测集，发版前 3 秒钟就能拦下这次事故！

## 核心数据流：不要只评最终那句回答！端到端轨迹评估（Trajectory Evaluation）视角
| 步骤流向 | 关键动作 | 详细说明 |
| :--- | :--- | :--- |
| `测试用例输入` → `AgentTrace (trace_id)` | **开启全链路追踪** | 记录每个 Span 的输入、输出、耗时(ms) 与 Token 用量 |
| `检查点 1 · 工具路由` → `called_tools 列表` | **该调的是否全调了？不该调的是否忍住了？** | 例：问退款资格必须先后调用 query_order 与 read_refund_policy，缺一不可！ |
| `检查点 2 · 参数契约` → `tool arguments` | **单号是否精确提取？有无瞎猜？** | 例：用户没给单号时，called_tools 必须为空，严禁瞎猜 'A100' |
| `检查点 3 · 结果忠实度` → `final_answer vs tool output` | **回答是否严格忠于工具返回？** | 例：查出 Z999 不存在时如实告知；金额满 200 元必须提及人工审批 |

## 9.1 为什么只看『最终回答通不通顺』会害死生产系统？

来看一个真实发生过的线上事故案例：用户问『我的订单 A100 能不能直接退钱？』，一个偷懒的模型只调用了 query_order('A100')，看到未发货，压根没去调用 read_refund_policy() 查制度，就凭常识输出了一句极其流畅礼貌的回答：『您的订单尚未发货，完全可以立即全额秒退，我已经帮您处理好啦！』

如果你只人工扫一眼这句话的语气是否自然，你甚至会给它打满分！但实际上它连续犯了两个致命错误：第一，漏掉了必查的制度证据（299 元满 200 元其实需要人工审批）；第二，产生了不存在的执行承诺。因此评估 Agent 时，**必须同时断言中间的工具调用轨迹（Trajectory）与最终回答的事实忠实度（Faithfulness）**！

## 9.2 参考 BFCL 思想：构建五维黄金评测矩阵

加州大学伯克利分校维护的 **BFCL（Berkeley Function Calling Leaderboard）** 是全球衡量大模型工具调用能力最权威的学术与工业基准之一。借鉴其核心评测分类法，即使你的业务初期只有 20~50 条评测样本，也必须覆盖以下五种典型题型，缺一不可：

| 评测维度 | 典型测试提问示例 | 合格判定标准（Pass Criteria） | 常见失败坏味道 |
| --- | --- | --- | --- |
| 1. 精准单步调用 | 『帮我查订单 A100 发货没』 | 精确调用 query_order({'order_id':'A100'})，回答与库表一致 | 选错工具或单号提取带多余空格 |
| 2. 抗幻觉诚实度 | 『查一下订单 Z999 到哪了』 | 调用查询收到 found=False 后，明确告知未找到该单号 | 工具返回不存在，模型却编造物流信息 |
| 3. 防过度调用 (Irrelevance) | 『Python 里的 dict 和 JSON 啥区别』 | called_tools 为空列表 []，直接给出通识回答 | 强行把 'PYTHON' 当订单号去查一次数据库 |
| 4. 缺参主动澄清 | 『我昨天买的东西发货了吗？』 | 不调任何工具，礼貌追问用户提供订单编号 | 模型擅自盲猜一个默认单号去调接口 |
| 5. 多步证据链完备性 | 『订单 A100 现在能不能申请退款？』 | 完整调用订单查询 + 制度读取两项工具，指出需人工审批 | 只查订单漏查制度，拍脑袋承诺直接秒退 |

## 9.3 全链路可观测性（Tracing）：出问题时 10 秒定位根因

当线上用户反馈某次回答不对时，如果后台只有一句最终报错，你根本分不清是『RAG 没搜到文档』、『模型选错了工具』、『参数校验被拦了』还是『下游订单接口超时了』。通过为每次请求生成唯一的 `trace_id`，并将每一轮模型调用（`llm_call`）和每一次工具执行（`tool_exec`）记录为带耗时的 `Span`（生产中可直接对接 OpenTelemetry 标准协议），任何异常都能在几秒内精准定位到具体哪一轮、哪条消息！

隐私安全提醒：线上记录 Trace 日志时，务必对 Authorization 密钥、用户身份证号、手机号等敏感字段做脱敏掩码（Redaction），不要原样明文落盘。

## 🔬 专业术语与底层方法显微镜（四步拆解）

### 1. [🔥 工程实战核心] OpenTelemetry 调用链树（Trace & Span）到底长什么样？
- **① 大白话本质**：如果用户抱怨『刚才问了一句等了 9 秒钟还答错了』，只看一行最终日志就像盲人摸象。**Trace（整条调用链）** 和 **Span（每一个子步骤的时间跨度条）** 就像浏览器 F12 网络面板里的瀑布图，把 9 秒钟精确拆解到每一轮推理和每一次查库上！
- **② 底层协议与工作机制**：一次用户请求对应一个全局唯一的 `trace_id`；里面的第 1 轮大模型请求、本地 SQLite 查询、第 2 轮大模型请求各自是一个带起止时间戳、耗时、输入输出摘要与 `gen_ai.usage.input_tokens` 指标的 `Span`。
- **③ 标准实现代码（Text · 一眼定位线上慢查询与幻觉根因的 Trace 瀑布图示意）**：
```text
Trace [tr_8f92a10c] Question: "A100 能申请退款吗？"  Total: 3420 ms | Status: OK
 ├─ Span 1 [llm_call]  POST /chat/completions (Round 1)   1180 ms | in=210, out=24 tokens -> call query_order('A100')
 ├─ Span 2 [tool_exec] OrderSystem.query_order('A100')       3 ms | result={'payment':'paid','shipping':'pending'}
 ├─ Span 3 [llm_call]  POST /chat/completions (Round 2)    960 ms | in=285, out=20 tokens -> call read_refund_policy()
 ├─ Span 4 [tool_exec] OrderSystem.read_refund_policy()      1 ms | result={'doc_id':'P1', ...}
 └─ Span 5 [llm_call]  POST /chat/completions (Round 3)   1276 ms | in=390, out=68 tokens -> final answer
```
- **④ 实现后的真实效果**：实现后效果：运维与研发一眼就能看清——本地 SQLite 两次查询加起来只花了 4 毫秒，99.8% 的时间花在三次串行请求大模型上！优化方向立刻明确（例如提示模型在第一轮并行发起两个只读调用，直接省掉一整轮 1 秒多的往返）。

### 2. [🔥 工程实战核心] 怎么给 Agent 测稳定性：代码检查（Code Grader）与连续运行测试
- **① 大白话本质**：Agent 的回答每次措辞都略有不同，怎么自动判断合不合格？核心原则很简单：『调没调对工具、单号对不对』直接用几行 Python if 判断检查；至于大模型偶尔抽风的问题，把同一个测试题连跑 5 次看能不能全过！
- **② 底层协议与工作机制**：因为大模型输出带一定随机性，跑 1 次碰巧成功不代表线上稳。在真实上线前，把关键业务题连续跑 5 次（比如 5 次里哪怕错 1 次，线上每 5 个客户就会有 1 个踩坑），重点要求涉及资金与权限的安全测试题必须 5 次全过（100% 稳定）。
- **③ 标准实现代码（Python · 组合硬性轨迹断言与多次采样稳定率统计）**：
```python
def evaluate_stability(run_once_fn, case, trials: int = 5) -> float:
    """连续运行 trials 次，计算全部通过的严格生产稳定率。"""
    successes = sum(1 for _ in range(trials) if case.check_fn(run_once_fn(case.question))[0])
    return successes / trials   # 生产核心交易场景要求关键安全用例稳定率必须 = 1.0 (100%)
```
- **④ 实现后的真实效果**：实现后效果：把『我觉得新提示词好像更聪明了』的主观争论，变成了每次发版前清晰客观的 `轨迹准确率 96% -> 99%，安全拒止率 100%` 量化成绩单。

## 分步代码拆解：分步代码精读：不到 60 行搭建你自己的 Agent 评测框架

查看 lab08_eval_harness.py 如何用纯 Python 定义 Trace 轨迹收集器与多维断言检查函数：

### 1 · 记录 Trace 与 Span — 把单次运行中调用过的所有工具、参数、耗时与最终回答打包成结构化 AgentTrace。
```python
@dataclass
class Span:
    step_type: str        # 'llm_call' 或 'tool_exec'
    name: str
    duration_ms: float
    detail: dict[str, Any]

@dataclass
class AgentTrace:
    trace_id: str
    question: str
    final_answer: str = ""
    called_tools: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    spans: list[Span] = field(default_factory=list)
```
- **核心要点**：有了 AgentTrace 对象，评测函数就可以直接检查 trace.called_tools 而不只是看文本字符串了！

### 2 · 编写轨迹断言用例 — 同时检查『工具调用序列』与『回答关键事实』。
```python
EvalCase(
    case_id="EVAL-05",
    category="多步证据链完备性",
    question="订单 A100 现在能不能申请退款？",
    check_fn=lambda t: (
        [name for name, _ in t.called_tools] == ["query_order", "read_refund_policy"]
        and "审批" in t.final_answer,
        "必须先后查验订单实时状态与退款制度两项证据，并指出满 200 元需人工审批",
    ),
)
```
- **核心要点**：当我们在 --flawed 模式下注入一个漏查制度的模型时，这条断言会立刻亮红灯 FAIL 并指出缺失步骤！

## 动手实验：直接用你的真实大模型跑完 5 题自动化评测集，打出真实成绩单 (`labs/lab08_eval_harness.py`)

1. 直接执行 python lab08_eval_harness.py，脚本会依次用你的真实大模型跑完 EVAL-01 至 EVAL-05 五道经典考题。
2. 重点核对每道题的『实际调用工具轨迹』与耗时：看看你的模型在通识题有没有忍住不调工具、缺单号有没有主动追问、问退款有没有同时查订单和查制度！
3. 动手小挑战：试着把 AGENT_MODEL 换成另一个模型重跑一遍，对比两个模型的真实得分和平均耗时！

```bash
python lab08_eval_harness.py
```

**预期观察结果**：终端逐题打印真实轨迹、耗时和 PASS/FAIL 判定，最后输出 5 题总通过率成绩单。

## 本章权威参考资料
- [Berkeley Function Calling Leaderboard (BFCL)](https://gorilla.cs.berkeley.edu/leaderboard.html) — 全球最权威的函数调用与多轮工具选择评估排行榜及测试集分类方法
- [OpenTelemetry · GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — 云原生可观测性标准组织制定的大模型与智能体 Trace/Span 字段规范
- [Anthropic · Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — 如何从零搭建实用、高信噪比的智能体评估体系

---
[← 上一章](08-skills-and-orchestration.md) · [返回目录](../README.md) · [下一章 →](10-frameworks-and-production.md)
