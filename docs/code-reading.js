window.CODE_READING = {
  "1": {
    "files": [
      "real_api_agent.py",
      "step_by_step.py"
    ],
    "intro": "第一章只观察本地订单查询。真实模型还没有参与，你不需要先读懂整个项目。请在 real_api_agent.py 中找到 OrderStore 类，再在 step_by_step.py 中找到 local 分支。",
    "blocks": [
      {
        "title": "业务工具到底在哪里？",
        "file": "real_api_agent.py",
        "code": "    def execute(self, name, args):\n        # 真实运行的本地数据库查询。数据库中是明确标注的虚构数据。\n        if name==\"query_order\":\n            if not isinstance(args,dict) or set(args)!={\"order_id\"} or type(args[\"order_id\"]) is not str:\n                return {\"error\":\"订单编号必须为字符串\"}\n            row=self.db.execute(\"SELECT payment,shipping FROM orders WHERE id=?\",(args[\"order_id\"],)).fetchone()\n            return {\"order_id\":args[\"order_id\"],\"payment\":row[0],\"shipping\":row[1]} if row else {\"status\":\"not_found\"}\n        if name==\"read_refund_policy\" and args=={}:\n            return {\"policy\":\"已支付且未发货的模拟订单可以提交退款申请，但须人工审批。\"}\n        return {\"error\":\"未知工具或无效参数\"}",
        "explain": [
          "def 定义函数；缩进表示函数体。self 类似 Java 实例方法中的 this，调用时不需要显式传入。name 是要调用的工具名称，args 是参数字典（可类比 Map<String,Object>）。",
          "第一段 if 判断当前请求是不是查询订单的工具，并检查参数里是否恰好有 order_id。第二段用数据库查询获取真实记录；问 A100 时，返回已付款、未发货。这里只使用事先创建的虚构订单。",
          "这段方法就是未来 Agent 可以使用的业务能力。它没有调用任何 AI，也不认识用户自然语言；把它理解为普通业务 Service 的入口即可。"
        ]
      },
      {
        "title": "为什么运行 local 不会产生模型费用？",
        "file": "step_by_step.py",
        "code": "        if a.stage == \"local\":\n            display(\"查询 A100\",query(store,\"query_order\",'{\"order_id\":\"A100\"}'))",
        "explain": [
          "运行 python step_by_step.py local 时，命令行的 local 赋值给 a.stage，进入这一分支。query(...) 直接执行本地查询；display(...) 把结果格式化为中文可读的 JSON。",
          "这段代码不经过 send 函数，因而不会请求外部模型。你在终端看到的是程序真实查询结果，不是模型生成的文本。"
        ]
      }
    ]
  },
  "2": {
    "files": [
      "real_api_agent.py",
      "step_by_step.py"
    ],
    "intro": "第二章关注同一个模型接收不同能力说明后，返回的结构如何变化。先读 step_by_step.py 的 send 方法，再看 request 分支，不需要记忆整个文件。",
    "blocks": [
      {
        "title": "模型的输入是消息和工具说明",
        "file": "step_by_step.py",
        "code": "def send(messages, tools=None, choice=None):\n    key = os.environ.get(\"AGENT_API_KEY\")\n    model = os.environ.get(\"AGENT_MODEL\")\n    base = os.environ.get(\"AGENT_BASE_URL\", \"https://api.openai.com/v1\")\n    if not key or not model:\n        raise ValueError(\"先配置 AGENT_API_KEY 和 AGENT_MODEL。\")\n    body = {\"model\":model, \"messages\":messages}\n    body[\"max_tokens\" if os.getenv(\"AGENT_CHAT_LEGACY_MAX_TOKENS\")==\"1\" else \"max_completion_tokens\"] = 1024\n    if tools is not None:\n        body[\"tools\"] = tools\n        if choice is not None:\n            body[\"tool_choice\"] = choice\n    display(\"实际请求正文（不含密钥）\", body)\n    result = post(base, \"/chat/completions\", key, \"chat\", body)\n    display(\"接口真实返回（仅使用虚构业务数据）\", result)\n    choice = result[\"choices\"][0]\n    if choice.get(\"finish_reason\") not in (None, \"stop\", \"tool_calls\"):\n        raise ValueError(\"输出未正常完成：\"+str(choice.get(\"finish_reason\")))\n    return choice[\"message\"]",
        "explain": [
          "messages 是一个列表，里面的每个字典表示一条消息。tools=None 表示调用 send 时可以不传工具；choice=None 同样表示工具选择方式可省略。Python 的 None 类似 Java 的 null。",
          "body 是实际请求内容。body[\"tools\"] = tools 只有传入工具时才执行，因此同样的模型与问题，可以对比有工具和无工具两种请求。",
          "post(...) 真正调用外部模型服务；display(...) 打印实际发送和返回的 JSON，方便你观察。这里使用的是 HTTP 接口的真实返回，不是写死的模型回答。",
          "result[\"choices\"][0] 取第一条候选回答；finish_reason 表示回答结束的原因。最后返回 message，由下一步代码决定模型是在回答问题还是申请调用工具。"
        ]
      },
      {
        "title": "为什么能在收到工具请求时停下来？",
        "file": "step_by_step.py",
        "code": "            messages=[{\"role\":\"system\",\"content\":SYSTEM},{\"role\":\"user\",\"content\":a.question or \"请查询 A100 的付款与发货状态。\"}]\n            msg=send(messages,None if a.no_tools else [TOOL],a.choice)\n            calls=msg.get(\"tool_calls\") or []\n            if not calls:\n                print(\"模型没有申请调用工具。回答：\",msg.get(\"content\"))\n                return\n            if a.no_tools:\n                raise ValueError(\"未提供工具却收到工具调用，请检查接口兼容性\")\n            if a.stage==\"request\":\n                print(\"到此停止：只是收到工具调用请求，尚未执行查询。\")\n                return",
        "explain": [
          "msg.get(\"tool_calls\") or [] 的意思是：如果响应没有工具调用，使用空列表。get 与 Java Map.get 类似；or [] 还处理值为 None 的情况。",
          "if not calls 表示列表为空，说明本轮没有待执行工具。request 分支直接 return，因而只观察模型提出的请求，还没调用业务程序。",
          "两个命令共用相同的系统指令和问题，区别只在是否提供 tools。这样比使用两个不同程序更适合比较。模型不一定选对，记录真实现象即可。"
        ]
      }
    ]
  },
  "3": {
    "files": [
      "real_api_agent.py",
      "step_by_step.py"
    ],
    "intro": "第三章重点读工具定义。先在源码里找到大写常量 TOOL，它是传给模型的说明书，不是实际执行函数。",
    "blocks": [
      {
        "title": "工具定义怎样告诉模型参数要求？",
        "file": "step_by_step.py",
        "code": "TOOL = {\n    \"type\":\"function\",\n    \"function\":{\n        \"name\":\"query_order\",\n        \"description\":\"根据订单编号查询虚构订单的付款和发货状态，只读。\",\n        \"parameters\":{\n            \"type\":\"object\",\n            \"properties\":{\"order_id\":{\"type\":\"string\",\"description\":\"订单编号，例如 A100\"}},\n            \"required\":[\"order_id\"],\n            \"additionalProperties\":False\n        }\n    }\n}",
        "explain": [
          "Python 的字典和 JSON 对象很相似，但源代码不是 JSON 文件：例如 Python 写 False，发送到模型接口时 json.dumps 会转换成 JSON 的 false。",
          "外层 type:function 表示自定义函数工具。function 内的 name 是工具名称，description 用自然语言说明用途，parameters 则是参数结构规范。",
          "order_id 是模型需要填写的字段。type:string 表示订单号应为字符串，required 表示它必填，additionalProperties:False 表示不接受其他字段。",
          "工具定义只是传给模型的说明，实际 Python 函数仍在自己的程序里。模型不应自行提供权限，也不能通过修改说明获得额外功能。不同供应商支持的结构限制有差异。"
        ]
      },
      {
        "title": "自动选择和强制选择由谁控制？",
        "file": "step_by_step.py",
        "code": "    if tools is not None:\n        body[\"tools\"] = tools\n        if choice is not None:\n            body[\"tool_choice\"] = choice",
        "explain": [
          "工具选择模式属于请求控制字段，不是模型训练算法。auto 让模型判断，none 禁止调用，required 要求至少调用一个工具（以具体接口支持为准）。",
          "先在普通问题上比较 auto 和 required。如果 required 让模型调用订单工具，并不证明它理解了订单需求；这是接口约束造成的行为。实验结束后，实际业务仍需校验参数。"
        ]
      }
    ]
  },
  "4": {
    "files": [
      "real_api_agent.py",
      "step_by_step.py",
      "test_step_by_step.py"
    ],
    "intro": "第四章把模型给出的工具名称和参数变成一次实际业务执行。只读两个位置：query 方法负责检查并调用，main 的 finish 路径负责把结果交回模型。",
    "blocks": [
      {
        "title": "先解析参数，再执行业务函数",
        "file": "step_by_step.py",
        "code": "def query(store, name, raw):\n    \"\"\"四种错误分别处理，便于定位。仅提供一个只读查询工具。\"\"\"\n    try:\n        args = json.loads(raw)\n    except (json.JSONDecodeError, TypeError):\n        return {\"error\":\"invalid_json\", \"说明\":\"参数字符串不是合法 JSON，尚未查询数据库。\"}\n    if name != \"query_order\":\n        return {\"error\":\"unknown_tool\", \"说明\":\"程序未注册这个工具，尚未查询数据库。\"}\n    if not isinstance(args, dict) or set(args) != {\"order_id\"} or type(args[\"order_id\"]) is not str:\n        return {\"error\":\"invalid_arguments\", \"说明\":\"必须提供字符串类型的订单编号，尚未查询数据库。\"}\n    return store.execute(name, args)",
        "explain": [
          "raw 是模型返回的参数字符串，不是已经解析好的对象。json.loads 把它转换成 Python 对象；失败时 except 捕获错误并返回中文说明。类似 Java 中 Jackson 反序列化失败后返回错误。",
          "name 必须是明确允许的 query_order，否则直接结束。不能让模型通过一个字符串去调用任意类、任意 Python 函数或执行命令。",
          "isinstance 检查对象类型，set(args) 检查字段集合，type(args[\"order_id\"]) is not str 检查值是否为字符串。检查通过才进入 store.execute。",
          "如果订单不存在，数据库查询已经发生，返回 not_found。这与前面三个尚未访问数据库的错误不同。运行 errors 命令逐个核对。"
        ]
      },
      {
        "title": "把工具结果与原来的调用编号关联起来",
        "file": "step_by_step.py",
        "code": "            messages.append({\"role\":\"assistant\",\"content\":msg.get(\"content\"),\"tool_calls\":calls})\n            for call in calls:\n                if call[\"type\"]!=\"function\":raise ValueError(\"非函数调用\")\n                f=call[\"function\"]\n                value=query(store,f[\"name\"],f[\"arguments\"])\n                display(\"Python 实际执行结果\",value)\n                messages.append({\"role\":\"tool\",\"tool_call_id\":call[\"id\"],\"content\":json.dumps(value,ensure_ascii=False)})\n            # 本阶段只演示一次工具往返；第二次不提供工具，要求模型依据结果作答。\n            final=send(messages)\n            if final.get(\"tool_calls\"):raise ValueError(\"第二轮不应继续请求工具\")\n            print(\"最终回答：\",final.get(\"content\"))",
        "explain": [
          "messages.append 向消息列表追加一条记录，类似 Java 的 List.add。先保留模型此前的 assistant 消息，其中包含它提出的工具调用。",
          "for call in calls 逐个处理调用，f 是当前调用里的 function 对象。Python 通过 f[\"name\"] 和 f[\"arguments\"] 找到工具名与参数，交给 query 函数。",
          "每条 tool 消息带 tool_call_id，它必须使用当前 call 的 id。这个编号不是订单编号，而是模型本次调用的关联标识。content 放实际查询结果的 JSON 字符串。",
          "最后再调用 send(messages)。模型才能根据查询结果生成回答。第二次没有开放工具，是因为本章只演示一次调用往返；下一章将改为允许多轮。"
        ]
      }
    ]
  },
  "5": {
    "files": [
      "real_api_agent.py",
      "test_real_api_agent.py",
      "test_step_by_step.py",
      "step_by_step.py"
    ],
    "intro": "第五章读真正的执行循环，不需要一次读懂三种模型接口。先沿 fmt == \"chat\" 的分支读完，再将另外两种格式作为对照。",
    "blocks": [
      {
        "title": "每一轮都重新给模型当前消息和工具说明",
        "file": "real_api_agent.py",
        "code": "    for turn in range(1,max_rounds+1):\n        if fmt==\"responses\":\n            body={\"instructions\":SYSTEM,\"input\":history,\"max_output_tokens\":1024,\"store\":False}\n            if with_tools:body[\"tools\"]=[{\"type\":\"function\",**t,\"strict\":True} for t in TOOLS]\n            path=\"/responses\"\n        elif fmt==\"chat\":\n            body={\"messages\":history,\"max_completion_tokens\":1024}\n            if with_tools:body[\"tools\"]=[{\"type\":\"function\",\"function\":t} for t in TOOLS]\n            path=\"/chat/completions\"\n        elif fmt==\"messages\":\n            body={\"system\":SYSTEM,\"messages\":history,\"max_tokens\":1024}\n            if with_tools:body[\"tools\"]=[{\"name\":t[\"name\"],\"description\":t[\"description\"],\"input_schema\":t[\"parameters\"]} for t in TOOLS]\n            path=\"/messages\"\n        else:raise ValueError(\"接口格式不支持\")\n        show(f\"第 {turn} 轮请求：{path}\")\n        r=send(path,body)\n        if r.get(\"usage\") is not None:show(\"本轮用量：\"+encode(r[\"usage\"]))",
        "explain": [
          "range(1,max_rounds+1) 产生从 1 到 max_rounds 的整数，等价于 Java 中 for(int turn=1;turn<=maxRounds;turn++)。轮数限制由自己的程序控制，不是由模型决定。",
          "三个 fmt 分支分别生成不同 API 的请求数据。先看 chat：messages 是累计历史，tools 是当前提供的工具说明。列表推导式为每个工具构造对应的接口格式。",
          "send(path, body) 是作为参数传入的发送函数。正常运行时它实际请求模型；单元测试时可以传入固定响应的测试函数。依赖注入使运行循环不绑定某个 HTTP 客户端。"
        ]
      },
      {
        "title": "模型返回什么，决定下一轮是否执行工具",
        "file": "real_api_agent.py",
        "code": "        if not calls:\n            if not answer.strip():raise RuntimeError(\"没有可用文本，也没有待执行工具；检查停止原因\")\n            return answer,calls_count\n        if not with_tools:raise RuntimeError(\"本次未启用工具，拒绝执行调用\")\n        if calls_count+len(calls)>max_calls:raise RuntimeError(\"工具次数达到上限\")\n        ids=[c[0] for c in calls]\n        if len(ids)!=len(set(ids)):raise RuntimeError(\"同轮工具调用 ID 重复\")\n        results=[]\n        for cid,name,args in calls:\n            if isinstance(args,str):\n                try:args=json.loads(args)\n                except json.JSONDecodeError:args=None\n            value=execute(name,args);calls_count+=1\n            show(\"模型请求：\"+name+\" \"+encode(args))\n            show(\"程序执行结果：\"+encode(value))\n            if fmt==\"responses\":results.append({\"type\":\"function_call_output\",\"call_id\":cid,\"output\":encode(value)})\n            elif fmt==\"chat\":results.append({\"role\":\"tool\",\"tool_call_id\":cid,\"content\":encode(value)})\n            else:results.append({\"type\":\"tool_result\",\"tool_use_id\":cid,\"content\":encode(value),\"is_error\":\"error\" in value})\n        if fmt==\"messages\":history.append({\"role\":\"user\",\"content\":results})\n        else:history.extend(results)",
        "explain": [
          "如果 calls 为空且有有效文本，返回最终回答和累计调用次数。如果模型一直提出调用，程序最多运行设定轮数；超过限制报告未完成，不伪造结果。",
          "for cid,name,args in calls 是元组解包：每个元素按顺序拆成调用编号、工具名称、参数。execute(name,args) 执行真正业务逻辑。",
          "同一个业务结果根据 API 格式分别包装。Chat Completions 使用 role=tool 和 tool_call_id；Responses 使用 function_call_output 和 call_id；Claude Messages 使用 tool_result 和 tool_use_id。它们都是关联结果，而非三种不同业务功能。",
          "history.extend(results) 把多个结果追加到历史列表，下一轮 send 时模型才能看到。这里没有数据库写入，也没有真正退款。"
        ]
      },
      {
        "title": "如何自己验证，而不是只看教材输出？",
        "file": "test_real_api_agent.py",
        "code": "    def replay(self,fmt,first,last,path,assert_result):\n        requests=[]\n        def send(p,b):\n            self.assertEqual(p,path);requests.append(deepcopy(b))\n            return first if len(requests)==1 else last\n        answer,count=run(fmt,send,self.store.execute,\"查A100\",show=lambda _:None)\n        self.assertEqual((answer,count),(\"已付款\",1))\n        assert_result(requests[1])",
        "explain": [
          "测试中的 send 不是外部模型调用，而是按顺序返回预先写好的两次响应。它专门验证程序是否按格式回传工具结果，不衡量模型智能。",
          "requests.append(deepcopy(b)) 保存每轮请求的副本，避免后续修改历史影响已记录的请求。assert_result 检查第二轮的调用编号。运行单元测试可以确认程序的确定性逻辑。"
        ]
      }
    ]
  },
  "6": {
    "files": [
      "enterprise_agent.py",
      "test_enterprise_agent.py"
    ],
    "intro": "第六章使用离线权限实验，模型替身只用于可重复的控制流测试。不要把它当作完整身份认证或真实支付系统。",
    "blocks": [
      {
        "title": "权限和工具映射由业务程序控制",
        "file": "enterprise_agent.py",
        "code": "    def call(self,p,name,args):\n        try:\n            if name not in self.tools:raise ValueError(\"unknown tool\")\n            perm,fields,fn=self.tools[name]\n            if perm not in p.permissions:raise PermissionError(\"denied\")\n            if not isinstance(args,dict) or set(args)!=set(fields) or any(type(args[k]) is not t for k,t in fields.items()):raise ValueError(\"invalid arguments\")\n            value=fn(p,**args)\n        except (ValueError,PermissionError):\n            self.store.audit(p,name,\"denied_or_invalid\");raise\n        self.store.audit(p,name,\"ok\")\n        return value",
        "explain": [
          "p 表示由调用方提供的可信身份对象，包含所属公司和权限。真实生产应由认证中间件生成；实验中是程序手工构造。",
          "self.tools[name] 返回权限名、参数规则和实际函数三项。fn(p,**args) 将字典展开成命名参数，类似按参数名调用业务方法。",
          "先判断工具是否允许、权限是否存在、参数是否正确，再调用业务函数。异常记录到审计日志后重新抛出，因此未通过权限检查不会执行写操作。"
        ]
      },
      {
        "title": "相同申请编号为什么只会产生一条记录？",
        "file": "enterprise_agent.py",
        "code": "    def submit(self,p,id,key):\n        digest=hashlib.sha256(json.dumps({\"id\":id},sort_keys=True).encode()).hexdigest()\n        with self.db:\n            old=self.db.execute(\"SELECT digest,state FROM requests WHERE tenant=? AND key=?\",(p.tenant,key)).fetchone()\n            if old:\n                if old[0]!=digest:raise ValueError(\"idempotency conflict\")\n                return {\"state\":old[1],\"key\":key}\n            if self.query(p,id)[\"status\"]!=\"paid\":raise PermissionError(\"not accessible\")\n            self.db.execute(\"INSERT INTO requests VALUES(?,?,?,?,?)\",(p.tenant,key,digest,id,\"pending\"))\n        return {\"state\":\"pending\",\"key\":key}",
        "explain": [
          "key 是稳定的业务请求编号，不是模型调用编号。digest 是当前申请内容的摘要，用于识别重复编号是否对应同一个订单。",
          "with self.db 让数据库连接按事务语义提交或回滚本次操作。查询已存在的请求时，内容相同则返回之前状态，不重复创建；内容不同则拒绝。",
          "本示例只创建 pending（待审批）申请，不执行真实退款。它没有完整并发支付、财务审批和对账能力。"
        ]
      }
    ]
  },
  "7": {
    "files": [
      "modern_mcp_agent.py",
      "modern_mcp_server.py",
      "real_api_agent.py"
    ],
    "intro": "第七章第一次通过 MCP 调用工具。先理解服务端注册工具与客户端发现工具这两个动作，再观察模型如何接入。现代 SDK 代码的实际运行仍需验证。",
    "blocks": [
      {
        "title": "装饰器是什么，为什么加在函数上？",
        "file": "modern_mcp_server.py",
        "code": "mcp = MCPServer(\"学习用订单服务\")\n\n@mcp.tool()\ndef query_order(order_id: str) -> dict:\n    \"\"\"查询模拟订单的付款与发货状态，不修改订单。\"\"\"\n    store = OrderStore()\n    try:\n        return store.execute(\"query_order\", {\"order_id\": order_id})\n    finally:\n        store.db.close()\n\n@mcp.tool()\ndef read_refund_policy() -> dict:\n    \"\"\"读取模拟退款制度，只读。\"\"\"\n    store = OrderStore()\n    try:\n        return store.execute(\"read_refund_policy\", {})\n    finally:\n        store.db.close()",
        "explain": [
          "@mcp.tool() 是 Python 装饰器。它让 SDK 将函数登记为可发现的工具；可以类比 Java 注解注册处理器，但实现机制不同。",
          "order_id: str 是类型标注，-> dict 表示期望返回字典；SDK 可利用这些信息生成参数说明。类型标注本身不等于完整运行时授权。",
          "函数内部仍然使用第一章的 OrderStore，说明更换工具接入协议并不需要重写业务。finally 负责关闭数据库连接。"
        ]
      },
      {
        "title": "客户端怎样把 MCP 工具提供给模型？",
        "file": "modern_mcp_agent.py",
        "code": "def model_tools(listing):\n    # 真实 MCP 工具定义转换成 Chat Completions 所需的 JSON 结构。\n    return [\n        {\"type\": \"function\", \"function\": {\n            \"name\": t.name,\n            \"description\": t.description or \"\",\n            \"parameters\": t.input_schema,\n        }}\n        for t in listing.tools if t.name in ALLOWED\n    ]",
        "explain": [
          "客户端发现工具后返回 listing。t.name、t.description 和 t.input_schema 分别是名称、用途和输入结构。转换得到 Chat Completions 需要的 tools 列表。",
          "列表推导式末尾的 if t.name in ALLOWED 只保留本实验允许的名称。即使目录提供了其他工具，也不能自动获得执行权。",
          "async def 与 await 表示异步操作：调用 MCP 客户端时等待结果，而不是让模型自行执行。MCP 与模型 API 仍由主应用协调。"
        ]
      }
    ]
  },
  "8": {
    "files": [
      "real_embedding.py",
      "real_api_agent.py"
    ],
    "intro": "第八章向量化实验实际调用外部接口。重点在文本怎样变成向量、怎样比较，而不是记住数学推导。",
    "blocks": [
      {
        "title": "怎样从向量服务得到检索排序？",
        "file": "real_embedding.py",
        "code": "def similarity(a,b):\n    if len(a)!=len(b) or not a:raise ValueError(\"向量维度不一致\")\n    denom=math.sqrt(sum(x*x for x in a))*math.sqrt(sum(y*y for y in b))\n    if not denom:raise ValueError(\"零向量\")\n    return sum(x*y for x,y in zip(a,b))/denom\n\ndef main():\n    key=os.environ[\"AGENT_API_KEY\"]\n    base=os.getenv(\"AGENT_BASE_URL\",\"https://api.openai.com/v1\")\n    model=os.environ[\"AGENT_EMBEDDING_MODEL\"]\n    texts=[question]+[text for _,text in docs]\n    # 这里使用真实向量化接口，而不是手写向量。\n    r=post(base,\"/embeddings\",key,\"chat\",{\"model\":model,\"input\":texts})\n    data=sorted(r[\"data\"],key=lambda x:x[\"index\"])\n    if [x[\"index\"] for x in data]!=list(range(len(texts))):raise ValueError(\"向量返回数量或编号不符\")\n    q=data[0][\"embedding\"]\n    ranked=sorted([(similarity(q,x[\"embedding\"]),doc) for x,doc in zip(data[1:],docs)],key=lambda x:-x[0])\n    for score,(id,text) in ranked:print(f\"{id} 相似度={score:.4f} {text}\")\n    print(\"预期最相关：P1；实际第一名：\"+ranked[0][1][0])\n    if \"usage\" in r:print(\"服务端用量：\",r[\"usage\"])\nif __name__==\"__main__\":main()",
        "explain": [
          "similarity 使用余弦相似度衡量两个向量方向的接近程度。zip(a,b) 将相同位置的元素配对，sum 负责求和。不需要自己训练向量模型。",
          "texts 是问题和制度文本的列表。post 向 /embeddings 发送真实请求，按照服务返回 index 排序，使每个向量与原文本对应。",
          "q 是问题向量；ranked 计算每份制度与问题的相似度并从高到低排序。lambda 是短函数，这里用来指定排序依据。",
          "该程序只完成真实检索，不包含完整 RAG 生成环节。若要构建 RAG，下一步需将选中的制度和来源送给聊天模型生成有依据的答案。"
        ]
      }
    ]
  },
  "10": {
    "files": [
      "real_api_agent.py",
      "test_real_api_agent.py",
      "step_by_step.py",
      "test_step_by_step.py",
      "enterprise_agent.py",
      "test_enterprise_agent.py"
    ],
    "intro": "第十章将前面的实验串成可复查的评估。区分单元测试（验证代码逻辑）与真实模型评估（验证工具选择、参数、回答和费用）。",
    "blocks": [
      {
        "title": "单元测试为什么不消耗模型费用？",
        "file": "test_real_api_agent.py",
        "code": "    def replay(self,fmt,first,last,path,assert_result):\n        requests=[]\n        def send(p,b):\n            self.assertEqual(p,path);requests.append(deepcopy(b))\n            return first if len(requests)==1 else last\n        answer,count=run(fmt,send,self.store.execute,\"查A100\",show=lambda _:None)\n        self.assertEqual((answer,count),(\"已付款\",1))\n        assert_result(requests[1])",
        "explain": [
          "测试将固定响应函数传给 run，替代真实网络发送。它能准确定位程序的协议错误，但不会测出模型真实选择能力。",
          "对真实接口重复使用相同业务问题，记录实际调用与结果，然后再和本地测试报告分别保存。不要把模拟响应的通过率当作模型准确率。"
        ]
      }
    ]
  }
};
