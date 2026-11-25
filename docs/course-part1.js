window.COURSE_PART1 = [
  [
    "01",
    "Agent 与模型基础",
    [
      [
        "从聊天模型到智能体",
        "理解模型、工具与运行时的职责，能够画出系统边界。",
        [
          "普通聊天应用收到问题后请求模型，得到文本便结束。Agent 的不同之处在于：应用允许模型提出下一步动作，执行后再让模型处理观察结果。自主程度可以变化，并非所有 Agent 都需要规划、多角色或长期记忆。",
          "用企业订单为例，用户问订单 A100 是否能退款。模型不能凭训练知识知道 A100 的实时状态。工具读取订单状态，返回已支付、未发货；运行时把结果带回模型，模型再给出建议。如果需要真正退款，那是另一种写入工具，必须经过业务授权。",
          "模型负责生成候选决策，运行时负责状态、工具和停止条件，业务服务负责真实数据与权限。工作流的路径多由代码决定，Agent 的路径可以随观察结果改变。先问任务是否真需要自主性，再决定架构。"
        ],
        "用户问题 → 模型 → 调用建议 → 工具执行 → 观察结果 → 模型 → 答案",
        "print('模型建议: query_order(A100)')\norder = {'id': 'A100', 'status': 'paid'}\nprint('业务系统返回:', order)\nprint('模型可据此回答，但尚未退款')",
        "运行上述离线示例。把状态改为 shipped，思考哪些结论应改变，哪些权限不能改变。",
        "用户要求执行退款，模型输出了退款指令。此时款项一定已退回吗？",
        [
          "一定，模型已经决定",
          "不一定，外部服务尚需校验并执行",
          "只要输出 JSON 就完成"
        ],
        1,
        "工具调用是请求，不是业务执行成功的凭证。",
        "写出查询订单和实际退款之间的三道边界：模型决策、授权、业务事务。"
      ],
      [
        "消息、Token 与上下文窗口",
        "识别 System、User、Assistant、Tool 消息及其生命周期。",
        [
          "模型接口接收的是按供应商约定编码的上下文，而不是持续运行的人脑。应用通常保存消息列表，并按需重建输入。系统指令说明角色和约束，用户消息描述任务，助手消息可能是文本或调用，工具消息携带对应结果。不同 API 的字段名并不完全一样。",
          "Token 是模型分词后的单位，不等同于字符或单词；中文、代码、编号的分词情况不同。上下文窗口限制一次请求可处理的总信息量，因此系统指令、工具 schema、检索材料、历史与输出都消耗预算。不要拿字符数当真实 Token 数。",
          "消息边界影响安全：文档或工具内容中的命令只是数据，不能提升为系统指令。工程上还要区分持久化历史和实际送入模型的上下文：审计记录保留全量事件，模型只接收完成任务所需内容。"
        ],
        "消息存储 → 选择相关历史 → 模板编码 → 模型推理 → 新消息",
        "messages = [\n {'role':'system','content':'你是订单助手'},\n {'role':'user','content':'查询A100'},\n {'role':'assistant','tool_calls':[{'id':'c1','name':'query_order'}]},\n {'role':'tool','tool_call_id':'c1','content':'paid'}\n]\nfor m in messages:\n    print(m['role'], m.get('content', m.get('tool_calls')))",
        "观察不同角色的顺序。尝试删除 tool 消息，解释为什么真实模型不应假装知道查询结果。此消息结构是教学归一化格式，不是某个 API 的可直接提交请求。",
        "保存了全部历史，就等于模型每次看到全部历史吗？",
        [
          "是",
          "不是，由应用组装本轮上下文",
          "模型会自动访问数据库"
        ],
        1,
        "持久化存储与本轮模型输入是两个不同层次。",
        "为一个 8K 假设预算设计分配：指令、工具、历史、检索及输出，并说明哪些可压缩。"
      ],
      [
        "原生 Tool Calling 如何形成",
        "理解训练与解码为何能产生工具调用，以及准确性的局限。",
        [
          "语言模型通常逐步预测 Token；工具定义、任务与对话共同影响生成结果。工具调用训练会示范什么时候直接回答、什么时候调用、如何填写参数；推理服务可对输出格式施加约束。不能假设模型内部有一个通用且独立的工具选择分类器。",
          "例如『A100 还在仓库吗』可能对应查询物流或订单履约。模型根据描述判断，不是固定关键词。若工具描述重叠，即使 JSON 完全合法，也可能选错。结构约束解决的是格式问题，业务含义依赖描述、数据与验证。",
          "没有原生工具支持时，可以通过提示要求生成 JSON，程序解析后执行。但这只是较脆弱的模拟；生产中应优先选择明确支持工具调用的模型和 API，评估该版本真实表现。"
        ],
        "工具 schema + 用户输入 → 模型生成调用 → 解析与校验",
        "import json\nraw = '{\"name\":\"query_order\",\"arguments\":{\"order_id\":\"A100\"}}'\ncall = json.loads(raw)\nassert call['name'] in {'query_order'}\nprint(call['arguments']['order_id'])",
        "故意将 order_id 改为数字，再将工具名改为不存在的名字。分别区分 JSON 解析错误、schema 错误与业务错误。",
        "严格 JSON Schema 可以保证订单编号真实存在吗？",
        [
          "可以",
          "只保证符合约束的结构，不能保证业务真实性",
          "只要低温度就能保证"
        ],
        1,
        "格式正确与语义正确是两件事。",
        "准备 10 条含同义表达的订单问题，未来用真实模型测试选择准确率。"
      ]
    ]
  ],
  [
    "02",
    "工具定义、注册与真实调用",
    [
      [
        "设计 AI 能理解的工具",
        "将模糊业务接口转化为明确、有边界的工具契约。",
        [
          "传统接口供程序员阅读，而 Agent 会根据工具定义作决定。名称应表达动作与对象；描述说明何时使用、何时不使用以及副作用；参数要有类型、单位、范围和枚举。过于通用的 query 容易与多种业务混淆。",
          "以 query_order_by_id 为例，输入仅为订单号，租户身份由服务端认证上下文注入而不是由模型填写。输出包含订单状态、更新时间和必要字段，不返回所有客户隐私。写工具 submit_refund_request 与查询工具分离。",
          "应根据任务粒度设计工具：一个工具执行完整、明确的业务动作，避免让模型依赖五次无必要的低级请求；也不要提供可以执行任意 SQL 或命令的超级工具。先记录常见失败，再改善描述。"
        ],
        "业务 Service → 工具适配层 → Schema → 模型候选工具",
        "{\n  \"name\":\"query_order_by_id\",\n  \"description\":\"按订单编号查询状态；只读，不执行退款\",\n  \"parameters\":{\n    \"type\":\"object\",\n    \"properties\":{\"order_id\":{\"type\":\"string\",\"description\":\"业务订单编号\"}},\n    \"required\":[\"order_id\"],\n    \"additionalProperties\":false\n  }\n}",
        "将查询用户和查询订单各设计成一个 schema。让同事只看描述判断使用场景；若无法区分，修改描述。JSON 片段用于理解，不是完整 API 请求。",
        "租户 ID 最安全的来源是什么？",
        [
          "模型根据用户聊天猜测",
          "由经过认证的服务器上下文提供",
          "由工具描述中的例子决定"
        ],
        1,
        "安全上下文不能由不可信模型参数决定。",
        "设计 query_order_by_id 与 submit_refund_request 的输入输出，明确写操作审批条件。"
      ],
      [
        "Tool Registry、路由与校验",
        "手写注册表，区分 schema、handler、路由和授权。",
        [
          "注册表保存工具名称到执行对象的映射，并另外导出给模型的定义。注册时检测重复名；调用时只允许执行已经注册且当前用户有权使用的工具。SDK 的装饰器通常替你完成元数据提取与注册，并不会让模型直接运行函数。",
          "路由层负责找到执行目标：本地函数、REST 适配器或 MCP client。参数校验发生在路由执行之前，并在服务端再次验证。业务级校验例如订单属于当前租户、退款金额不超过可退金额。",
          "在多服务环境中，用命名空间或稳定映射避免两个服务都有 search 工具。每次任务应记录工具定义版本，动态更新目录时避免模型使用旧 schema 调用新实现。"
        ],
        "注册表 → 定义导出 → 调用名查找 → 参数检查 → 权限策略 → handler",
        "registry = {}\ndef register(name, fn):\n    if name in registry: raise ValueError('duplicate')\n    registry[name] = fn\n\ndef dispatch(name, args):\n    if name not in registry: raise ValueError('unknown tool')\n    if set(args) != {'order_id'} or type(args['order_id']) is not str:\n        raise ValueError('invalid arguments')\n    return registry[name](**args)\nregister('query_order', lambda order_id: {'id':order_id,'status':'paid'})\nprint(dispatch('query_order', {'order_id':'A100'}))",
        "运行并分别触发重复注册、错误参数与未知工具。真实系统还需加入身份授权；此实验仅演示映射与基础校验。",
        "MCP 是否规定了一个通用 tools/register 远程接口？",
        [
          "是",
          "否，注册常发生于 SDK 或服务内部",
          "所有 API 都用这个方法"
        ],
        1,
        "MCP 的 tools/list 与 tools/call 不等于工具注册的内部实现。",
        "将 Registry 设计为同时支持 local:order 和 mcp:order 两个命名空间。"
      ],
      [
        "真实模型 API 的一次 Function Call",
        "观察模型请求、工具调用 ID、实际执行与结果回传。",
        [
          "这一课使用 OpenAI Responses API 的函数工具形式，其他供应商也有各自的数据结构。第一次请求带上工具定义，模型可能返回 function_call；应用解析 arguments，执行工具，再以原调用 call_id 返回 function_call_output。只有模型给出最终文本或达到限制才结束。",
          "不要把模型生成的工具名直接交给 eval，也不要使用任意反射执行。这里用白名单且仅演示只读查询。严格模式的 schema 能限制字段，业务系统仍要检查身份与数据。真实接口可能收费；环境变量配置模型名与 API key，不应写进网页或 Git。",
          "实际项目需要处理多个调用、错误、空输出、超时与取消。调用 ID 用来关联工具结果，不一定是业务幂等键；写操作应单独设计稳定业务请求 ID。以下是一轮可运行示例，需安装 openai 并配置 OPENAI_API_KEY、OPENAI_MODEL；未配置时先做前两课离线实验。"
        ],
        "第一次 API → function_call → 白名单函数 → function_call_output → 第二次 API",
        "import os, json\nfrom openai import OpenAI\nclient = OpenAI()\nmodel = os.environ['OPENAI_MODEL']\ntools = [{'type':'function','name':'query_order','description':'查询虚构订单状态','parameters':{'type':'object','properties':{'order_id':{'type':'string'}},'required':['order_id'],'additionalProperties':False},'strict':True}]\nr = client.responses.create(model=model,input='查询订单A100',tools=tools)\noutputs = []\nfor c in r.output:\n    if c.type != 'function_call': continue\n    a = json.loads(c.arguments)\n    if c.name != 'query_order' or set(a) != {'order_id'} or type(a['order_id']) is not str:\n        result = {'error':'invalid call'}\n    else:\n        result = {'status':'paid' if a['order_id']=='A100' else 'not_found'}\n    outputs.append({'type':'function_call_output','call_id':c.call_id,'output':json.dumps(result)})\nif outputs:\n    r = client.responses.create(model=model,previous_response_id=r.id,input=outputs,tools=tools,tool_choice='none')\nprint(r.output_text)",
        "安装 pip install openai，配置有权限的模型接口，再运行。先打印 r.output 中的类型与 call_id，理解数据结构；不要打印密钥。此例第二轮禁止继续调用，下一章实现多轮。",
        "第一次模型响应里出现 function_call，为什么要再次请求模型？",
        [
          "因为工具结果需要进入模型上下文才能生成最终答复",
          "因为第一次模型请求无效",
          "因为 API 会替你自动完成所有业务"
        ],
        0,
        "工具执行结果必须与调用关联并返回给模型。",
        "比较直接回答、正确调用、未知订单三种输入的响应结构。"
      ]
    ]
  ],
  [
    "03",
    "手写 Agent Runtime",
    [
      [
        "有限步数 Agent Loop",
        "实现模型、执行器和观察反馈循环，并明确终止条件。",
        [
          "Agent Loop 是运行时的控制流：模型每轮输出文本或调用；执行器按规则处理所有调用；将结果加入消息；再请求模型。循环次数、时间、Token、费用和工具次数都应有上限。没有调用不一定表示业务成功，只表示模型结束决策，需要检查验收条件。",
          "先用 FakeModel 验证控制逻辑：第一次调用查询工具，第二次根据结果给答案。这是确定性的测试替身，不能用来证明模型语义选择准确率。测试模型不断调用、抛异常和返回错误数据，确认循环仍受控制。",
          "在真实系统中，把 ModelAdapter、Registry、Policy 和 Runner 分开。模型替换不应影响权限判断，业务工具不应依赖某个供应商的消息类。用事件列表记录调用链便于调试。"
        ],
        "while 未完成且未超预算：模型 → 调用 → 执行 → 观察 → 下一轮",
        "def run(model, execute, task, max_steps=4):\n    history = [{'role':'user','content':task}]\n    for _ in range(max_steps):\n        reply = model(history)\n        history.append({'role':'assistant','content':reply})\n        if not reply.get('calls'): return reply['text'], history\n        for call in reply['calls']:\n            value = execute(call['name'], call['args'])\n            history.append({'role':'tool','id':call['id'],'content':value})\n    raise RuntimeError('step limit')\ndef fake(h):\n    if h[-1]['role']=='tool': return {'text':str(h[-1]['content'])}\n    return {'calls':[{'id':'1','name':'order','args':{'id':'A100'}}]}\nprint(run(fake,lambda name,args:{'status':'paid'},'查订单')[0])",
        "将 fake 改为永远返回调用，确认达到上限；然后加入工具异常并设计可恢复错误格式。现有仓库 labs/agent.py 也可运行。",
        "最大轮次限制是模型自己的责任吗？",
        [
          "是",
          "不是，运行时必须强制执行",
          "只有付费模型需要限制"
        ],
        1,
        "控制流和预算是应用层职责。",
        "把 run 函数改为接收独立的 Registry 和 Policy，写一个无限循环测试。"
      ],
      [
        "ReAct、工具链与并行执行",
        "理解观察驱动的行动方式，正确识别依赖关系。",
        [
          "Agent 的核心并不要求显示私有推理过程，可以记录可见计划、工具动作、观察结果和决策摘要。工具链中，如果第二步需要第一步返回的订单编号，那么必须串行；如果查询库存与查询物流互不依赖，可以并行减少等待。",
          "ReAct 类方法强调根据环境反馈改变下一步。例如先查订单，发现未付款，则不再查退款资格，而是给出付款建议。固定流程与模型自主决定路径可以结合：规则先判定资格，Agent 再解释原因。",
          "并行执行不代表并行写入安全。多个工具更新同一资源会发生竞争，必须由业务事务、锁或版本检查解决。并行失败时应分别记录每个结果，不能将部分成功伪装成全成功。"
        ],
        "任务 → 分解依赖 → 独立查询并行 → 汇总 → 条件决策",
        "from concurrent.futures import ThreadPoolExecutor\n\ndef stock(): return {'available': True}\ndef shipping(): return {'status': 'pending'}\nwith ThreadPoolExecutor(max_workers=2) as pool:\n    a = pool.submit(stock)\n    b = pool.submit(shipping)\n    print({'stock':a.result(), 'shipping':b.result()})",
        "在其中一个函数中抛出异常，尝试保留另一个成功结果。讨论如果两个操作都是扣减库存会出现什么问题。",
        "第二个工具需要第一个工具返回的 ID，应该如何执行？",
        [
          "无条件并行",
          "先执行第一个，再调用第二个",
          "让模型随便选"
        ],
        1,
        "有数据依赖就需要串行或显式依赖图。",
        "画出订单核查任务的 DAG，标注哪些步骤可并行，哪些必须顺序执行。"
      ],
      [
        "错误处理、超时与幂等",
        "设计可靠的执行器，避免重试造成重复副作用。",
        [
          "失败分为输入错误、业务拒绝、临时网络错误和未知执行结果。输入不合法应修正参数；权限拒绝应终止；只读临时故障可以在预算内退避重试；写操作超时并不说明没有成功，先查询事务状态再决定。",
          "业务幂等键标识同一次业务意图，不要每次重试生成新键。服务端用唯一约束与事务保存结果，重复请求返回原结果；同一键与不同参数冲突应拒绝。内存字典仅用于实验，重启和多实例无法保证可靠性。",
          "在 Runner 记录工具耗时、结果类别、重试次数；对连续失败设置上限。使用 SDK 的网络超时或支持取消的执行环境，单纯等待 Future 超时不一定停止底层操作。"
        ],
        "校验 → 执行 → 分类错误 → 有界重试 / 拒绝 / 查询状态",
        "done = {}\ndef submit(key, amount):\n    if key in done:\n        if done[key]['amount'] != amount: raise ValueError('key conflict')\n        return done[key]\n    done[key] = {'amount':amount,'status':'accepted'}\n    return done[key]\nprint(submit('refund-A100-1', 20))\nprint(submit('refund-A100-1', 20))",
        "重复执行同一键，再换金额，观察冲突。把内存结构替换为 SQLite 唯一键；确保插入与业务变更同一事务。",
        "写入工具超时，能否立刻换一个新请求 ID 再试？",
        [
          "可以",
          "不安全，应确认执行状态并复用幂等意图",
          "超时一定没有执行"
        ],
        1,
        "超时只代表调用方未收到确定结果。",
        "为只读查询、退款提交、邮件发送分别制定重试规则。"
      ]
    ]
  ],
  [
    "04",
    "MCP 协议：从旧版到 2026",
    [
      [
        "MCP 的架构与能力边界",
        "区分 Host、Client、Server，以及 Tools、Resources、Prompts。",
        [
          "MCP 标准化应用与外部能力提供方的交互。Host 组织模型、权限及若干 MCP client；Server 提供业务能力。模型不直接处理网络协议，而由 Host 把可用工具映射到模型所需格式。MCP 不是大模型，也不是 Agent Runtime。",
          "Tools 用于执行动作或查询；Resources 提供可通过 URI 访问的材料；Prompts 提供可复用的任务输入模板。选择哪一种能力取决于宿主支持及场景。文件资源、工具返回和 prompt 都要经过权限与来源检查。",
          "例如订单 MCP Server 提供 query_order 工具、policy://refund 资源和 refund_review 模板。Host 可用 resource 读取规则，再由模型选择 query_order。模板不授予执行权限；真实退款仍必须经过业务服务。"
        ],
        "Host / Agent Runtime → MCP Client → MCP Server → 企业 Service",
        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"query_order\",\"arguments\":{\"order_id\":\"A100\"}}}",
        "逐字段解释两条消息。它们只是方法主体示例，尚未展示具体协议版本的必要元数据和 HTTP 头，不能直接当完整现代请求发送。",
        "Tool Calling 与 MCP 是同一个东西吗？",
        [
          "是",
          "不是，前者是模型调用意图，后者是应用接入能力的协议",
          "MCP 是模型训练方式"
        ],
        1,
        "标准协议可以承载工具调用，但也包含其他能力。",
        "画出两个 MCP Server 与一个 Host 的连接关系，解释工具名称冲突如何处理。"
      ],
      [
        "JSON-RPC 与两代生命周期",
        "理解握手时代与 2026-07-28 无状态核心的变化。",
        [
          "JSON-RPC 消息包含 jsonrpc、method、params 和请求 id；响应通过相同 id 对应 result 或 error。协议错误与工具执行失败是不同的层次，工具运行失败通常作为工具结果描述。",
          "旧版 MCP（例如 2025-11-25）使用 initialize / notifications/initialized 进行能力协商，再调用 tools/list 和 tools/call。2026-07-28 规范改变为无状态核心，不再要求初始化握手，版本与客户端能力等随请求传递；新旧 SDK 的支持情况需实际核查。不要把旧教程的握手过程当成所有版本的必经步骤。",
          "新版 HTTP 核心利于负载均衡和无会话部署；支持路由头、列表缓存提示及扩展机制。无状态协议不意味着业务数据无需持久化，审批、订单与长期任务仍有自身状态。开发时先选 SDK 支持的版本，再按对应规范调试；不要手写未经校验的新版本 wire envelope。"
        ],
        "旧版：initialize → initialized → list → call；新版：自包含请求 → 响应",
        "import json\nrequest = {'jsonrpc':'2.0','id':42,'method':'tools/list'}\nresponse = {'jsonrpc':'2.0','id':42,'result':{'tools':[]}}\nassert request['id']==response['id']\nprint(json.dumps(response))",
        "这是纯 JSON-RPC 关联 ID 实验。比较 2025-11-25 与 2026-07-28 官方生命周期，再用 SDK/Inspector 捕获实际消息。",
        "2026-07-28 现代协议核心是否仍必须先 initialize？",
        [
          "必须",
          "不再要求旧式握手",
          "所有版本都从来没有握手"
        ],
        1,
        "新版移除了旧式初始化握手；兼容旧版的客户端仍可能使用握手。",
        "写一张版本兼容表：协议版本、生命周期、传输、客户端/服务端 SDK，记录实际版本。"
      ],
      [
        "Tools / Resources / Prompts 与传输",
        "了解工具发现、资源 URI、模板，以及 stdio 和 HTTP 的部署差异。",
        [
          "tools/list 是工具目录，tools/call 是调用方法；资源使用 URI 标识，按对应资源方法列出或读取；prompt 的参数用于填充模板。列表可能分页或需要刷新。模型通常只获得当前任务相关且获授权的定义，而非所有服务完整目录。",
          "stdio 适合本地子进程：标准输入输出传协议消息，普通日志写 stderr。Streamable HTTP 适合网络服务；采用 HTTPS、认证、资源级授权、速率与请求大小限制。旧式 HTTP+SSE 与 Streamable HTTP 不应混称为同一种传输。",
          "现代 MCP 目录可有缓存提示；缓存不能跨越不同身份或权限。工具声明的 readOnly 等提示是描述信息，不能当授权证明。返回内容可能有文本或结构化结果，适配器应限制大小、保留业务错误和来源。"
        ],
        "stdio 子进程 / Streamable HTTP → 同类 MCP 能力 → 业务服务",
        "from mcp.server.fastmcp import FastMCP\nmcp = FastMCP('orders')\n@mcp.tool()\ndef query_order(order_id: str) -> dict:\n    '''查询模拟订单，只读。'''\n    return {'id':order_id,'status':'paid' if order_id=='A100' else 'not_found'}\nif __name__ == '__main__':\n    mcp.run(transport='stdio')",
        "保存为 server.py；采用旧版兼容实验 pip install 'mcp>=1,<2'。用 MCP Inspector 选择 stdio，启动 python server.py，观察列表和调用。该实验不是新版协议兼容性声明。",
        "stdio 服务能把普通 debug 日志随意打印到 stdout 吗？",
        [
          "可以",
          "不应该，可能污染协议流",
          "只有 Windows 不行"
        ],
        1,
        "stdio 协议输出应与普通日志分开。",
        "新增一个退款规则 resource 和一个审阅 prompt，并用 Inspector 查看宿主是否支持。"
      ],
      [
        "手写 MCP Client 与工具适配",
        "将 MCP 工具接入自己的 Runtime，而不是依赖 Gradio。",
        [
          "客户端首先建立 SDK 所需的连接，取得工具目录，把 inputSchema 转换为模型所需的工具定义并维护工具名到 Server 的映射。模型提出调用时，Client 调用对应 Server，返回内容再转换成模型结果消息。",
          "下面使用旧版兼容 SDK 完成 stdio Client，与上一课 server.py 配套。旧版初始化在客户端显式执行；新版 SDK 可能自动处理兼容和现代请求。真实部署固定依赖并查阅对应版本迁移说明，不能假定所有 SDK 都采用同样方法名。",
          "适配层需要统一超时、错误分类、输出大小、身份和审计。工具响应中的自然语言不是命令。一个来自 Server 的工具可能要求授权或中途交互；现代扩展需要双方支持，不应假定所有 host 都实现。"
        ],
        "MCP Client list_tools → 转换定义 → LLM → call_tool → 转换结果",
        "import asyncio, sys\nfrom mcp import ClientSession, StdioServerParameters\nfrom mcp.client.stdio import stdio_client\nasync def main():\n    spec = StdioServerParameters(command=sys.executable,args=['server.py'])\n    async with stdio_client(spec) as (r,w):\n        async with ClientSession(r,w) as s:\n            await s.initialize()\n            listed = await s.list_tools()\n            print(listed)\n            result = await s.call_tool('query_order',{'order_id':'A100'})\n            print(result)\nasyncio.run(main())",
        "与 server.py 放同一目录，运行 python client.py。将 order_id 改为不存在的编号，观察业务结果。接着把 call_tool 包装为 Runtime 的执行器，保留调用 ID。",
        "为什么不能直接把所有 MCP 工具返回给所有用户？",
        [
          "因为工具会自动消失",
          "因为目录和执行都必须受身份、租户和权限约束",
          "因为只允许一个 MCP Server"
        ],
        1,
        "目录发现与执行授权是两个都要保护的阶段。",
        "设计本地函数和 MCP 工具共用的 ToolAdapter 接口，允许同名工具命名空间。"
      ]
    ]
  ],
  [
    "05",
    "Context Engineering 与记忆",
    [
      [
        "上下文预算与信息优先级",
        "控制每轮真正送给模型的信息，而不是无条件追加历史。",
        [
          "随着 Agent 不断调用工具，上下文持续增长。更多信息不一定更好：无关文档干扰决策，长历史消耗成本、延迟和注意力。上下文工程就是为下一次推理挑选必要信息，并为输出留足预算。",
          "优先保留系统约束、当前任务、必要工具定义、近期关键消息及与任务相关的事实。旧历史可以摘要，但摘要不能替代审计记录；必须保持调用与结果的关联，不让模型看到一半工具消息。",
          "分层组装是一种实用方案：稳定指令、任务计划、动态工具、证据、近期对话分别管理。对工具大结果只返回摘要和可继续读取的引用。生产使用对应模型 tokenizer 或 API usage 计算真实预算，以下字符预算仅教学。"
        ],
        "固定约束 + 当前任务 + 必要工具 + 筛选证据 + 输出预留",
        "def pack(items,budget):\n    selected=[]\n    for item in sorted(items,key=lambda x:-x['priority']):\n        if len(item['text']) <= budget:\n            selected.append(item['text']); budget-=len(item['text'])\n    return selected\nitems=[{'priority':10,'text':'必须验证权限'},{'priority':9,'text':'订单A100'},{'priority':1,'text':'无关闲聊'*20}]\nprint(pack(items,20))",
        "改变预算与优先级。解释为什么系统约束不能被普通历史挤掉；此算法只演示选择，不是生产消息裁剪器。",
        "上下文裁剪可以只删 tool 消息、保留对应调用吗？",
        [
          "通常不应，应保留配对或一致摘要",
          "可以，模型知道结果",
          "可以，调用 ID 不重要"
        ],
        0,
        "断裂的调用与结果会产生无效或误导上下文。",
        "设计组装函数，规定稳定指令不可裁剪、输出有保留预算、工具结果可替换为引用。"
      ],
      [
        "短期状态、长期记忆与数据治理",
        "区分任务状态、会话历史和可复用记忆。",
        [
          "任务状态用于恢复当前执行，例如待审批、已读订单、已完成步骤。会话历史服务于对话连贯。长期记忆保存跨任务确实有用且允许保存的信息，例如用户偏好的报表格式。三类信息有不同保留期和访问范围。",
          "记忆不是自动保存所有聊天。应用选择内容、来源、时间、置信度和租户；读取时检查访问权限、是否过时、是否与当前任务相关；支持修改、删除和过期。模型生成的猜测不能未经验证就写为确定事实。",
          "企业中，正式订单状态必须以业务数据库为准，不能以向量记忆覆盖实时事实。记忆可能与新消息冲突，优先使用更可靠、更近且有权限的来源；需要时请求用户确认。"
        ],
        "写入候选 → 验证与授权 → 持久化 → 检索 → 相关性过滤 → 上下文",
        "import sqlite3\nc=sqlite3.connect(':memory:')\nc.execute('CREATE TABLE mem(tenant TEXT, key TEXT, value TEXT, PRIMARY KEY(tenant,key))')\nc.execute('INSERT INTO mem VALUES(?,?,?)',('t1','format','table'))\nprint(c.execute('SELECT value FROM mem WHERE tenant=? AND key=?',('t1','format')).fetchone())",
        "查询 t2 应返回 None；再演示更新和删除。真实系统还要有记录来源、过期时间、审计与授权。",
        "长期记忆可以替代正式业务数据库的实时状态吗？",
        [
          "可以",
          "不可以，正式业务数据应以授权业务源为准",
          "只要使用向量库就可以"
        ],
        1,
        "记忆不是权威交易记录。",
        "设计一个 memory 表与 task checkpoint 表，说明二者的生命周期和删除策略。"
      ],
      [
        "上下文安全与 Prompt Injection",
        "识别不可信内容，建立模型之外的防御。",
        [
          "来自网页、文件、MCP 工具的文字可能包含要求泄露信息、执行命令或忽略规则的指令。它们属于外部数据，不应获得系统指令权限。单纯在提示中写『不要被注入』无法保证安全。",
          "将来源显式标注，把可信指令和外部内容分离；通过工具权限白名单、参数约束、数据访问控制和人工审批限制实际能力。模型即使产生危险调用也必须被执行器拒绝。敏感数据不可无条件发送给第三方工具。",
          "实验重点是验证边界而不是攻击外部系统：虚构文档要求导出全部客户资料，模型提出 export 调用；Policy 检查此任务只允许 query_order，拒绝执行并记录事件。生产系统还应检测异常数据流、限制网络和出站数据。"
        ],
        "不可信文档 → 标注来源 → 模型候选动作 → 独立授权 → 执行或拒绝",
        "allowed = {'query_order'}\nproposed = {'name':'export_all_customers','arguments':{}}\nif proposed['name'] not in allowed:\n    print('DENIED: tool is outside task scope')\nelse:\n    print('execute')",
        "将工具名改为 query_order，注意通过工具名白名单也不等于参数和资源有权；再添加租户检查。",
        "哪一层可以真正阻止模型提出的越权写入？",
        [
          "只靠系统提示",
          "独立服务端授权和执行策略",
          "隐藏按钮"
        ],
        1,
        "提示只是影响决策，真正阻断必须在执行边界。",
        "设计包含注入文本的虚构 RAG 文档，并为被拒绝的工具调用写测试。"
      ]
    ]
  ],
  [
    "06",
    "RAG 与大规模 Tool Search",
    [
      [
        "RAG：知识为什么要检索",
        "掌握索引、召回、上下文组装、证据引用的链路。",
        [
          "LLM 的训练知识不适合回答公司最新制度。RAG 从获授权的材料检索相关片段，将证据提供给模型生成回答。典型流程包含文档清洗、切分、索引、检索、重排、组装和引用。每一步的误差都可能传到最终答案。",
          "切分不是越小越好：太小丢失上下文，太大引入噪声。应保留标题、章节、文档 ID、版本、权限等元数据。编号和专有名词适合关键词，语义相似内容适合向量，混合检索可组合优势。",
          "模型回答应附可验证来源并明确无证据的情况。检索结果不可靠时不应编造制度。RAG 不等同于微调：前者通过输入带来外部材料，后者改变模型参数。"
        ],
        "企业文档 → 切分+索引 → 查询召回 → 重排 → 证据 → 答案",
        "docs=[{'id':'P1','text':'refund policy paid pending'},{'id':'P2','text':'shipping logistics tracking'}]\nq=set('refund paid'.split())\nranked=sorted(docs,key=lambda d:-len(q&set(d['text'].split())))\nprint(ranked[0]['id'],ranked[0]['text'])",
        "修改查询为 shipping，观察结果变化。示例是英文空格关键词检索；中文需分词或专用检索，不是向量 RAG。",
        "RAG 找不到支持答案的证据时应怎样？",
        [
          "编造一个来源",
          "明确缺少证据或继续授权检索",
          "忽略文档直接保证正确"
        ],
        1,
        "证据不足应显式处理。",
        "用三份虚构制度设计文档元数据、切分策略和来源引用格式。"
      ],
      [
        "Embedding、相似度与重排",
        "用简单例子理解向量检索，不要求复杂数学。",
        [
          "Embedding 将文本映射到向量空间，使一些含义相近的文本在模型定义的空间中接近。余弦相似度衡量方向接近程度，范围通常为 -1 到 1；不能把相似度直接当作答案正确概率。",
          "向量召回先缩小候选范围，重排再按查询与候选的细粒度关系排序。企业搜索还需结合精确编号、日期、语言、元数据和权限过滤。真实 embedding 来自训练好的模型，下面手工向量仅为演算。",
          "测试时同时关注召回率与精确率：正确文档若没有出现在候选中，后续模型无法恢复；候选太多又会消耗上下文。固定测试集，比较不同切分、top_k、重排策略。"
        ],
        "文本 → embedding → 相似度召回 → reranker → top-k",
        "from math import sqrt\ndef cosine(a,b):\n    return sum(x*y for x,y in zip(a,b))/(sqrt(sum(x*x for x in a))*sqrt(sum(y*y for y in b)))\nq=[1,0.1]\nfor name,v in [('订单',[1,0.2]),('天气',[0.1,1])]:\n    print(name,round(cosine(q,v),3))",
        "手工调换向量方向，理解排名变化。代码假设非零且同维；生产调用 embedding 服务并处理版本与维度一致性。",
        "相似度高就代表文档中一定存在正确答案吗？",
        [
          "是",
          "否，只代表向量匹配程度",
          "相似度就是事实概率"
        ],
        1,
        "检索相关性不等于事实正确性。",
        "构建 10 条问题与正确文档标注，计算 recall@3，并记录漏召回原因。"
      ],
      [
        "Tool Search 与动态工具加载",
        "解决大量工具导致上下文膨胀、工具混淆的问题。",
        [
          "如果企业接入数千工具，全部 schema 放入模型会扩大上下文，增加歧义与成本。Tool Search 先按身份和任务范围过滤，再通过名称、描述、分类、示例做召回与排序，把少量候选完整定义提供给模型。模型仍负责最后选择。",
          "Tool Search 检索的是能力，不是知识；候选需要能实际执行。动态工具加载还需管理 schema 版本、服务可用性、命名冲突、缓存与授权变化。召回不到正确工具时应扩大搜索或请求澄清，不允许模型编造工具。",
          "评估要区分候选召回率和模型选择准确率：正确工具未召回是检索问题；正确工具在列表里仍选错可能是模型或描述问题。真实系统还需衡量工具调用成本与业务成功率。"
        ],
        "全部工具 → ACL 过滤 → 检索候选 → 完整 schema → 模型选择 → 授权执行",
        "tools=[('query_order','order status','sales'),('refund','order refund','finance'),('search_policy','policy','sales')]\nq={'order','status'}\ncandidates=[t for t in tools if t[2]=='sales']\nranked=sorted(candidates,key=lambda t:-len(q&set(t[1].split())))\nprint([t[0] for t in ranked[:2]])",
        "模拟 finance 权限被撤销，确认退款工具不会进入候选。然后测试同义词漏召回；可以用混合检索替代简化关键词。",
        "正确工具根本未进入候选，应该首先优化什么？",
        [
          "工具召回与权限筛选",
          "直接修改最终回答的语气",
          "让模型执行不存在的工具"
        ],
        0,
        "先定位错误阶段，再选择优化手段。",
        "生成 100 个虚构工具与 20 个标注任务，记录 recall@5 和最终选择准确率。"
      ]
    ]
  ]
];
