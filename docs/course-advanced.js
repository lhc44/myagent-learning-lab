window.COURSE_ADVANCED = [
  [
    "13",
    "进阶：真实模型与执行协议",
    [
      [
        "多轮 Responses API 与供应商适配",
        "掌握真实模型连续调用，而非仅演示一次 Tool Call。",
        [
          "原课的第二轮强制 tool_choice=none 只是单次实验。真正 Runner 允许连续调用，但必须有独立步数、工具数量和截止时间限制。Responses API 可把 previous_response_id 与 function_call_output 一起传回；如果选择无状态模式，应按供应商要求保留前一轮完整输出（包括必要的 reasoning items），不能仅拼接最后的文本。每轮应提供需要的 instructions 与工具定义。",
          "供应商消息协议并不相同：OpenAI Responses 的 function_call 与 function_call_output 使用 call_id 关联；Anthropic Messages 的 tool_use / tool_result 使用 tool_use_id；某些兼容 Chat Completions 接口采用 assistant.tool_calls 与 role=tool。Gateway 应归一化，不混用这些 wire 格式。",
          "下面是完整有界在线实验的最小版本，使用只读模拟业务、明确白名单、严格字段与类型、网络超时。它没有真实身份鉴权、持久化或硬截止时间，不能直接用于企业生产。模型接口需自行授权，可能收费。"
        ],
        "用户 → responses.create → 完整调用 → 白名单 handler → function_call_output → 下一轮",
        "import os,json\nfrom openai import OpenAI\nclient=OpenAI(timeout=20,max_retries=0)\ntools=[{\"type\":\"function\",\"name\":\"query_order\",\"description\":\"查询模拟订单状态\",\"parameters\":{\"type\":\"object\",\"properties\":{\"order_id\":{\"type\":\"string\"}},\"required\":[\"order_id\"],\"additionalProperties\":False},\"strict\":True}]\nprevious=None\npayload=\"查询订单A100并说明状态\"\nfor step in range(4):\n    kwargs=dict(model=os.environ[\"OPENAI_MODEL\"],input=payload,tools=tools,instructions=\"实时订单状态必须通过工具获取。\")\n    if previous: kwargs[\"previous_response_id\"]=previous\n    r=client.responses.create(**kwargs)\n    calls=[x for x in r.output if x.type==\"function_call\"]\n    if not calls:\n        print(r.output_text);break\n    if len(calls)>4:raise RuntimeError(\"too many calls\")\n    payload=[]\n    for c in calls:\n        a=json.loads(c.arguments)\n        if c.name!=\"query_order\" or not isinstance(a,dict) or set(a)!={\"order_id\"} or type(a[\"order_id\"]) is not str:\n            result={\"error\":\"invalid tool\"}\n        else:result={\"status\":\"paid\" if a[\"order_id\"]==\"A100\" else \"not_found\"}\n        payload.append({\"type\":\"function_call_output\",\"call_id\":c.call_id,\"output\":json.dumps(result)})\n    previous=r.id\nelse:raise RuntimeError(\"step limit\")",
        "安装 openai；配置 OPENAI_API_KEY、OPENAI_MODEL；运行后观察实际输出，不保证模型一定调用。若遇到 401 检查凭证，429 检查限流和余额，400 核对模型能力/schema。此实验不记录密钥。",
        "模型返回三个 function_call，应该如何回传？",
        [
          "只回传第一个",
          "逐个执行允许的调用，为每个 call_id 返回对应结果",
          "把三个结果拼成一条普通 user 消息"
        ],
        1,
        "调用关联是协议正确性的关键。",
        "给上述程序增加总工具次数限制和每次调用的错误分类；说明如何接入另一供应商。"
      ],
      [
        "流式调用、并发与取消",
        "理解分片、完整调用事件及有界并发。",
        [
          "流式响应可能把参数拆成多个 delta。每个调用维护独立缓冲区，直到收到该调用完成事件并通过 JSON 解析与 schema 校验，才允许进入执行器。不能在收到工具名称或半个 JSON 时执行。供应商的事件名不同，应先转换为内部事件。",
          "并发是执行策略而非授权：只读、互不依赖、资源不冲突的调用才适合并行；写操作需要明确事务和依赖约束。设置最大并发和任务级 deadline，外部 HTTP/数据库也要独立超时。取消 Future 不代表已发出的业务操作自动撤销。",
          "示例以两个交错调用的模拟分片为输入，演示完整事件后解析。不是某个供应商的实际流式格式。"
        ],
        "delta(id) → per-call buffer → complete(id) → parse → validation → execute",
        "import json\nbuf={}\nevents=[(\"delta\",\"c1\",'{\"id\":'),(\"delta\",\"c2\",'{\"id\":\"B\"}'),(\"delta\",\"c1\",'\"A\"}'),(\"complete\",\"c2\",\"\"),(\"complete\",\"c1\",\"\")]\nfor kind,call_id,value in events:\n    if kind==\"delta\":buf[call_id]=buf.get(call_id,\"\")+value\n    elif kind==\"complete\":\n        print(call_id,json.loads(buf.pop(call_id)))",
        "预期先输出 c2 B，再输出 c1 A。删除 c1 最后一片，complete 时 JSON 解析失败，不能执行。真实流中还要处理 duplicate、error、done 与取消。",
        "收到完整 JSON 但尚无调用完成事件，是否立即执行？",
        [
          "应等待明确完成与校验",
          "立即执行",
          "先执行再看后续片段"
        ],
        0,
        "完整事件和可信校验决定可执行性。",
        "实现分片累积器，限制单调用缓冲大小，并测试交错、非法 JSON 与未完成调用。"
      ],
      [
        "本地模型、模型能力矩阵与评估",
        "判断模型是否适合工具任务，避免把本地模型当作企业能力保证。",
        [
          "模型原生工具能力取决于模型权重训练、聊天模板、推理引擎和 API 适配器。某个系列支持工具不代表每个量化版本和部署端都可靠。普通 CPU 可运行较小模型用于实验，但速度、上下文与工具准确率可能受限。",
          "能力矩阵至少记录模型标识与版本、工具支持、并行、结构化输出、最大上下文、使用的模板、隐私与部署约束。测试不能只问一次天气；应包含相似工具、无工具、缺字段、错误字段、长上下文与注入文本。",
          "对于不支持原生调用的模型，可以约定 JSON 输出并在应用层解析，但应明确作为兼容模式，使用独立评估和安全限制。不要通过 eval 执行模型生成的字符串。"
        ],
        "选择模型 → 能力探测 → 固定测试集 → 指标 → 允许任务范围",
        "models=[{\"name\":\"mock-A\",\"tools\":True,\"parallel\":False},{\"name\":\"mock-B\",\"tools\":False,\"parallel\":False}]\nfor m in models:\n    if not m[\"tools\"]: print(m[\"name\"],\"reject native tool task\")\n    else: print(m[\"name\"],\"eligible for eval\")",
        "预期 mock-A 进入评估、mock-B 拒绝原生工具任务；它们是假模型标识，不是实际产品。选择真实模型后记录 API 或本地引擎版本并运行基准。",
        "只要模型能生成 JSON，就意味着它稳定支持原生工具调用吗？",
        [
          "是",
          "否，协议适配与行为准确性还需验证",
          "只看参数规模"
        ],
        1,
        "结构输出能力和工具任务可靠性并不等价。",
        "制定两个实际候选模型的能力矩阵与 20 条测试任务；记录真实结果、版本和失败分类。"
      ]
    ]
  ],
  [
    "14",
    "进阶：现代 MCP 与远程治理",
    [
      [
        "现代 MCP：发现、无状态核心与多轮交互",
        "读懂 2026-07-28 规范的实际请求边界。",
        [
          "MCP 2026-07-28 正式规范移除了旧式 initialize/initialized 与 Mcp-Session-Id；协议版本和客户端能力通过请求相关元数据表达。现代客户端可进行 server/discover 获得服务信息，再发方法请求；旧式客户端可能继续使用握手生命周期。实际 wire envelope、请求头和兼容逻辑必须以所选规范和 SDK 为准。",
          "无状态不等于没有业务上下文。服务器仍需认证主体和业务资源，长任务和审批状态应由独立持久层维护。新版增加多轮交互、HTTP 路由与可缓存列表等机制；不能把旧版 session 当成现代协议的必需基础。",
          "企业迁移应同时验证两种客户端、目录缓存隔离、权限撤销及中间节点路由，记录版本协商结果。下面的兼容性检查只是本地测试矩阵，不是实际 MCP 请求。"
        ],
        "客户端版本探测 → modern / legacy → 工具发现 → 调用 → 业务层状态",
        "matrix={\"2025-11-25\":{\"handshake\":True},\"2026-07-28\":{\"handshake\":False}}\nfor version,features in matrix.items():\n    print(version,\"initialize\" if features[\"handshake\"] else \"self-contained requests\")",
        "先对照官方发布说明和规范；旧版实验用原课 SDK。新版选择官方现代 SDK（例如 Java SDK 的 modern client/server），抓取实际交互验证版本；不要仅按本地矩阵声称兼容。",
        "无状态 MCP 是否意味着审批记录无需存数据库？",
        [
          "是",
          "不是，协议会话状态与业务持久状态独立",
          "只需存模型上下文"
        ],
        1,
        "无状态通信核心不替代业务事务与恢复。",
        "为旧/新客户端各制定四个集成测试：发现、调用、未授权、目录权限变更；列出抓包时需检查的字段。"
      ],
      [
        "远程 MCP：授权、身份传播与工具目录缓存",
        "设计可安全部署的 MCP 网关。",
        [
          "远程 MCP 与本地 stdio 的信任边界不同：HTTP 端点需 TLS，遵守版本规定的授权机制，客户端凭据不得当作任意后端访问通行证。认证后必须在工具及业务层检查资源范围。不要将第三方 access token 不经验证直接透传到无关服务。",
          "工具目录不是全局静态配置：不同身份、租户、权限、协议版本可能获得不同工具及描述。缓存键至少绑定 server、主体/权限范围、协议版本、目录版本；权限变化必须失效。每次执行仍重新授权。",
          "服务器保护还包括请求大小限制、超时、限流、出站网络限制、审计与错误脱敏。内网也需要授权；不因来源 IP 在内网就信任模型或客户端。以下示例仅模拟目录缓存。"
        ],
        "认证 → capability catalog → scoped cache → per-call authorization → service",
        "cache={}\ndef catalog(tenant,scope,version):\n    key=(tenant,tuple(sorted(scope)),version)\n    if key not in cache:\n        cache[key]=[t for t in [\"read\",\"refund\"] if t in scope]\n    return cache[key]\nprint(catalog(\"t1\",{\"read\",\"refund\"},\"v1\"))\nprint(catalog(\"t1\",{\"read\"},\"v1\"))\nassert \"refund\" not in catalog(\"t2\",{\"read\"},\"v1\")",
        "第一行含 read/refund，第二行仅 read。增加主体 ID、目录版本和过期策略，再模拟权限撤销。真实授权服务要核查当前权限，不接受客户端自报 scope。",
        "目录缓存命中后，调用时还需要授权吗？",
        [
          "不需要",
          "需要，缓存目录不是执行授权",
          "只对写操作需要"
        ],
        1,
        "读操作也可能泄露敏感信息。",
        "设计远程 MCP 的部署图、认证方式、缓存键、租户隔离及五个安全测试。"
      ],
      [
        "MCP 扩展、资源模板与 Agent 间协议",
        "理解 MCP、A2A、Skills 的边界。",
        [
          "MCP 解决 Host 与工具/资源提供方之间的互操作；Agent-to-Agent 类协议则面向智能体之间的任务委派、状态和产物交换。两者可能在同一个系统并存，但不能假定 MCP server 必然是自主 Agent，也不能把 A2A 当作所有工具调用的必需协议。",
          "资源模板可以将 URI 参数化，客户端仍须校验请求与授权；提示模板用于复用指令，不能提升权限。现代 MCP 扩展如任务和交互界面有独立能力声明；不支持扩展的宿主需明确降级。我们当前优先掌握核心 Tools/Resources/Prompts，不把 UI 扩展设为必修。",
          "企业中，数据工具通常直接暴露 MCP；跨部门长任务可能需要独立任务服务或 A2A，具体取决于状态、身份和异步交互需求。不要为一个查询接口额外套多个协议。"
        ],
        "MCP：Host → Tool service；A2A：Agent → delegated task / artifact",
        "def choose(kind):\n    return {\"query_order\":\"MCP tool or local API\",\"delegate_research\":\"task interface / A2A if needed\",\"audit_sop\":\"Skill / prompt\"}[kind]\nfor k in [\"query_order\",\"delegate_research\",\"audit_sop\"]: print(k,choose(k))",
        "解释三种任务为何不同。协议实现需阅读对应版本规范，本例不声称已实现 A2A。",
        "单一只读数据库查询一定要引入 A2A 吗？",
        [
          "必须",
          "不必，普通工具接口足够",
          "只有 Python 需要"
        ],
        1,
        "协议选择服务于实际边界。",
        "为跨部门调查设计任务委派契约，明确调用者、任务 ID、产物、状态、取消和权限。"
      ]
    ]
  ],
  [
    "15",
    "进阶：长任务、记忆与生产运行",
    [
      [
        "跨上下文窗口的长任务 Harness",
        "建立任务日志、结构化交接与可恢复执行。",
        [
          "长任务不是无限增加 context window。需要保留稳定目标、任务清单、事实证据、完成状态与待办；每次工作周期加载必要信息，完成一小步后验证并持久化。摘要记录关键决策和依据，但真实产物仍需可检查，不能仅信任上一轮声称完成。",
          "推荐把初始化与持续执行分离：初始化建立测试、验收标准、工作环境与任务清单；执行周期只处理有限任务，运行验证并记录结果。恢复时检查上次 checkpoint 与实际文件/数据库状态，再决定下一步。",
          "以下 SQLite 示例演示事务保存任务状态与版本检查。它不处理跨进程副作用、分布式锁或真实 LLM；这些必须由生产设计补全。"
        ],
        "初始化 → 小步执行 → 验证 → checkpoint → 新上下文 → 恢复",
        "import sqlite3\nc=sqlite3.connect(\":memory:\")\nc.execute(\"CREATE TABLE task(id TEXT PRIMARY KEY,state TEXT,version INT)\")\nc.execute(\"INSERT INTO task VALUES('T1','pending',0)\")\nwith c:\n    cur=c.execute(\"UPDATE task SET state=?,version=version+1 WHERE id=? AND version=?\",(\"verified\",\"T1\",0))\n    if cur.rowcount!=1:raise RuntimeError(\"conflict\")\nprint(c.execute(\"SELECT * FROM task\").fetchall())",
        "输出 [('T1','verified',1)]。重复使用 version=0 应冲突。改用临时文件数据库，重启后重新读取任务状态。",
        "为什么恢复时不能只读取上一轮模型写的『已经完成』？",
        [
          "因为模型可能出错，须核对可验证产物及业务状态",
          "因为所有模型不支持中文",
          "只要历史很长就可以信任"
        ],
        0,
        "事实验证与模型声明不同。",
        "设计跨会话任务记录：目标、验收、产物引用、完成状态、错误、下一步和版本。"
      ],
      [
        "持久化审批、Outbox 与未知执行结果",
        "实现事务级幂等思路，理解至少一次投递。",
        [
          "外部系统与本地数据库通常不共享事务。若先提交外部写入再保存本地状态，进程可能在两者间崩溃。Outbox 模式将业务意图与待发送事件同一事务写入；后台 worker 重复读取事件，使用稳定幂等键调用外部服务。",
          "Outbox 不自动保证恰好一次外部副作用。消费者可能在成功发送后、标记事件前崩溃，所以外部接口需要幂等或可核对的业务引用。审批应绑定操作摘要、主体、有效期和目标资源；参数变化后重新审批。",
          "下面用 SQLite 演示同一个事务中保存申请与待处理事件，唯一键阻止重复插入。实际项目还需查询相同 key 的参数摘要，冲突时拒绝。"
        ],
        "申请/审批 → DB 事务 + Outbox → Worker → 幂等外部调用 → 确认",
        "import sqlite3\nc=sqlite3.connect(\":memory:\")\nc.executescript(\"CREATE TABLE req(id TEXT PRIMARY KEY,state TEXT);CREATE TABLE outbox(id TEXT PRIMARY KEY,payload TEXT);\")\nwith c:\n    c.execute(\"INSERT INTO req VALUES(?,?)\",(\"R1\",\"approved\"))\n    c.execute(\"INSERT INTO outbox VALUES(?,?)\",(\"R1\",\"refund:A100\"))\nprint(c.execute(\"SELECT * FROM outbox\").fetchall())",
        "输出一条 R1 事件。再次插入同一键会触发约束失败；模拟 worker 调用成功但未确认时恢复，讨论外部幂等键。",
        "Outbox 能保证外部支付恰好执行一次吗？",
        [
          "天然能",
          "不能单独保证，仍需外部幂等或对账",
          "只要用 SQLite 就可以"
        ],
        1,
        "跨系统事务的未知结果必须显式处理。",
        "实现申请参数摘要和 outbox 同事务写入；制定重复发送、崩溃恢复与对账测试。"
      ],
      [
        "生产部署：API、Worker、队列与事件",
        "在不学习前端的前提下完成服务端设计。",
        [
          "短请求可以在 HTTP 生命周期中执行；长任务更适合 API 创建任务并返回 task_id，Worker 从持久队列领取任务，执行 Runner，保存 checkpoint 和事件，客户端轮询或订阅事件。取消请求通过持久状态传播，不能保证撤销已完成的外部动作。",
          "API 层验证身份和租户；队列传递任务 ID 与必要上下文，不传明文长期密钥；Worker 领取使用租约或可见性超时，重试依赖幂等。事件接口可暴露 started、tool_requested、tool_completed、awaiting_approval、done、failed 等状态，并过滤敏感字段。",
          "部署先在隔离测试环境验证：配置、依赖版本、数据库迁移、密钥、监控、备份、负载和回滚。单进程教学代码不等于生产队列系统。"
        ],
        "API → task store + queue → worker → policy/runner → event store → status API",
        "from queue import Queue\nq=Queue()\ntasks={\"T1\":{\"tenant\":\"t1\",\"state\":\"queued\"}}\nq.put(\"T1\")\ntid=q.get()\ntasks[tid][\"state\"]=\"running\"\ntasks[tid][\"state\"]=\"done\"\nq.task_done()\nprint(tasks[tid])",
        "输出 done；内存队列不能跨进程恢复。下一步将任务状态放 SQLite，模拟重启，再考虑 Redis/PostgreSQL 或成熟队列。",
        "API 已返回 task_id 是否说明任务已经完成？",
        [
          "是",
          "不是，只表示任务已创建或被接受",
          "只取决于 HTTP 状态码"
        ],
        1,
        "异步任务接受和业务完成必须区分。",
        "设计 POST /tasks、GET /tasks/{id}、POST /tasks/{id}/cancel 和审批接口，列出身份、状态码、幂等与事件字段。"
      ]
    ]
  ]
];
window.COURSE_SOLUTIONS_ADVANCED = {
  "13-1": [
    "总次数应在执行每条调用前检查，而不是只限制轮数；总截止时间要基于 monotonic，网络客户端的超时还需按剩余预算设置。将供应商响应转成统一 ToolCall(name,id,args)，各适配器负责回传格式。",
    "轮次限制 + 总调用预算 + deadline → execute",
    "class Budget:\n    def __init__(self,n):self.remaining=n\n    def take(self):\n        if self.remaining<=0:raise RuntimeError('tool budget')\n        self.remaining-=1\nb=Budget(2)\nfor _ in range(2):b.take()\ntry:b.take()\nexcept RuntimeError as e:print(e)",
    "输出 tool budget；真实程序在 handler 执行前调用 take，并分类捕获 JSON、权限、网络错误。",
    "拒绝额外调用不产生副作用；不同供应商保留自己的调用关联格式。"
  ],
  "13-2": [
    "缓冲按 call_id 区分，限制字节数，完成时一次解析，解析失败返回错误，不留下可执行动作。",
    "delta → bounded buffer → complete → parse",
    "import json\nclass Accumulator:\n    def __init__(self,limit=64):self.b={};self.limit=limit\n    def delta(self,id,s):\n        v=self.b.get(id,'')+s\n        if len(v.encode())>self.limit:raise ValueError('too large')\n        self.b[id]=v\n    def complete(self,id):return json.loads(self.b.pop(id))\na=Accumulator();a.delta('a','{\"x\":');a.delta('b','{\"x\":2}');a.delta('a','1}');print(a.complete('b'),a.complete('a'))",
    "输出 x=2 与 x=1；测试超长、非法 JSON、未知 ID 和未完成事件。生产还需对重复完成及取消清理。",
    "只有完整且通过 schema 校验的调用可执行；不同 ID 不串数据。"
  ],
  "13-3": [
    "能力矩阵必须来自实际验证，而非产品宣传。每个模型运行同样的 20 条任务：8正常、4歧义、3无工具、3缺参、2越权。记录 model_id、engine_version、tool_schema_version、expected、actual、latency 和 side_effect。",
    "模型 A/B → 同一任务集 → 真实日志 → 指标",
    "from collections import Counter\ncases=[('normal',8),('ambiguous',4),('no_tool',3),('missing',3),('denied',2)]\nprint(sum(n for _,n in cases),dict(cases))",
    "输出20；实际 API/本地模型尚需学习者配置和实测，不填写虚假准确率。",
    "两模型使用相同数据、工具和评分；安全断言独立于文本准确性。"
  ],
  "14-1": [
    "集成矩阵共8项：旧客户端和现代客户端各测试目录发现、只读调用、拒绝无权限调用、权限撤销后刷新。记录 SDK 版本、实际协议版本、传输、方法/版本元数据、HTTP 状态、目录内容与工具结果。",
    "2 个版本 × 4 个验证用例",
    "for version in ['2025-11-25','2026-07-28']:\n    for case in ['discover','call','unauthorized','revoke_refresh']:\n        print(version,case,'NOT_RUN')",
    "输出8条 NOT_RUN。实际运行后用脱敏抓包/SDK日志更新结果；不伪造现代协议测试。",
    "旧握手和新无状态路径均有证据；未授权不泄露数据，缓存不跨权限。"
  ],
  "14-2": [
    "部署：Client → HTTPS gateway/认证 → MCP server → Policy → business service/DB。缓存键包括 server、subject、tenant、scope、protocol、catalog_version。测试：无 token、错租户、过期授权、撤销后旧缓存、恶意工具参数；都不得产生越权访问。",
    "auth → scoped cache → per-call check → resource",
    "def cache_key(server,subject,tenant,scope,protocol,revision):\n    return (server,subject,tenant,tuple(sorted(scope)),protocol,revision)\na=cache_key('orders','alice','t1',{'read'},'modern',1)\nb=cache_key('orders','bob','t1',{'read'},'modern',1)\nassert a!=b\nprint('isolated cache keys')",
    "输出 isolated cache keys；此函数只测试缓存身份隔离，不是 OAuth 实现。",
    "目录缓存分区；认证与资源授权独立；权限撤销可验证。"
  ],
  "14-3": [
    "任务契约包含 task_id、caller_subject、tenant、question、allowed_resources、deadline、output_schema、status、artifact_refs。服务端重新认证 caller，不信任自报权限；状态 queued/running/awaiting_input/completed/failed/cancelled；取消需确认，不撤销已经发生的副作用。",
    "delegate → accept → status → artifact → verify",
    "import json\ntask={'task_id':'T1','question':'核对制度','status':'queued','artifact_refs':[],'deadline_seconds':60}\nprint(json.dumps(task,ensure_ascii=False))",
    "输出任务 JSON。它是内部契约样例，不是 A2A 标准报文。",
    "任务 ID、权限、预算、状态、取消及产物验证齐全。"
  ],
  "15-1": [
    "任务 checkpoint 记录目标、验收条件、完成的步骤及证据、待办、失败、版本。恢复先验证产物引用是否存在及是否满足测试，而不是直接信任摘要。",
    "checkpoint → verify evidence → resume",
    "state={'goal':'订单助手','acceptance':['query test passes'],'done':[],'next':'implement registry','version':0}\ndef finish(s,evidence,verified):\n    if not verified:raise ValueError('not verified')\n    s['done'].append(evidence);s['version']+=1\nfinish(state,'test_registry: PASS',True)\nprint(state)",
    "输出 version 1 和已完成证据；实际 verified 必须来自可信测试，不能接受模型自报。",
    "重启可恢复、已完成有验证证据、错误与待办独立记录。"
  ],
  "15-2": [
    "在同一个事务插入业务申请与 outbox；请求摘要绑定参数，相同 key 相同摘要返回原状态，不同摘要拒绝。Worker 通过稳定 key 调用外部，若外部结果未知先核对。",
    "idempotency key + digest → transaction → outbox",
    "import sqlite3,hashlib,json\nc=sqlite3.connect(':memory:');c.executescript('CREATE TABLE req(k TEXT PRIMARY KEY,digest TEXT);CREATE TABLE outbox(k TEXT PRIMARY KEY,payload TEXT);')\ndef submit(k,body):\n    p=json.dumps(body,sort_keys=True);d=hashlib.sha256(p.encode()).hexdigest()\n    with c:\n        old=c.execute('SELECT digest FROM req WHERE k=?',(k,)).fetchone()\n        if old:\n            if old[0]!=d:raise ValueError('conflict')\n            return 'existing'\n        c.execute('INSERT INTO req VALUES(?,?)',(k,d));c.execute('INSERT INTO outbox VALUES(?,?)',(k,p));return 'new'\nprint(submit('R1',{'amount':10}),submit('R1',{'amount':10}))",
    "输出 new existing；改变金额应冲突。真实项目需租户主键、并发事务和外部对账。",
    "重复请求仅一条 outbox；不同参数冲突；崩溃时无孤立业务意图。"
  ],
  "15-3": [
    "接口设计：POST /tasks 认证主体并校验任务参数，幂等创建返回202；GET /tasks/{id} 按主体/租户查询返回200或统一不可访问；POST /tasks/{id}/cancel 返回202并标记取消请求；POST /tasks/{id}/approve 校验审批者、操作摘要和有效期，返回更新状态。事件包含 task_id、seq、type、timestamp、safe_payload。",
    "HTTP → auth/policy → task DB → worker → event log",
    "def get_task(p,t):\n    if p['tenant']!=t['tenant']:return 404,{'error':'not accessible'}\n    return 200,{'id':t['id'],'state':t['state']}\nt={'id':'T1','tenant':'t1','state':'queued'}\nprint(get_task({'tenant':'t1'},t));print(get_task({'tenant':'t2'},t))",
    "输出200与404；真实接口还要检查用户级资源权限、身份和审批约束。",
    "异步接受不等于完成；状态、取消、审批、事件都有授权和幂等设计。"
  ]
};
