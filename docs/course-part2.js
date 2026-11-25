window.COURSE_PART2 = [
  [
    "07",
    "Agent Harness 与现代能力扩展",
    [
      [
        "Harness：模型之外的工程体系",
        "理解工具、运行环境、权限和观察机制如何共同支撑智能体。",
        [
          "同一个模型在普通聊天和代码助手中的表现差异，很大程度来自外部运行系统。Harness 包括模型适配器、上下文组装、工具目录、执行器、工作区、权限、事件记录和停止条件。它是架构概念，不是所有厂商共享的固定协议。",
          "可以把模型看成一个产生下一步行动建议的组件，而 Harness 决定这个建议能否被执行、执行到哪里、如何反馈和如何恢复。例如代码助手提出修改文件，文件工具只能操作指定工作区，运行器记录 diff，测试工具返回结果供下一轮决策。",
          "企业 Harness 应保持业务规则在确定性服务中。把工具调用转化为事件，便于记录开始、成功、拒绝、失败和取消。避免为了架构完整而提前引入复杂组件：从单模型、少量只读工具开始，根据真实失败扩展。"
        ],
        "任务 → 上下文 → 模型 → Policy → Tool → 事件与观察 → 下一轮",
        "events=[]\ndef invoke(name, fn):\n    events.append(('start',name))\n    try:\n        result=fn()\n        events.append(('success',name))\n        return result\n    except Exception:\n        events.append(('failure',name))\n        raise\nprint(invoke('query_order',lambda:{'status':'paid'}))\nprint(events)",
        "将函数改为抛出异常；观察事件顺序。增加拒绝事件并确保拒绝时 handler 没有运行。",
        "Harness 是否等同于某个特定大模型？",
        [
          "是",
          "不是，是模型外部的运行支撑体系",
          "只是一套 UI"
        ],
        1,
        "模型与运行系统有独立职责。",
        "画出企业订单助手的 Harness 组件图，标出模型、权限、工具和日志的边界。"
      ],
      [
        "Skills、Plugins 与按需加载",
        "区分可执行工具、可复用知识流程与能力打包。",
        [
          "Tool 是可以调用的动作；Skill 是可复用的任务方法、说明及相关资源；Plugin 常用于打包并分发一组能力。不同宿主的 Skill、Plugin 文件约定不同，不要把产品私有机制误认为 MCP 通用规范。",
          "例如月度质量稽核 Skill 描述检查步骤、所需字段和报告标准，MCP tools 负责查询项目和制度。Skill 不会自动获得数据库权限。可先读取技能摘要，仅在任务匹配时加载详情，以降低上下文占用。",
          "技能与插件属于供应链的一部分。使用来源明确的内容，审查其依赖、网络访问和工具权限，固定版本；禁止第三方说明覆盖系统安全约束。企业可把标准业务 SOP 做成只读技能，并由业务服务强制审批规则。"
        ],
        "技能目录 → 任务匹配 → 加载说明与资源 → 模型 → 授权工具",
        "skills={'audit':{'summary':'项目稽核','steps':['读取制度','核对项目','输出差异']},'report':{'summary':'生成报表','steps':['读取数据','汇总']}}\ndef load_skill(name):\n    return skills[name]['steps']\nprint([v['summary'] for v in skills.values()])\nprint(load_skill('audit'))",
        "增加一个合同审查 Skill，只加载匹配任务的详情。列出它需要的工具，但不要把工具权限写成可由技能覆盖的规则。",
        "Skill 声明可以访问客户库，就自动获得权限吗？",
        [
          "可以",
          "不可以，仍须独立授权",
          "只要技能是 Markdown 就可以"
        ],
        1,
        "任务说明不具备权限授予能力。",
        "编写一份质量稽核技能说明：输入、步骤、产出、所需工具、禁止操作。"
      ],
      [
        "Hooks、沙箱与工作区",
        "在生命周期的正确位置加入确定性控制。",
        [
          "Hook 是在执行前后、任务开始或结束等事件处触发的程序逻辑。常用于策略检查、审计、指标和清理。执行前 Hook 可以拒绝某个动作，执行后 Hook 可以记录结果，但不能在失败时伪造成功。",
          "沙箱是隔离执行环境的机制。对于文件类工具，限制根目录、路径解析、符号链接、文件大小；对于代码或命令执行，使用操作系统级隔离、最小权限、网络白名单和资源配额。仅通过字符串黑名单无法建立可靠沙箱。",
          "企业内部工具应尽可能直接暴露受控业务操作，而不是暴露万能 shell。每次执行使用明确的身份与任务工作区，敏感数据不写普通日志。下面的 hook 示例只是应用层权限检查，不是操作系统沙箱。"
        ],
        "before hook → 检查 → handler → after hook → 审计",
        "def invoke(name,fn,allowed):\n    if name not in allowed: raise PermissionError(name)\n    try:\n        return fn()\n    finally:\n        print('audit:',name)\nprint(invoke('read',lambda:'demo',{'read'}))",
        "调用 write 并确认被拒绝。扩展为基于角色的策略，再为拒绝事件记录不含敏感数据的日志。",
        "限制命令字符串就足以隔离任意生成的代码吗？",
        [
          "足够",
          "不足够，需要可信执行边界及资源隔离",
          "只有 Python 需要隔离"
        ],
        1,
        "字符串检查不能替代操作系统隔离。",
        "为文件读取工具列出目录、身份、文件类型、大小及审计要求。"
      ]
    ]
  ],
  [
    "08",
    "任务规划、工作流与多智能体",
    [
      [
        "选择工作流还是 Agent",
        "理解路由、并行、链式处理及自主决策的适用范围。",
        [
          "成熟企业业务通常已有明确规则。规则固定的流程可以用程序编排：先读取订单，再校验状态，最后生成审核记录。模型只负责自然语言理解或解释。开放任务可能需要根据观察选择不同工具，此时才需要 Agent 循环。",
          "典型模式有链式处理、路由、并行、协调者分派和评估后修订。链式适合可分步骤的任务；路由适合输入类型不同；并行适合独立子任务；协调者适合难以预先枚举子任务的情况；评估后修订适合有明确质量标准的产出。",
          "选择最简单可测的模式。若规则可以用代码表达，就不要让模型每次猜规则。Agent 的灵活性伴随延迟、成本和不确定性；先测固定流程的基线，再评估自主方案是否带来实际收益。"
        ],
        "输入分类 → 确定性路由 → 专用流程 / 受控 Agent → 验收",
        "def route(kind):\n    if kind=='status': return 'read_only_workflow'\n    if kind=='refund': return 'approval_workflow'\n    return 'investigation_agent'\nfor kind in ['status','refund','unknown']:\n    print(kind,route(kind))",
        "给每种流程设计完成条件，加入不支持的类型，讨论何时拒绝而非交给调查 Agent。",
        "明确的财务审批规则应首先用什么实现？",
        [
          "确定性业务规则与工作流",
          "每次让模型自由决定",
          "越多 Agent 越好"
        ],
        0,
        "明确规则不应被概率决策替代。",
        "将一个企业请假流程拆成确定性步骤与可以使用模型的步骤。"
      ],
      [
        "Plan、状态机与中断恢复",
        "构建可验证的任务步骤和持久化执行状态。",
        [
          "规划可由模型产生候选步骤，但每一步都应有可执行工具、输入约束和完成条件。执行期间观察结果可能推翻原计划。保存已完成事实和待处理步骤，而不是只保存一段模型生成的计划文字。",
          "状态机通过合法转换限制流程，例如 pending → approved → executed；拒绝或取消走其他终止状态。恢复时读取 checkpoint，并确认外部副作用是否已发生。不能仅根据上次聊天记录判断业务是否执行成功。",
          "实际系统可使用数据库事务或成熟工作流引擎保存状态，处理并发、租约、版本检查与事件重复。下面例子只展示合法转换，不提供并发或持久化保障。"
        ],
        "计划 → 状态校验 → 执行步骤 → checkpoint → 恢复 / 下一步",
        "transitions={'pending':{'approved','rejected'},'approved':{'executed','cancelled'}}\ndef move(state,target):\n    if target not in transitions.get(state,set()): raise ValueError('illegal transition')\n    return target\nstate=move('pending','approved')\nprint(move(state,'executed'))",
        "尝试从 pending 直接转 executed。使用 SQLite 保存状态，再模拟进程重启，恢复后不得重复写入。",
        "恢复时发现写入结果未知，应怎么处理？",
        [
          "重新生成新业务请求执行",
          "先查询外部状态，结合幂等键确定是否重试",
          "直接标为成功"
        ],
        1,
        "恢复需要核对真实副作用。",
        "定义审批工作流的状态、事件、合法转换、终止状态和 checkpoint 字段。"
      ],
      [
        "Subagent、Multi-Agent 与人工介入",
        "理解委派的成本，并设计受控交接。",
        [
          "子智能体是主任务委派的独立执行单元，可以具有不同工具和上下文。多智能体并非必须由不同模型构成；多个角色使用同一模型也可以形成不同任务边界。交接应包含任务、必要证据、预期输出、权限范围和预算。",
          "例如一个 Agent 搜索制度，另一个审阅结果是否有证据，协调者汇总。若仅查询一个订单，分成多个 Agent 通常增加成本和失败点。跨 Agent 内容也是不可信数据，不能因为来自另一个 Agent 就跳过授权。",
          "人工介入适合不可逆写操作、金额较大、证据不足或规则要求人工决策的情况。审批记录应绑定具体操作和参数，不能将一次批准扩大成所有未来动作。人可以拒绝或修改，执行器检查批准是否仍有效。"
        ],
        "协调者 → 限权子任务 → 结构化结果 → 验收 → 必要时人工确认",
        "def research(task): return {'evidence':['P1'],'question':task}\ndef review(result): return {'accepted':bool(result['evidence']),'evidence':result['evidence']}\nprint(review(research('退款规则是什么')))",
        "让 research 返回空 evidence，验证审阅拒绝。为交接增加 tenant、budget 与允许工具字段；实际服务端需验证这些字段。",
        "多智能体是否必然比单 Agent 更准确？",
        [
          "必然",
          "不一定，需要评估收益、成本和错误传播",
          "只取决于角色名字"
        ],
        1,
        "协作增加能力的同时也增加接口和失败点。",
        "设计研究、审阅两种角色的输入输出契约，明确哪些权限不能转交。"
      ]
    ]
  ],
  [
    "09",
    "企业安全、架构与生产可靠性",
    [
      [
        "身份、RBAC、多租户与资源授权",
        "设计模型不能绕过的企业权限体系。",
        [
          "认证验证主体身份；授权决定主体是否可以在当前租户对特定资源执行动作。角色权限 RBAC 可结合资源属性与任务上下文。模型给出的 user_id、tenant_id 或 is_admin 只是输入，不能作为可信凭据。",
          "目录层过滤无权工具，执行层再次检查工具、参数和资源归属，业务服务最终校验数据库查询范围。不要因为工具是只读就放松数据权限：读取工资、客户信息或合同同样有风险。",
          "生产应用应使用短期授权凭据、安全的密钥存储和最小权限服务账号。对 MCP HTTP 端点使用所选协议版本要求的授权机制及 TLS；不能把 OAuth 登录成功等同于全部业务资源授权。"
        ],
        "认证 → 主体与租户 → 工具授权 → 资源归属 → 执行 → 审计",
        "orders={'A100':{'tenant':'t1','status':'paid'}}\ndef query(principal,order_id):\n    item=orders.get(order_id)\n    if not item or item['tenant']!=principal['tenant'] or 'read_order' not in principal['permissions']:\n        raise PermissionError('not accessible')\n    return item['status']\nprint(query({'tenant':'t1','permissions':{'read_order'}},'A100'))",
        "将 tenant 改为 t2，确认拒绝。再移除 read_order 权限。principal 在真实系统中由认证中间件构造，不应接受模型指定。",
        "模型传入 is_admin=true，服务可以据此放行吗？",
        [
          "可以",
          "不可以，必须基于可信认证和授权状态",
          "有 JSON Schema 就可以"
        ],
        1,
        "格式正确不代表身份可信。",
        "设计订单查询、退款审批、退款执行三个权限及资源过滤规则。"
      ],
      [
        "Model Gateway、流式输出与成本预算",
        "设计统一模型接口及真实运行预算。",
        [
          "Model Gateway 将供应商特定消息与工具格式转换为内部结构，并统一错误、用量、超时与模型配置。不能假设所有模型支持相同的工具、结构化输出、图片或上下文长度；维护能力表并对不支持的功能明确降级。",
          "流式 API 可能逐段返回文本或工具参数。不要看到部分 JSON 就执行工具，应等待完整调用事件并解析校验。用户界面以后接入也不改变运行时事件协议；现在可以通过 CLI 或日志观察事件。",
          "成本管理包含请求次数、输入输出 Token、模型选择、上下文压缩、缓存和工具费用。预算由服务器强制，不能仅要求模型节省费用。故障转移必须确认数据处理权限，不能把敏感上下文自动发送到未批准供应商。"
        ],
        "业务请求 → Gateway → 供应商适配器 → 标准事件 → Runner",
        "class Budget:\n    def __init__(self,limit): self.left=limit\n    def consume(self,n):\n        if n>self.left: raise RuntimeError('budget exhausted')\n        self.left-=n\nb=Budget(3)\nfor _ in range(3): b.consume(1)\nprint(b.left)",
        "第四次调用应失败。把次数预算扩展为 token、费用、时间三种限制。费用使用实际接口的计费数据，不用固定假设替代。",
        "工具参数还在流式传输时，可以直接执行吗？",
        [
          "可以",
          "应等待完整调用并校验",
          "只要看到工具名即可"
        ],
        1,
        "不完整参数可能无效或改变业务含义。",
        "定义 ModelAdapter 的 request/response/events 接口，支持两个模型但保留能力差异。"
      ],
      [
        "可观测性、审计与故障隔离",
        "让每一次智能体任务可以追踪、诊断和治理。",
        [
          "一次任务可能包含模型请求、工具选择、检索、审批、执行与重试。Trace 用同一个 trace_id 关联跨组件事件；Span 记录单次操作的开始结束、状态和耗时。指标聚合任务成功率、拒绝率、Token 用量与延迟，日志用于排查具体错误。",
          "审计不同于普通 debug 日志：它需要可信的主体、资源、动作、结果、时间与审批证据，并满足留存与访问要求。不要默认记录完整系统提示、密钥、客户文件或模型私有推理。对日志字段实施脱敏和访问控制。",
          "故障隔离包括限流、连接池、超时、并发控制与熔断。异步长任务应有持久状态和可取消机制。模型或外部工具不稳定时，系统应返回明确的部分完成或失败状态，而非声称成功。"
        ],
        "trace_id → 模型 span → 工具 span → 策略事件 → 指标与审计",
        "import time,uuid\ntrace_id=str(uuid.uuid4())\nstart=time.monotonic()\nstatus='ok'\ntry:\n    result={'status':'paid'}\nexcept Exception:\n    status='failed'; raise\nfinally:\n    print({'trace_id':trace_id,'tool':'query_order','status':status,'ms':round((time.monotonic()-start)*1000,2)})",
        "扩展为两次工具调用共用 trace_id。记录拒绝、超时与业务失败类别，检查日志中是否含有客户隐私。",
        "审计是否需要默认保存所有工具完整请求和响应？",
        [
          "是",
          "不一定，应最小化并按合规要求保存必要证据",
          "必须记录密钥方便排错"
        ],
        1,
        "可追踪与数据最小化应同时满足。",
        "制定指标面板：任务成功率、P95 延迟、权限拒绝、重试次数、每任务成本。"
      ]
    ]
  ],
  [
    "10",
    "成熟框架与 Java 企业落地",
    [
      [
        "OpenAI Agents SDK：运行器与交接",
        "将手写组件映射到成熟 SDK 的概念。",
        [
          "成熟 SDK 常提供 Agent 配置、工具注册、Runner、交接、追踪和上下文管理。它们减少样板代码，却不会自动知道企业审批规则。阅读源码或调试时应找出模型调用入口、工具执行器、停止条件和外部状态保存点。",
          "OpenAI Agents SDK 中可以定义 Agent 与函数工具，并通过 Runner 执行任务。多角色交接可用于专门任务，但工具权限仍需要应用层约束。下面是最小在线示例，需要安装 openai-agents、配置获授权的 API 和模型。",
          "对照自己的 Registry：函数装饰器负责提取定义；Runner 负责循环；工具函数依然是真正执行业务的地方。供应商版本可能变化，固定版本后再运行回归测试；不要在工具里暴露无授权生产查询。"
        ],
        "Agent 配置 → Runner → 模型 → function tool → 观察 → 结果",
        "import os\nfrom agents import Agent, Runner, function_tool\n@function_tool\ndef query_order(order_id: str) -> str:\n    '''查询虚构订单。'''\n    return 'paid' if order_id=='A100' else 'not found'\na=Agent(name='Order helper',instructions='查询订单必须使用工具',model=os.environ['OPENAI_MODEL'],tools=[query_order])\nprint(Runner.run_sync(a,'查询A100').final_output)",
        "安装 pip install openai-agents，配置 OPENAI_API_KEY 和 OPENAI_MODEL。运行前先指出 SDK 替你实现了哪些步骤；运行后观察调用追踪。未配置在线服务时只做架构对照。",
        "使用成熟 Agent SDK 后是否可以省略业务权限检查？",
        [
          "可以",
          "不可以，SDK 不知道企业资源授权规则",
          "只有多智能体才要检查"
        ],
        1,
        "框架管理执行不代表业务授权正确。",
        "用手写 Runtime 与 SDK 实现同一只读任务，比较消息、工具异常和停止条件。"
      ],
      [
        "LangGraph：状态图与恢复",
        "理解节点、边、状态与条件路由，不把图框架当作模型。",
        [
          "LangGraph 将执行过程表示为带状态的图。节点接受状态并返回更新，边决定下一步，条件边可以依据状态选择路径。它适合需要可控流程、循环、checkpoint 与人工介入的场景。",
          "可以先构建完全不使用模型的状态图，再把某个节点替换为模型调用。这能看清图引擎与 LLM 的分工。状态应保存必要数据和业务引用，不把整个敏感文档无限复制进每个节点。",
          "生产需要选择合适的持久化 checkpointer，设置任务标识、并发策略、恢复权限和副作用幂等。下例仅展示最简单的确定性节点，不表示已具备持久化或人工审批。"
        ],
        "START → 节点读取 → 状态更新 → 节点审阅 → END",
        "from typing import TypedDict\nfrom langgraph.graph import StateGraph, START, END\nclass State(TypedDict):\n    order_id: str\n    status: str\ndef lookup(s:State):\n    return {'status':'paid' if s['order_id']=='A100' else 'not_found'}\ng=StateGraph(State)\ng.add_node('lookup',lookup)\ng.add_edge(START,'lookup')\ng.add_edge('lookup',END)\napp=g.compile()\nprint(app.invoke({'order_id':'A100','status':''}))",
        "安装 pip install langgraph；加入 review 节点和条件路由，未找到订单时提前结束。对照第 8 模块状态机。",
        "LangGraph 的节点必须是 LLM 调用吗？",
        [
          "必须",
          "不必须，可以是确定性业务函数",
          "必须是 MCP Server"
        ],
        1,
        "图编排与模型推理是不同层次。",
        "将审批工作流建模为图，标出哪些状态需要 checkpoint。"
      ],
      [
        "Spring AI 与 Java 业务服务",
        "用熟悉的企业后端方式接入模型与 MCP。",
        [
          "Spring AI 提供模型抽象、聊天客户端、工具回调、结构化输出及 MCP 集成。先保留原有 Controller、Service、Repository、安全中间件和事务；在独立适配层将业务服务方法暴露为受控工具。不要为了引入 Agent 而重写已有业务。",
          "Java 中工具定义类似方法名、参数元数据和回调；框架可用注解或 ToolCallback 注册。具体包名、BOM、starter 与 Spring Boot 版本应按当前 Spring AI 官方文档匹配。模型 API 密钥使用环境变量或秘密管理服务。",
          "下面仅展示稳定的业务适配思路和一个 Spring AI @Tool 注解方法片段，不是完整 Maven 项目。实际完成项目时加入身份上下文、租户过滤、测试以及框架配置。写操作应通过原有事务服务及审批，不让模型直接操作 DAO。"
        ],
        "Spring Controller → Agent Service → Tool Adapter → Authorized Business Service → DB",
        "import org.springframework.ai.tool.annotation.Tool;\n\npublic class OrderTools {\n    @Tool(description = \"查询虚构订单状态，只读\")\n    public String queryOrder(String orderId) {\n        return \"A100\".equals(orderId) ? \"paid\" : \"not_found\";\n    }\n}",
        "创建兼容 Spring AI 的 Spring Boot 项目，将 OrderTools 注册到聊天客户端。先写普通 Java 单元测试，再接入模型并检查实际工具请求。此片段需自行加入依赖及配置。",
        "企业 Agent 是否应该直接绕过原有 Service 层访问所有数据库？",
        [
          "应该",
          "不应该，应复用有授权、事务及业务规则的 Service",
          "只要模型支持工具就可以"
        ],
        1,
        "Agent 只是新的交互和编排入口。",
        "为现有 Spring Boot 项目设计 ModelGateway、AgentService、ToolAdapter、Policy 四层接口。"
      ]
    ]
  ],
  [
    "11",
    "Agent Evaluation 与发布质量",
    [
      [
        "拆解准确率：检索、选择、参数、结果",
        "建立能够定位失败阶段的评估指标。",
        [
          "只看最终回答容易掩盖内部错误。工具检索候选是否包含正确工具、模型是否选择正确工具、参数是否匹配、执行是否成功、最终任务是否真正完成，都应分别记录。对不需要工具的任务还要测误调用率。",
          "例如 20 个需要订单工具的任务中，18 个正确工具被召回；其中 15 个正确选择；其中 13 个参数正确；最后 12 个任务满足业务断言。候选召回率与最终成功率是不同指标，后续优化应针对丢失最多且影响最大的环节。",
          "使用人工标注的虚构业务任务集，包含同义表达、无工具任务、缺参数、权限拒绝、工具失败与外部注入。固定模型版本、工具描述、配置与数据；重复运行记录波动，不将单次演示作为可靠性证明。"
        ],
        "任务集 → 候选 → 选择 → 参数 → 执行 → 业务断言 → 指标",
        "cases=[{'expected':'query','actual':'query','success':True},{'expected':'query','actual':'search','success':False},{'expected':None,'actual':None,'success':True}]\nprint('selection',sum(c['expected']==c['actual'] for c in cases)/len(cases))\nprint('task success',sum(c['success'] for c in cases)/len(cases))",
        "增加正确选择但参数错误的样本，两个指标会出现差异。对真实模型运行时采集结构化事件，而不是手填所有实际结果。",
        "正确选择工具但订单参数错误，最终任务一定成功吗？",
        [
          "一定",
          "不一定，需单独评估参数及业务结果",
          "不需要记录参数"
        ],
        1,
        "正确工具是必要条件之一，而非完整任务成功。",
        "建立 30 条评估任务，记录期望工具、参数、权限及最终断言。"
      ],
      [
        "回归测试、对抗样本与发布门禁",
        "把可靠性评估纳入正常开发流程。",
        [
          "传统单元测试适合验证 Registry、Policy、状态机和幂等逻辑；模型行为评估需要真实调用与统计。两者分开：确定性业务测试应稳定通过，模型测试允许统计波动但必须达到业务设定阈值。",
          "对安全场景使用明确的负面断言，例如跨租户读取必须拒绝、未审批写入必须不产生副作用、工具输出注入不能突破授权。用虚构数据和隔离环境，避免测试影响真实客户。",
          "发布门禁应按风险设定：安全关键测试必须通过，任务成功率不能显著下降，成本和延迟在目标范围。阈值由业务风险与测试规模确定；下面数字只用于演示，不是通用行业标准。"
        ],
        "修改 → 单元测试 → 模型评估 → 安全测试 → 成本比较 → 发布决策",
        "def gate(metrics):\n    return metrics['security_failures']==0 and metrics['task_success']>=0.85\nprint(gate({'security_failures':0,'task_success':0.9}))\nprint(gate({'security_failures':1,'task_success':0.99}))",
        "改变安全失败数，理解高成功率不能抵消越权。设计一个基线对比，保存模型版本、测试集版本和运行时间。",
        "任务成功率很高，但出现一次真实越权写入，应直接上线吗？",
        [
          "可以",
          "不应，需修复安全边界并重新验证",
          "只看平均分"
        ],
        1,
        "安全关键失败不能被平均指标掩盖。",
        "制定发布门禁文档，列出必须通过的安全与业务测试。"
      ]
    ]
  ],
  [
    "12",
    "毕业项目：企业级 Agent Runtime",
    [
      [
        "架构设计与最小可用实现",
        "把学习内容组合成不依赖前端的企业订单与项目助手。",
        [
          "毕业项目不是重新训练模型，而是构建可替换模型、可扩展工具、安全执行的运行系统。第一阶段只读：查询订单、查询项目进度、检索制度。第二阶段模拟审批提交，不连接生产系统。模型可先使用 FakeModel 测控制流，再接真实模型。",
          "推荐模块：models 负责供应商适配；registry 负责定义和路由；runner 负责循环；policy 管理主体、租户和权限；mcp 管理外部工具；retrieval 管理知识与候选；storage 保存 checkpoint 和审批；evaluation 保存测试集。接口应清晰，不必为了目录数量拆分无意义模块。",
          "任务成功必须由业务证据确认。初版可用 Python CLI、SQLite 和 MCP stdio。部署前再考虑 HTTP API、数据库迁移、真实身份系统、监控和运维。前端以后接入统一事件接口，不影响核心结构。"
        ],
        "CLI → ModelAdapter → Runner → Registry / Policy → Local / MCP → SQLite → Audit",
        "class OrderService:\n    def query(self,tenant,order_id):\n        data={('t1','A100'):'paid'}\n        return data.get((tenant,order_id),'not_accessible')\nservice=OrderService()\nprint(service.query('t1','A100'))\nprint(service.query('t2','A100'))",
        "将该服务接到上一版仓库 labs/agent.py 的 Registry；实现当前主体注入，不让模型提供 tenant；新增一个 MCP 只读工具。",
        "毕业项目最先应该完成哪个部分？",
        [
          "复杂前端页面",
          "安全的最小只读任务与完整执行闭环",
          "直接接生产退款"
        ],
        1,
        "先验证核心闭环，再逐步扩展副作用。",
        "提交架构图、工具契约、威胁模型和运行说明。逐步完成 4 种工具及权限测试。"
      ],
      [
        "毕业验收与企业上线差距",
        "能够用证据判断自己的 Agent 是否达到预期。",
        [
          "毕业验收至少覆盖：正常查询、未知订单、无工具回答、缺失参数、跨租户拒绝、审批前拒绝、重复请求、异常工具、步数超限、恢复与日志检查。对于真实模型，应运行单独的工具选择与任务成功率评估。",
          "交付文档应说明版本、依赖、环境变量、运行步骤、数据模型、工具权限、已知限制、测试结果和故障处理。不要把内存演示误称为生产级：真正上线还需身份集成、数据库事务、审计留存、负载测试、漏洞修复和数据治理。",
          "一个好的学习成果是能解释设计取舍，并且在工具新增、模型更换、权限变化时修改系统而不破坏其他模块。保留失败案例和修复记录，它们比漂亮的界面更能证明工程能力。"
        ],
        "验收任务 → 可复现运行 → 业务断言 → 风险清单 → 发布评审",
        "required={'query','tenant_denial','approval_denial','duplicate','budget','tool_error'}\npassed={'query','tenant_denial','approval_denial','duplicate'}\nprint('missing:',sorted(required-passed))",
        "把实际测试名称映射到验收项，执行 python -m unittest discover -s labs -v。补齐失败场景；不能以完成页面阅读替代真实实验。",
        "单元测试通过能证明生产环境已经安全可靠了吗？",
        [
          "能",
          "不能，还需要真实环境安全、负载、恢复及治理验证",
          "只要网站能打开就行"
        ],
        1,
        "教学验证和生产验收是不同等级。",
        "独立交付 CLI Agent、MCP 接入、测试报告、风险清单及部署设计；记录所有未完成项。"
      ]
    ]
  ]
];
