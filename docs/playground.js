(function() {
  "use strict";
  const $ = id => document.getElementById(id);

  // 主题切换
  const savedTheme = localStorage.getItem("agentlab-theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", savedTheme);
  }
  $("themeBtn").onclick = () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const isDark = cur === "dark" || (!cur && matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("agentlab-theme", next);
  };

  // 语法高亮（字符串优先于注释）
  function hl(raw) {
    const esc = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const re = /("""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#.*$|\/\/.*$)|\b(def|return|true|false|null|True|False|None)\b|\b(-?\d+(?:\.\d+)?)\b/gm;
    return esc.replace(re, (m, str, com, kw, num) => {
      if (str) return '<span class="tok-str">' + str + '</span>';
      if (com) return '<span class="tok-com">' + com + '</span>';
      if (kw) return '<span class="tok-kw">' + kw + '</span>';
      if (num) return '<span class="tok-num">' + num + '</span>';
      return m;
    });
  }

  function copyWithFeedback(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
      const old = btn.textContent;
      btn.textContent = "✓ 已复制";
      setTimeout(() => { btn.textContent = old; }, 1400);
    });
  }

  // 主 Tab 切换
  document.querySelectorAll(".pg-tab").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".pg-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".pg-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $("panel-" + btn.dataset.tab).classList.add("active");
    };
  });

  // =========================================================================
  // TAB 1: Tool Call 协议生成器 & 内置 Mini Postman
  // =========================================================================
  const TOOL_CATALOG = {
    query_order: {
      name: "query_order",
      description: "根据订单编号查询实时付款状态和发货状态（只读）。",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string", description: "订单编号，如 A100" } },
        required: ["order_id"],
        additionalProperties: false
      }
    },
    read_refund_policy: {
      name: "read_refund_policy",
      description: "读取公司现行退款管理制度与审批门槛规定（只读）。",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false }
    },
    submit_refund_ticket: {
      name: "submit_refund_ticket",
      description: "为已付款订单创建待财务审批的退款申请单（不会直接打款）。",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "订单编号" },
          reason: { type: "string", description: "退款理由" }
        },
        required: ["order_id", "reason"],
        additionalProperties: false
      }
    }
  };

  let lastToolCallFromLive = null;
  let customTools = []; // 用户在 Tab 3 自定义并加入实验台的工具列表

  function renderCustomToolCheckboxes() {
    const wrap = $("customToolsWrap");
    wrap.replaceChildren();
    customTools.forEach((ct, idx) => {
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = ct.enabled;
      cb.onchange = () => { ct.enabled = cb.checked; renderToolCall(); };
      const del = document.createElement("button");
      del.className = "pill-btn";
      del.textContent = "×";
      del.title = "移除自定义工具";
      del.style.marginLeft = "4px";
      del.onclick = e => { e.preventDefault(); customTools.splice(idx, 1); renderCustomToolCheckboxes(); renderToolCall(); };
      lbl.append(cb, document.createTextNode(" " + ct.name + " (自定义)"), del);
      wrap.append(lbl);
    });
  }

  function buildToolCallPayload() {
    const fmt = $("tcFormat").value;
    const round = $("tcRound").value;
    const model = $("tcModel").value.trim() || "gpt-4o-mini";
    const question = $("tcQuestion").value.trim() || "请查询订单 A100 的付款和发货状态。";
    const choice = $("tcChoice").value;
    const strict = $("tcStrict").checked;
    const legacy = $("tcLegacy").checked;
    const callName = $("tcCallName").value.trim() || "query_order";
    const callId = $("tcCallId").value.trim() || "call_a100_01";
    const callArgs = $("tcCallArgs").value.trim() || '{"order_id":"A100"}';
    const toolResult = $("tcToolResult").value.trim() || '{"found":true,"order_id":"A100","payment_status":"paid","shipping_status":"pending"}';

    const selected = [];
    if ($("toolOrder").checked) selected.push(TOOL_CATALOG.query_order);
    if ($("toolPolicy").checked) selected.push(TOOL_CATALOG.read_refund_policy);
    if ($("toolRefund").checked) selected.push(TOOL_CATALOG.submit_refund_ticket);
    customTools.forEach(ct => {
      if (ct.enabled) selected.push({ name: ct.name, description: ct.description, parameters: ct.parameters });
    });

    const sysText = "你是严谨的企业订单助手。查询订单或制度请调用工具，严禁编造实时状态。";
    let endpoint = "/chat/completions";
    let body = {};
    let notes = "";

    if (fmt === "chat") {
      endpoint = "/chat/completions";
      const msgs = [
        { role: "system", content: sysText },
        { role: "user", content: question }
      ];
      if (round === "round2") {
        msgs.push({
          role: "assistant",
          content: null,
          tool_calls: [{ id: callId, type: "function", function: { name: callName, arguments: callArgs } }]
        });
        msgs.push({ role: "tool", tool_call_id: callId, content: toolResult });
      }
      body = { model, messages: msgs };
      body[legacy ? "max_tokens" : "max_completion_tokens"] = 1024;
      if (selected.length && round === "round1") {
        body.tools = selected.map(t => {
          const fn = { name: t.name, description: t.description, parameters: t.parameters };
          if (strict) fn.strict = true;
          return { type: "function", function: fn };
        });
        body.tool_choice = choice;
      }
      notes = round === "round1"
        ? "<strong>字段速查（Chat Completions 第 1 轮）：</strong><code>tools[]</code> 声明可用能力；<code>tool_choice</code> 控制模型是否必须调工具；发出后重点看响应里是否有 <code>choices[0].message.tool_calls</code>。"
        : "<strong>字段速查（Chat Completions 第 2 轮）：</strong>必须把第 1 轮的 <code>assistant(tool_calls)</code> 原样保留，再紧跟一条 <code>role: \"tool\"</code> 且 <code>tool_call_id</code> 与上方 <code>id</code> 完全一致的消息！";
    } else if (fmt === "responses") {
      endpoint = "/responses";
      const input = [{ role: "user", content: question }];
      if (round === "round2") {
        input.push({ type: "function_call", call_id: callId, name: callName, arguments: callArgs });
        input.push({ type: "function_call_output", call_id: callId, output: toolResult });
      }
      body = { model, instructions: sysText, input, max_output_tokens: 1024, store: false };
      if (selected.length && round === "round1") {
        body.tools = selected.map(t => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, ...(strict ? { strict: true } : {}) }));
        body.tool_choice = choice;
      }
      notes = "<strong>字段速查（OpenAI Responses）：</strong>系统提示词放顶层 <code>instructions</code>；工具定义直接平铺在 <code>tools[]</code> 下（无内层 function 包裹）；第 2 轮用 <code>type: \"function_call_output\"</code> + <code>call_id</code> 回传结果。";
    } else {
      endpoint = "/messages";
      const msgs = [{ role: "user", content: question }];
      if (round === "round2") {
        let parsedCallArgs = {};
        try { parsedCallArgs = JSON.parse(callArgs); } catch {}
        msgs.push({ role: "assistant", content: [{ type: "tool_use", id: callId, name: callName, input: parsedCallArgs }] });
        msgs.push({ role: "user", content: [{ type: "tool_result", tool_use_id: callId, content: toolResult }] });
      }
      body = { model, system: sysText, messages: msgs, max_tokens: 1024 };
      if (selected.length && round === "round1") {
        body.tools = selected.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
        if (choice === "required") body.tool_choice = { type: "any" };
        else if (choice === "none") body.tool_choice = { type: "none" };
        else body.tool_choice = { type: "auto" };
      }
      notes = "<strong>字段速查（Anthropic Claude Messages）：</strong>工具参数叫 <code>input_schema</code>；模型返回 <code>type: \"tool_use\"</code>（且 input 已是对象而非字符串）；第 2 轮工具结果包在 <code>role: \"user\"</code> 的 <code>tool_result</code> 块里并用 <code>tool_use_id</code> 关联！";
    }

    return { endpoint, body, notes, fmt };
  }

  function renderToolCall() {
    $("round2Box").style.display = $("tcRound").value === "round2" ? "block" : "none";
    const { endpoint, body, notes } = buildToolCallPayload();
    const jsonStr = JSON.stringify(body, null, 2);
    $("tcEndpointBadge").textContent = "POST " + endpoint + " · 标准请求报文";
    $("tcJsonPreview").innerHTML = hl(jsonStr);
    $("tcFieldNotes").innerHTML = notes;
  }

  ["tcFormat", "tcRound", "toolOrder", "toolPolicy", "toolRefund", "tcChoice", "tcStrict", "tcLegacy", "tcModel", "tcQuestion", "tcCallName", "tcCallId", "tcCallArgs", "tcToolResult"]
    .forEach(id => {
      $(id).addEventListener("input", renderToolCall);
      $(id).addEventListener("change", renderToolCall);
    });

  document.querySelectorAll(".pill-btn").forEach(b => {
    b.onclick = () => { $("tcQuestion").value = b.dataset.q; renderToolCall(); };
  });

  $("copyTcJson").onclick = () => {
    const { body } = buildToolCallPayload();
    copyWithFeedback($("copyTcJson"), JSON.stringify(body, null, 2));
  };

  $("copyTcPs").onclick = () => {
    const { endpoint, body, fmt } = buildToolCallPayload();
    const base = ($("liveBase").value.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
    const headers = fmt === "messages"
      ? '@{"x-api-key"=$env:AGENT_API_KEY; "anthropic-version"="2023-06-01"; "Content-Type"="application/json"}'
      : '@{"Authorization"="Bearer $env:AGENT_API_KEY"; "Content-Type"="application/json"}';
    const cmd = `$body = @'\n${JSON.stringify(body, null, 2)}\n'@\nInvoke-RestMethod -Method Post -Uri "${base}${endpoint}" -Headers ${headers} -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) | ConvertTo-Json -Depth 10`;
    copyWithFeedback($("copyTcPs"), cmd);
  };

  $("copyTcCurl").onclick = () => {
    const { endpoint, body, fmt } = buildToolCallPayload();
    const base = ($("liveBase").value.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
    const auth = fmt === "messages"
      ? `-H "x-api-key: $AGENT_API_KEY" -H "anthropic-version: 2023-06-01"`
      : `-H "Authorization: Bearer $AGENT_API_KEY"`;
    const cmd = `curl -X POST "${base}${endpoint}" \\\n  -H "Content-Type: application/json" \\\n  ${auth} \\\n  -d '${JSON.stringify(body)}'`;
    copyWithFeedback($("copyTcCurl"), cmd);
  };

  // 内置 Mini Postman 真实发包
  $("sendLiveBtn").onclick = async () => {
    const base = $("liveBase").value.trim().replace(/\/+$/, "");
    const key = $("liveKey").value.trim();
    if (!base || !key) {
      alert("请先填写 API Base URL 和 API Key（或点击右侧复制 JSON 粘贴到 Postman 测试）");
      return;
    }
    const { endpoint, body, fmt } = buildToolCallPayload();
    const headers = { "Content-Type": "application/json" };
    if (fmt === "messages") {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = "Bearer " + key;
    }

    $("liveRespCard").style.display = "block";
    $("liveDiag").className = "diag-box";
    $("liveDiag").textContent = "⏳ 正在发送请求到 " + base + endpoint + " …";
    $("liveRespPre").textContent = "";
    $("simNextRoundBtn").style.display = "none";

    try {
      const res = await fetch(base + endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch {}
      $("liveRespPre").innerHTML = data ? hl(JSON.stringify(data, null, 2)) : text;

      if (!res.ok) {
        $("liveDiag").className = "diag-box diag-warn";
        $("liveDiag").innerHTML = `<strong>HTTP ${res.status} 请求失败：</strong>请检查 Base URL、模型名、API Key 或协议格式是否匹配。`;
        return;
      }

      // 智能诊断是否返回了 tool_calls
      let callFound = null;
      if (fmt === "chat" && data?.choices?.[0]?.message?.tool_calls?.length) {
        const tc = data.choices[0].message.tool_calls[0];
        callFound = { id: tc.id, name: tc.function?.name, args: tc.function?.arguments };
      } else if (fmt === "responses" && Array.isArray(data?.output)) {
        const fc = data.output.find(x => x.type === "function_call");
        if (fc) callFound = { id: fc.call_id, name: fc.name, args: fc.arguments };
      } else if (fmt === "messages" && Array.isArray(data?.content)) {
        const tu = data.content.find(x => x.type === "tool_use");
        if (tu) callFound = { id: tu.id, name: tu.name, args: JSON.stringify(tu.input) };
      }

      if (callFound) {
        lastToolCallFromLive = callFound;
        $("liveDiag").className = "diag-box diag-ok";
        $("liveDiag").innerHTML = `<strong>✅ 成功触发原生 Tool Call！</strong> 模型申请调用 <code>${callFound.name}(${callFound.args})</code>，关联编号 <code>${callFound.id}</code>。点击左侧 <strong>「⚡ 模拟本地查库 → 生成第 2 轮」</strong> 可继续走完闭环！`;
        $("simNextRoundBtn").style.display = "inline-flex";
      } else if ($("tcRound").value === "round1" && body.tools) {
        $("liveDiag").className = "diag-box diag-warn";
        $("liveDiag").innerHTML = "<strong>⚠️ 未检测到标准 tool_calls 字段：</strong>模型直接返回了纯文本。若提问明确涉及订单，请检查该模型/中转网关是否支持透传 <code>tools</code> 参数！";
      } else {
        $("liveDiag").className = "diag-box diag-ok";
        $("liveDiag").innerHTML = "<strong>✅ 已收到最终自然语言回复！</strong> 一次完整的工具调用往返闭环已走通。";
      }
    } catch (err) {
      $("liveDiag").className = "diag-box diag-warn";
      $("liveDiag").innerHTML = `<strong>⚠️ 浏览器请求受阻（常见于 CORS 跨域限制或网络不可达）：</strong>${err.message}。<br>👉 请直接点击上方 <strong>「复制 JSON (给 Postman)」</strong> 或 <strong>「复制 PowerShell 命令」</strong>，在 Postman / 本地终端执行即可 100% 绕过浏览器跨域限制！`;
    }
  };

  $("simNextRoundBtn").onclick = () => {
    if (!lastToolCallFromLive) return;
    $("tcRound").value = "round2";
    $("tcCallId").value = lastToolCallFromLive.id;
    $("tcToolResult").value = JSON.stringify({
      found: true, order_id: "A100", customer: "张三", amount_yuan: 299, payment_status: "paid", shipping_status: "pending"
    });
    renderToolCall();
    $("simNextRoundBtn").style.display = "none";
  };

  $("copyRespBtn").onclick = () => copyWithFeedback($("copyRespBtn"), $("liveRespPre").textContent);

  // =========================================================================
  // TAB 2: MCP (JSON-RPC 2.0) 协议报文生成器与速查
  // =========================================================================
  function renderMcpDynamicInputs() {
    const m = $("mcpMethod").value;
    const box = $("mcpDynamicInputs");
    box.replaceChildren();
    if (m === "tools/call") {
      box.innerHTML = `<div class="field"><label>传入参数 order_id</label><select id="mcpOrderId"><option value="A100">A100（已付款、未发货）</option><option value="B200">B200（已付款、已发货）</option><option value="Z999">Z999（查无此单）</option></select></div>`;
      $("mcpOrderId").onchange = renderMcp;
    } else if (m === "resources/read") {
      box.innerHTML = `<div class="field"><label>选择要读取的资源 URI</label><select id="mcpUri"><option value="policy://P1">policy://P1（退款管理制度）</option><option value="policy://P2">policy://P2（物流时效制度）</option><option value="policy://P3">policy://P3（生产发布制度）</option></select></div>`;
      $("mcpUri").onchange = renderMcp;
    } else if (m === "prompts/get") {
      box.innerHTML = `<div class="field"><label>填入模板参数 order_id</label><input type="text" id="mcpPromptOrder" value="A100"></div>`;
      $("mcpPromptOrder").oninput = renderMcp;
    }
  }

  function renderMcp() {
    const m = $("mcpMethod").value;
    const rawId = $("mcpId").value.trim();
    const id = /^\d+$/.test(rawId) ? Number(rawId) : (rawId || 1);
    let req = {}, resp = {}, py = "", exp = "";

    if (m === "initialize") {
      req = { jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "postman-lab", version: "1.0" } } };
      resp = {
        "// 第 1 步 · 服务端响应握手": { jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: "order-learning-server", version: "1.0" } } },
        "// 第 2 步 · 客户端发送单向通知（注意无 id！）": { jsonrpc: "2.0", method: "notifications/initialized" }
      };
      py = `# 官方 SDK 内部自动完成握手：\nasync with ClientSession(read, write) as session:\n    await session.initialize()`;
      exp = "<strong>协议要点：</strong>Request 必须带非空 <code>id</code>，服务端回复相同 <code>id</code> 对号入座；随后发送的 <code>notifications/initialized</code> 是单向通知，故意不带 <code>id</code>。";
    } else if (m === "tools/list") {
      req = { jsonrpc: "2.0", id, method: "tools/list", params: {} };
      resp = { jsonrpc: "2.0", id, result: { tools: [{ name: "query_order", description: "根据订单编号查询实时付款和发货状态（只读）", inputSchema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } }] } };
      py = `@mcp.tool()\ndef query_order(order_id: str) -> dict:\n    """根据订单编号查询实时付款和发货状态（只读）。"""\n    return orders.query_order(order_id)`;
      exp = "<strong>Tools 发现效果：</strong>Host 拿到这里的 <code>inputSchema</code> 后，改个键名为 <code>parameters</code> 就能直接放进大模型的 <code>tools[]</code> 里！";
    } else if (m === "tools/call") {
      const oid = $("mcpOrderId")?.value || "A100";
      const db = {
        A100: { found: true, order_id: "A100", amount_yuan: 299, payment_status: "paid", shipping_status: "pending" },
        B200: { found: true, order_id: "B200", amount_yuan: 599, payment_status: "paid", shipping_status: "shipped" },
        Z999: { found: false, order_id: "Z999", message: "未找到该订单编号" }
      };
      req = { jsonrpc: "2.0", id, method: "tools/call", params: { name: "query_order", arguments: { order_id: oid } } };
      resp = { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(db[oid]) }], isError: false } };
      py = `# 客户端收到大模型 tool_calls 后转发执行：\nres = await session.call_tool("query_order", {"order_id": "${oid}"})`;
      exp = "<strong>Tools 执行效果：</strong>大模型提议调用后，由你的 Host 发起 <code>tools/call</code> 跨进程查库，拿到结果再按原 <code>tool_call_id</code> 回传给大模型。";
    } else if (m === "resources/list") {
      req = { jsonrpc: "2.0", id, method: "resources/list", params: {} };
      resp = { jsonrpc: "2.0", id, result: { resources: [{ uri: "policy://P1", name: "退款管理制度", mimeType: "application/json" }, { uri: "policy://P2", name: "物流时效制度", mimeType: "application/json" }] } };
      py = `@mcp.resource("policy://{doc_id}")\ndef get_company_policy(doc_id: str) -> str:\n    return resource_read_policy(doc_id)`;
      exp = "<strong>Resources 目录效果：</strong>像文件系统目录一样列出只读数据 URI，方便客户端在界面上提供 <code>@引用资源</code> 菜单。";
    } else if (m === "resources/read") {
      const uri = $("mcpUri")?.value || "policy://P1";
      const map = {
        "policy://P1": "已付款且未发货订单可提交退款申请，满 200 元须人工审批；已发货须先退货入库。",
        "policy://P2": "普通订单付款后 24 小时内发货，大促期间 48 小时内发货。",
        "policy://P3": "核心交易服务上线前必须通过自动化回归测试并获得审批。"
      };
      req = { jsonrpc: "2.0", id, method: "resources/read", params: { uri } };
      resp = { jsonrpc: "2.0", id, result: { contents: [{ uri, mimeType: "text/plain", text: map[uri] }] } };
      py = `# 宿主应用直接按 URI 读入背景上下文（不经过大模型瞎猜）：\nres = await session.read_resource("${uri}")`;
      exp = "<strong>Resources 读取效果：</strong>零副作用、确定性直接拉取原文塞进 System/User 上下文，省掉一轮模型调用！";
    } else if (m === "prompts/list") {
      req = { jsonrpc: "2.0", id, method: "prompts/list", params: {} };
      resp = { jsonrpc: "2.0", id, result: { prompts: [{ name: "audit_refund", description: "标准化售后退款合规审查模板", arguments: [{ name: "order_id", required: true }] }] } };
      py = `@mcp.prompt()\ndef audit_refund(order_id: str) -> str:\n    return f"请对订单 {order_id} 执行三段式售后退款合规审查..."`;
      exp = "<strong>Prompts 列表效果：</strong>客户端据此在聊天框弹出 <code>/audit_refund</code> 斜杠快捷命令。";
    } else if (m === "prompts/get") {
      const oid = $("mcpPromptOrder")?.value || "A100";
      req = { jsonrpc: "2.0", id, method: "prompts/get", params: { name: "audit_refund", arguments: { order_id: oid } } };
      resp = { jsonrpc: "2.0", id, result: { description: "退款合规审查", messages: [{ role: "user", content: { type: "text", text: `请对订单【${oid}】执行标准退款审查：1. 查实时订单状态；2. 核对 P1 制度 200 元审批门槛；3. 输出结构化结论。` } }] } };
      py = `# 用户点选 /audit_refund 并填完单号后，客户端请求渲染：\nprompt = await session.get_prompt("audit_refund", {"order_id": "${oid}"})`;
      exp = "<strong>Prompts 渲染效果：</strong>普通用户只需填一个订单号，立刻一键发出专家级规范提问！";
    } else {
      req = { jsonrpc: "2.0", id, method: "tools/not_exist", params: {} };
      resp = { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
      py = `# JSON-RPC 2.0 常见标准错误码：\n# -32700 Parse error（JSON 语法坏了）\n# -32601 Method not found（方法不存在）\n# -32602 Invalid params（参数校验不通过）`;
      exp = "<strong>协议错误规范：</strong>JSON-RPC 响应里 <code>result</code> 与 <code>error</code> 二选一，绝不同时出现。";
    }

    $("mcpReqPre").innerHTML = hl(JSON.stringify(req, null, 2));
    $("mcpRespPre").innerHTML = hl(JSON.stringify(resp, null, 2));
    $("mcpPyPre").innerHTML = hl(py);
    $("mcpExplain").innerHTML = exp;
  }

  $("mcpMethod").onchange = () => { renderMcpDynamicInputs(); renderMcp(); };
  $("mcpId").oninput = renderMcp;
  $("copyMcpReq").onclick = () => copyWithFeedback($("copyMcpReq"), $("mcpReqPre").textContent);
  $("copyMcpResp").onclick = () => copyWithFeedback($("copyMcpResp"), $("mcpRespPre").textContent);

  // =========================================================================
  // TAB 3: 可视化 JSON Schema 工具构建器
  // =========================================================================
  let sbParams = [
    { name: "order_id", type: "string", desc: "订单唯一编号，例如 A100", required: true }
  ];

  function renderSchemaBuilder() {
    const list = $("sbParamsList");
    list.replaceChildren();
    sbParams.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "param-row";
      row.innerHTML = `
        <input type="text" value="${p.name}" placeholder="参数名" data-k="name">
        <select data-k="type">
          <option value="string" ${p.type==="string"?"selected":""}>string</option>
          <option value="integer" ${p.type==="integer"?"selected":""}>integer</option>
          <option value="boolean" ${p.type==="boolean"?"selected":""}>boolean</option>
          <option value="enum" ${p.type==="enum"?"selected":""}>enum(逗号分隔)</option>
        </select>
        <input type="text" value="${p.desc}" placeholder="说明或枚举值(如 web,ios)" data-k="desc">
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;margin:0"><input type="checkbox" ${p.required?"checked":""} data-k="required">必填</label>
        <button class="btn" style="padding:4px 8px" data-del="1">×</button>
      `;
      row.querySelectorAll("input, select").forEach(inp => {
        inp.oninput = inp.onchange = () => {
          const k = inp.dataset.k;
          sbParams[idx][k] = inp.type === "checkbox" ? inp.checked : inp.value;
          updateSchemaOutput();
        };
      });
      row.querySelector("[data-del]").onclick = () => {
        sbParams.splice(idx, 1);
        renderSchemaBuilder();
      };
      list.append(row);
    });
    updateSchemaOutput();
  }

  function updateSchemaOutput() {
    const name = $("sbName").value.trim() || "my_tool";
    const desc = $("sbDesc").value.trim() || "工具说明";
    const target = $("sbTarget").value;
    const strict = $("sbStrict").checked;

    const properties = {};
    const required = [];
    sbParams.forEach(p => {
      const k = p.name.trim();
      if (!k) return;
      if (p.type === "enum") {
        const vals = p.desc.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        properties[k] = { type: "string", enum: vals.length ? vals : ["option_a", "option_b"] };
      } else {
        properties[k] = { type: (!p.required && strict) ? [p.type, "null"] : p.type, description: p.desc };
      }
      if (p.required || strict) required.push(k);
    });

    const schema = { type: "object", properties, required };
    if (strict) schema.additionalProperties = false;

    let out = {};
    if (target === "openai_chat") {
      out = { type: "function", function: { name, description: desc, ...(strict ? { strict: true } : {}), parameters: schema } };
    } else if (target === "openai_resp") {
      out = { type: "function", name, description: desc, ...(strict ? { strict: true } : {}), parameters: schema };
    } else if (target === "claude") {
      out = { name, description: desc, input_schema: schema };
    } else {
      out = { name, description: desc, inputSchema: schema };
    }
    $("sbOutPre").innerHTML = hl(JSON.stringify(out, null, 2));
  }

  $("sbAddParam").onclick = () => {
    sbParams.push({ name: "param_" + (sbParams.length + 1), type: "string", desc: "参数说明", required: true });
    renderSchemaBuilder();
  };
  ["sbName", "sbDesc", "sbTarget", "sbStrict"].forEach(id => {
    $(id).addEventListener("input", updateSchemaOutput);
    $(id).addEventListener("change", updateSchemaOutput);
  });
  $("addCustomToLab").onclick = () => {
    const name = $("sbName").value.trim() || "my_tool";
    const description = $("sbDesc").value.trim() || "自定义工具";
    const strict = $("sbStrict").checked;
    const properties = {};
    const required = [];
    sbParams.forEach(p => {
      const k = p.name.trim();
      if (!k) return;
      if (p.type === "enum") {
        const vals = p.desc.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        properties[k] = { type: "string", enum: vals.length ? vals : ["option_a", "option_b"] };
      } else {
        properties[k] = { type: (!p.required && strict) ? [p.type, "null"] : p.type, description: p.desc };
      }
      if (p.required || strict) required.push(k);
    });
    const parameters = { type: "object", properties, required, ...(strict ? { additionalProperties: false } : {}) };
    const existing = customTools.findIndex(x => x.name === name);
    const entry = { name, description, parameters, enabled: true };
    if (existing >= 0) customTools[existing] = entry;
    else customTools.push(entry);
    renderCustomToolCheckboxes();
    renderToolCall();
    // 自动切回 Tab 1 方便用户立刻看到效果
    document.querySelector('.pg-tab[data-tab="toolcall"]').click();
  };

  $("copySbJson").onclick = () => copyWithFeedback($("copySbJson"), $("sbOutPre").textContent);

  // =========================================================================
  // TAB 4: 响应 JSON 粘贴解析器
  // =========================================================================
  const SAMPLE_RESP = {
    id: "resp_demo_001",
    model: "hy4flash-free",
    choices: [{
      index: 0,
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: "订单 A100 的付款状态为已付款，发货状态系统返回异常，暂无法确认。",
        reasoning_content: "前面工具返回了付款状态 paid，但发货状态为异常文本，作为企业助手不应原样复述，应礼貌提示系统返回异常。"
      }
    }],
    usage: {
      prompt_tokens: 163,
      completion_tokens: 302,
      total_tokens: 465,
      completion_tokens_details: { reasoning_tokens: 259 },
      prompt_cache_hit_tokens: 0,
      credit: 0,
      original_credit: 0.02
    }
  };

  function parseResponseJson() {
    const raw = $("respInput").value.trim();
    const box = $("respSummary");
    if (!raw) {
      box.className = "diag-box diag-warn";
      box.textContent = "请先在左侧粘贴一段 JSON 响应内容。";
      return;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      box.className = "diag-box diag-warn";
      box.textContent = "❌ JSON 解析失败：" + e.message + "（请检查是否复制完整）";
      return;
    }

    const lines = [];
    const model = data.model || "未标明";
    const choice = data.choices?.[0];
    const msg = choice?.message || {};
    const finish = choice?.finish_reason || data.stop_reason || data.status || "未知";
    const finishMap = {
      stop: "正常答完（未再申请调工具）",
      end_turn: "正常答完（Claude 结束轮次）",
      tool_calls: "暂停等待你的代码执行工具并回传结果",
      tool_use: "暂停等待你的代码执行工具（Claude）",
      length: "⚠️ 触发 max_tokens 上限被截断！切勿执行半截参数",
      content_filter: "⚠️ 触发安全审核拦截"
    };

    lines.push(`<li><strong>模型：</strong><code>${model}</code> ｜ <strong>停止原因：</strong><code>${finish}</code>（${finishMap[finish] || "其他状态"}）</li>`);

    if (msg.tool_calls?.length) {
      lines.push(`<li><strong>✅ 检测到原生工具调用（${msg.tool_calls.length} 项）：</strong>${msg.tool_calls.map(c => `<code>${c.function?.name}(${c.function?.arguments})</code> [id=${c.id}]`).join("，")}</li>`);
    } else {
      lines.push(`<li><strong>文本回复内容：</strong>${(msg.content || "（空）").slice(0, 140)}</li>`);
    }

    if (msg.reasoning_content) {
      lines.push(`<li><strong>💭 包含内部思考过程 (reasoning_content)：</strong>共 ${msg.reasoning_content.length} 字（多轮拼接历史时建议只保留 content/tool_calls，不把思考草稿传回下轮）。</li>`);
    }

    const u = data.usage;
    if (u) {
      const pTok = u.prompt_tokens ?? u.input_tokens ?? 0;
      const cTok = u.completion_tokens ?? u.output_tokens ?? 0;
      const rTok = u.completion_tokens_details?.reasoning_tokens ?? u.completion_thinking_tokens ?? 0;
      const cacheHit = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? u.cache_read_input_tokens ?? u.cached_tokens ?? 0;
      const rPct = cTok ? Math.round((rTok / cTok) * 100) : 0;
      const cPct = pTok ? Math.round((cacheHit / pTok) * 100) : 0;
      lines.push(`<li><strong>📊 Token 账单拆解：</strong>输入 <code>${pTok}</code> + 输出 <code>${cTok}</code> = 总计 <code>${u.total_tokens ?? (pTok + cTok)}</code>；其中思考消耗 <code>${rTok}</code>（占输出 <strong>${rPct}%</strong>），输入缓存命中 <code>${cacheHit}</code>（命中率 <strong>${cPct}%</strong>）。</li>`);
      if ("credit" in u || "original_credit" in u || "quota" in u) {
        lines.push(`<li><strong>🏷️ 检测到中转网关私有计费字段：</strong><code>credit=${u.credit}</code>, <code>original_credit=${u.original_credit}</code>（非 OpenAI 标准字段，业务代码解析时不要强依赖）。</li>`);
      }
    }

    box.className = "diag-box diag-ok";
    box.innerHTML = "<ul class='obj-list' style='margin:0'>" + lines.join("") + "</ul>";
  }

  $("parseRespBtn").onclick = parseResponseJson;
  $("loadSampleRespBtn").onclick = () => {
    $("respInput").value = JSON.stringify(SAMPLE_RESP, null, 2);
    parseResponseJson();
  };

  // 初始化四个面板
  renderToolCall();
  renderMcpDynamicInputs();
  renderMcp();
  renderSchemaBuilder();
})();
