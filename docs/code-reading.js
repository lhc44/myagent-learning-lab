/* 逐章配套 Python 实验源码精读与跨语言语法对照提示 */
window.CODE_READING = {
  "1": {
    files: ["lab01_llm_vs_agent.py", "common.py"],
    intro: "第 1 章配套代码故意把『纯大模型调用』、『纯数据库查询』和『最小 Agent 闭环』拆成三个并列的函数（step1 / step2 / step3）。即使你平时主要写 Java / Go / TS，也能在 5 分钟内顺畅读完。",
    pythonTips: [
      ["Callable[[list[dict]], str]", "类型注解：表示一个接收消息列表、返回字符串的函数对象（类似 Java 的 Function<List<Map>, String>），方便在离线模拟函数与真实 HTTP 请求函数之间自由切换。"],
      ["f\"订单 {fact['order_id']}\"", "Python 的 f-string 格式化字符串，花括号内可直接嵌入变量或字典取值，等价于 JS 模板字符串 `${...}`。"]
    ],
    blocks: [
      {
        title: "公共底座：确定性的内存 SQLite 订单服务",
        file: "common.py",
        code: "def query_order(self, order_id: str) -> dict[str, Any]:\n    row = self.db.execute(\n        \"SELECT order_id, customer, amount_yuan, payment_status, shipping_status \"\n        \"FROM orders WHERE order_id = ?\",\n        (order_id,),\n    ).fetchone()\n    if row is None:\n        return {\"found\": False, \"order_id\": order_id, \"message\": \"未找到该订单编号，请核对输入。\"}\n    return {\n        \"found\": True,\n        \"order_id\": row[0],\n        \"customer\": row[1],\n        \"amount_yuan\": row[2],\n        \"payment_status\": row[3],\n        \"shipping_status\": row[4],\n    }",
        explain: [
          "这段函数完全不涉及任何 AI，就是你最熟悉的数据库参数化查询（使用 ? 占位符防止 SQL 注入）。",
          "无论是第 1 章的最小 Agent，还是第 4 章的多轮 ReAct、第 6 章的 MCP Server，底层真正查订单数据的都是这个确定性函数。"
        ]
      }
    ]
  },
  "2": {
    files: ["lab02_tool_schema.py", "common.py"],
    intro: "第 2 章重点阅读 lab02_tool_schema.py 中的 build_chat_request 函数：看清 tools 和 tool_choice 是如何挂载到标准 /chat/completions 请求体上的。",
    pythonTips: [
      ["dict[str, Any]", "带类型提示的 Python 字典，序列化（json.dumps）后就是标准 JSON 对象；注意 Python 里的布尔值 True/False 和空值 None 在转成 JSON 时会自动变成小写的 true/false 和 null。"],
      ["argparse", "Python 标准库命令行解析器，支持我们在终端传入 compare、choice 或 --mock 等不同实验开关。"]
    ],
    blocks: [
      {
        title: "用同一个组装函数对比『有工具』与『无工具』",
        file: "lab02_tool_schema.py",
        code: "def build_chat_request(\n    model: str,\n    question: str,\n    with_tools: bool = True,\n    tool_choice: str | None = None,\n    legacy_max_tokens: bool = False,\n) -> dict[str, Any]:\n    token_field = \"max_tokens\" if legacy_max_tokens else \"max_completion_tokens\"\n    body: dict[str, Any] = {\n        \"model\": model,\n        \"messages\": [\n            {\"role\": \"system\", \"content\": SYSTEM_PROMPT},\n            {\"role\": \"user\", \"content\": question},\n        ],\n        token_field: 512,\n    }\n    if with_tools:\n        body[\"tools\"] = [ORDER_TOOL_SCHEMA]\n        if tool_choice is not None:\n            body[\"tool_choice\"] = tool_choice\n    return body",
        explain: [
          "控制变量法是调试 Agent 最好的习惯：保持 model、SYSTEM_PROMPT、question 完全不变，只开关 with_tools 或切换 tool_choice，就能一眼看清接口返回结构的变化。"
        ]
      }
    ]
  },
  "3": {
    files: ["lab03_tool_execution.py"],
    intro: "第 3 章聚焦 ToolRegistry.execute_safely 与 run_single_roundtrip 两个函数。注意看代码中为什么用 type(val) is expected_type 而不是 isinstance。",
    pythonTips: [
      ["type(x) is str", "在 Python 中 bool 是 int 的子类，所以 isinstance(True, int) 会返回 True！在严格校验 JSON Schema 参数类型时，使用 type(val) is expected_type 可以防止布尔值蒙混过关变成整数 1 或 0。"],
      ["@dataclass(frozen=True)", "Python 数据类装饰器，自动生成构造函数 __init__，frozen=True 表示实例创建后不可修改（类似 Java 16+ 的 record）。"]
    ],
    blocks: [
      {
        title: "为什么把业务查无记录（not_found）标为 ok=True？",
        file: "lab03_tool_execution.py",
        code: "business_data = tool.handler(**parsed_args)\nif business_data.get(\"found\") is False:\n    return {\n        \"ok\": True,\n        \"error_type\": \"not_found\",\n        \"data\": business_data,\n    }\nreturn {\"ok\": True, \"error_type\": None, \"data\": business_data}",
        explain: [
          "协议/校验错误（ok=False）意味着调用本身不合规，数据库根本没跑；而查无此单（ok=True, error_type='not_found'）意味着查询已成功执行，客观事实就是『库里没有这个单号』。区分这两者在生产监控报警中至关重要——用户输入错单号不应该触发后端代码异常报警！"
        ]
      }
    ]
  },
  "4": {
    files: ["lab04_agent_loop.py"],
    intro: "第 4 章展示了如何用面向对象多态（ProtocolAdapter 子类）保持核心 AgentRuntime 循环的干净整洁。阅读时先看 AgentRuntime.run，再对比三个 Adapter 子类。",
    pythonTips: [
      ["列表推导式 [expr for x in items if cond]", "Python 简洁构造新列表的语法，等价于 Java Stream 的 items.stream().filter(...).map(...).toList()。"],
      ["tuple[str, int] 解包", "answer, call_count = runtime.run(...) 可以一次性接收函数返回的两个值，无需专门定义一个 Wrapper 返回类。"]
    ],
    blocks: [
      {
        title: "对比 OpenAI 与 Anthropic 回传工具结果时的细微差异",
        file: "lab04_agent_loop.py",
        code: "# OpenAI Chat Completions：每条结果是一条独立的 role='tool' 顶层消息\nfor call_id, payload in results:\n    history.append({\"role\": \"tool\", \"tool_call_id\": call_id, \"content\": json.dumps(payload, ensure_ascii=False)})\n\n# Anthropic Claude Messages：本轮所有 tool_result 打包进一条 role='user' 消息的 content 数组里\nblocks = [\n    {\"type\": \"tool_result\", \"tool_use_id\": call_id, \"content\": json.dumps(payload, ensure_ascii=False), \"is_error\": \"error\" in payload}\n    for call_id, payload in results\n]\nhistory.append({\"role\": \"user\", \"content\": blocks})",
        explain: [
          "这就是手写过一次协议适配层的巨大收获：如果你自己接原生 Claude API 时不小心按 OpenAI 的习惯发了 role='tool'，会立刻报错；现在通过 Adapter 隔离，上层业务代码完全不用操心这个细节。"
        ]
      }
    ]
  },
  "5": {
    files: ["lab05_enterprise_safety.py"],
    intro: "第 5 章全部采用标准库 sqlite3 与 hashlib 实现，没有任何外部依赖。重点观察 Principal 是如何一路透传到 SQL WHERE 子句的。",
    pythonTips: [
      ["frozenset({'order:read'})", "不可变集合（Immutable Set），支持 O(1) 时间复杂度的 perm in p.permissions 权限包含判断，且不可被意外篡改。"],
      ["with self.db:", "sqlite3 连接对象作为上下文管理器使用时，会自动管理数据库事务：代码块正常结束自动 COMMIT，中途抛出任何异常自动 ROLLBACK 回滚！"]
    ],
    blocks: [
      {
        title: "网关层的双重 RBAC 防御与统一审计记录",
        file: "lab05_enterprise_safety.py",
        code: "def call(self, p: Principal, tool_name: str, args: dict[str, Any]) -> dict[str, Any]:\n    try:\n        if tool_name not in self._tools:\n            raise ValueError(f\"未注册工具：{tool_name}\")\n        required_perm, arg_types, fn = self._tools[tool_name]\n        if required_perm not in p.permissions:\n            raise PermissionError(f\"缺少权限：{required_perm}\")\n        # ... 参数精确类型校验 ...\n        result = fn(p, **args)\n    except (ValueError, PermissionError) as exc:\n        self.store.record_audit(p, tool_name, \"rejected\", str(exc))\n        raise\n    self.store.record_audit(p, tool_name, \"ok\", json.dumps(args, ensure_ascii=False))\n    return result",
        explain: [
          "注意 fn(p, **args) 这一行：第一个参数 p 是网关持有的可信 Principal，后面的 **args 才是模型传来的业务参数。哪怕模型被提示词注入彻底绕晕，也越不过这道硬编码的权限与租户屏障。"
        ]
      }
    ]
  },
  "6": {
    files: ["lab06_mcp_server.py", "lab06_mcp_bridge.py"],
    intro: "第 6 章包含服务端和客户端两个配套文件。lab06_mcp_server.py 同时完整注册了 @server.tool()、@server.resource('policy://{doc_id}') 和 @server.prompt() 三大原语；lab06_mcp_bridge.py 则分 6 步展示 JSON-RPC 2.0 报文与三大原语的实际调用效果。",
    pythonTips: [
      ["print(..., file=sys.stderr)", "开发 Stdio MCP Server 的头号铁律：stdout 已被专门征用为 JSON-RPC 报文数据线，任何调试日志必须输出到 sys.stderr，否则会损坏协议流！"],
      ["async def / await", "Python 原生协程异步语法（类似 JS/TS 的 async/await）。因为 MCP 客户端需要同时管理子进程管道读写与网络 I/O，官方 SDK 采用异步接口设计。"]
    ],
    blocks: [
      {
        title: "在一个 MCP Server 里同时实现 Tools、Resources 与 Prompts",
        file: "lab06_mcp_server.py",
        code: "@server.tool()\ndef query_order(order_id: str) -> dict:\n    \"\"\"【Tool】给大模型动态调用的实时订单查询函数。\"\"\"\n    return tool_query_order(order_id)\n\n@server.resource(\"policy://{doc_id}\")\ndef get_company_policy(doc_id: str) -> str:\n    \"\"\"【Resource】给宿主应用按 URI 直接读取的只读制度原文。\"\"\"\n    return resource_read_policy(doc_id)\n\n@server.prompt()\ndef audit_refund(order_id: str, customer_reason: str = \"未发货想退款\") -> str:\n    \"\"\"【Prompt】给终端用户在斜杠菜单里一键套用的专家审查模板。\"\"\"\n    return prompt_refund_audit(order_id, customer_reason)",
        explain: [
          "把这三个装饰器并排放在一起看，区别瞬间一目了然：Tool 做动作查实时状态，Resource 像文件 URI 供只读挂载，Prompt 帮人类用户生成高质量提问！"
        ]
      }
    ]
  },
  "7": {
    files: ["lab07_context_rag.py"],
    intro: "第 7 章实现了两个面试与实战极高频的核心函数：trim_history_safely（配对安全裁剪）与 cosine_similarity（向量余弦相似度）。",
    pythonTips: [
      ["reversed(units)", "反向迭代器：无需复制原列表即可从最新的一轮对话往旧对话倒序遍历，优先把宝贵的 Token 预算分给最近发生的事情。"],
      ["zip(vec_a, vec_b)", "将两个等长向量的对应维度元素两两配对，方便计算向量点积 sum(x * y for x, y in zip(a, b))。"]
    ],
    blocks: [
      {
        title: "从后往前在预算内挑选完整交互组",
        file: "lab07_context_rag.py",
        code: "kept_reversed: list[list[dict[str, Any]]] = []\nfor unit in reversed(units):\n    cost = unit_cost(unit)\n    if cost <= budget_left:\n        kept_reversed.append(unit)\n        budget_left -= cost\n    else:\n        break  # 一旦遇到放不下的历史组即停止，保持保留下来的对话时间线连续不断裂",
        explain: [
          "为什么遇到放不下的单元就 break 而不是跳过它继续往更早找？因为如果中间缺了一截对话却保留了更早的一句闲聊，会导致上下文因果逻辑错乱。被淘汰的更早历史若仍有价值，应在后台异步压缩成一段简短的总结。"
        ]
      }
    ]
  },
  "8": {
    files: ["lab08_eval_harness.py"],
    intro: "第 8 章侧重宏观编排架构，代码阅读结合 lab08_eval_harness.py 中的 run_with_tracing 函数，体会如何在运行循环外围挂载非侵入式的观测记录。",
    pythonTips: [
      ["time.perf_counter()", "Python 高精度单调计时器，专门用于测量函数或网络请求耗时（不受系统时钟校准回拨影响，类似 Java 的 System.nanoTime()）。"]
    ],
    blocks: [
      {
        title: "为每一轮模型决策与工具执行生成精细 Span",
        file: "lab08_eval_harness.py",
        code: "t0 = time.perf_counter()\ndecision = policy_model(question, observations)\nllm_ms = (time.perf_counter() - t0) * 1000\ntrace.spans.append(Span(\"llm_call\", f\"round_{round_idx}\", round(llm_ms, 2), decision))",
        explain: [
          "生产环境排查 Agent 变慢时，90% 的耗时通常花在多轮串行 LLM 推理上，其余花在慢查询工具上。拆分记录 llm_call 与 tool_exec 的耗时让你一眼看出瓶颈在哪。"
        ]
      }
    ]
  },
  "9": {
    files: ["lab08_eval_harness.py", "test_labs.py"],
    intro: "第 9 章重点对比 reliable_baseline_model 与 flawed_model 两个策略函数在五道评测题下的表现差异。",
    pythonTips: [
      ["sum(bool_expr for x in suite)", "在 Python 中布尔值 True 参与加法时等于 1、False 等于 0，因此可以直接用 sum(...) 优雅统计通过的测试用例数量。"]
    ],
    blocks: [
      {
        title: "缺陷模型模拟的三种真实线上高频翻车场景",
        file: "lab08_eval_harness.py",
        code: "def flawed_model(question: str, obs: list[tuple[str, dict[str, Any]]]) -> dict[str, Any]:\n    if \"Python\" in question and not obs:\n        return {\"tool\": \"query_order\", \"args\": {\"order_id\": \"PYTHON\"}}     # 翻车 1：无关问题乱调工具\n    if \"A100\" in question and \"退款\" in question:\n        if not obs:\n            return {\"tool\": \"query_order\", \"args\": {\"order_id\": \"A100\"}}\n        return {\"answer\": \"我已经直接帮您全额秒退到账啦！\"}                 # 翻车 2：漏查制度 + 虚假承诺\n    if \"昨天买的东西\" in question and not obs:\n        return {\"tool\": \"query_order\", \"args\": {\"order_id\": \"A100\"}}       # 翻车 3：缺单号时擅自瞎猜",
        explain: [
          "把线上每一次真实翻车都固化成 build_eval_suite() 里的一条永久回归用例（Regression Case），你的 Agent 系统就会越迭代越稳健，而不是改东坏西。"
        ]
      }
    ]
  },
  "10": {
    files: ["test_labs.py"],
    intro: "第 10 章通读 test_labs.py，回顾整套工程从 Schema 契约、四层校验、多协议回放、企业 RBAC 幂等到上下文裁剪的完整确定性防线。",
    pythonTips: [
      ["with self.subTest(protocol=fmt):", "unittest 的参数化子测试语法：在一个测试方法内循环验证 chat / responses / messages 三种协议，任一协议失败都会独立报告具体是哪一种格式出了问题。"]
    ],
    blocks: [
      {
        title: "用参数化子测试一次性锁死三大主流大模型协议",
        file: "test_labs.py",
        code: "def test_all_three_protocols_complete_react_loop(self) -> None:\n    for fmt in (\"chat\", \"responses\", \"messages\"):\n        with self.subTest(protocol=fmt):\n            runtime = AgentRuntime(\n                adapter=make_adapter(fmt),\n                send_fn=build_mock_sender(fmt),\n                execute_tool_fn=lambda n, a: dispatch_business_tool(self.orders, n, a),\n            )\n            answer, calls = runtime.run(\"mock\", \"A100 能退款吗？\", verbose=False)\n            self.assertEqual(calls, 2)\n            self.assertIn(\"A100\", answer)",
        explain: [
          "确定性的协议适配代码由单元测试 100% 守护（毫秒级免费运行），不确定的模型语义能力由第 9 章的 Eval 基准评估——这就是专业 Agent 团队的标准测试金字塔！"
        ]
      }
    ]
  }
};
