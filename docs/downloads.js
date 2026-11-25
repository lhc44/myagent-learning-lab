(function() {
  "use strict";
  const savedTheme = localStorage.getItem("agentlab-theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

  const files = window.TEXTBOOK_LABS || {};

  const groups = [
    {
      id: "foundation",
      title: "第一 & 第二阶段 · 从 LLM API 到多轮 ReAct 运行时（第 1–4 章）",
      note: "无需第三方依赖。包含内存 SQLite 业务底座、最小三角色对比、JSON Schema 契约对照、四层错误防御与支持三大协议的 ReAct 循环。",
      names: ["common.py", "lab01_llm_vs_agent.py", "lab02_tool_schema.py", "lab03_tool_execution.py", "lab04_agent_loop.py"]
    },
    {
      id: "enterprise",
      title: "第三阶段 · 企业安全边界、MCP 协议桥接与上下文 RAG（第 5–7 章）",
      note: "包含多租户 SQL 隔离、RBAC 权限网关、SHA-256 幂等键与人工审批状态机、MCP JSON-RPC 双链路解剖与子进程联调、配对安全裁剪与向量余弦检索。",
      names: ["lab05_enterprise_safety.py", "lab06_mcp_server.py", "lab06_mcp_bridge.py", "lab07_context_rag.py"]
    },
    {
      id: "evaluation",
      title: "第四阶段 · 全链路追踪、五维回归评测与全量单元测试（第 8–10 章）",
      note: "包含 Trace/Span 耗时记录、合格基线 vs 缺陷模型自动化评测对比以及覆盖全套 8 组实验的单元测试套件。",
      names: ["lab08_eval_harness.py", "test_labs.py"]
    }
  ];

  const descriptions = {
    "common.py": "公共基础设施：StepLogger 分步输出助手、OrderSystem 内存 SQLite 模拟业务服务、安全 HTTPS 客户端。",
    "lab01_llm_vs_agent.py": "第 1 章实验：分 3 步直观对比『纯大模型调用』、『传统业务查询』与『最小三角色 Agent 闭环』。",
    "lab02_tool_schema.py": "第 2 章实验：拆解 JSON Schema 工具说明书，对照有无 tools 与不同 tool_choice 下的真实报文变化。",
    "lab03_tool_execution.py": "第 3 章实验：ToolRegistry 四层错误防御漏斗（非法 JSON / 未知工具 / 类型错误 / 查无记录）与两轮消息拼装。",
    "lab04_agent_loop.py": "第 4 章实验：手写干净的 AgentRuntime 多轮 ReAct 循环，内置 OpenAI Chat / Responses / Claude 三大协议适配器。",
    "lab05_enterprise_safety.py": "第 5 章实验：Principal 可信身份注入、RBAC 目录裁剪与硬拦截、SHA-256 事务幂等键与 HITL 审批状态机。",
    "lab06_mcp_server.py": "第 6 章服务端：基于标准 MCP 协议暴露订单查询与制度读取工具的独立服务脚本。",
    "lab06_mcp_bridge.py": "第 6 章客户端：支持零依赖展示 JSON-RPC 双链路桥接全过程（--demo-protocol），以及真实子进程联调。",
    "lab07_context_rag.py": "第 7 章实验：绝不拆散 tool_calls 配对的上下文预算裁剪算法 + Embedding 余弦相似度语义检索。",
    "lab08_eval_harness.py": "第 8–9 章实验：带 Trace/Span 追踪的五维自动化评测基准，支持 --flawed 模式演示秒抓模型幻觉与漏查缺陷。",
    "test_labs.py": "全课程自动化验证套件：12 项单元测试覆盖核心协议适配、错误边界、租户隔离、幂等冲突与上下文裁剪。"
  };

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const x of bytes) {
      crc ^= x;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipBytes(entries) {
    const enc = new TextEncoder(), locals = [], central = [];
    let offset = 0, centralSize = 0;
    for (const [name, source] of entries) {
      const n = enc.encode(name), data = enc.encode(source), crc = crc32(data);
      const l = new Uint8Array(30 + n.length), v = new DataView(l.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true);
      v.setUint16(12, 0x21, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true); v.setUint16(26, n.length, true); l.set(n, 30);

      const c = new Uint8Array(46 + n.length), w = new DataView(c.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true);
      w.setUint16(8, 0x800, true); w.setUint16(14, 0x21, true); w.setUint32(16, crc, true);
      w.setUint32(20, data.length, true); w.setUint32(24, data.length, true);
      w.setUint16(28, n.length, true); w.setUint32(42, offset, true); c.set(n, 46);

      locals.push(l, data); central.push(c);
      offset += l.length + data.length; centralSize += c.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true);
    e.setUint16(10, entries.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    const out = new Uint8Array(offset + centralSize + 22);
    let pos = 0;
    for (const b of [...locals, ...central, end]) { out.set(b, pos); pos += b.length; }
    return out;
  }

  function triggerDownload(filename, bytesOrText, mime) {
    const blob = new Blob([bytesOrText], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadZip(fileNames, zipTag) {
    const needed = new Set(["common.py", ...fileNames]);
    const entries = [];
    if (files["README.md"]) entries.push(["README.md", files["README.md"]]);
    for (const name of needed) {
      if (typeof files[name] === "string") entries.push([name, files[name]]);
    }
    triggerDownload("agent-learning-lab-" + zipTag + ".zip", zipBytes(entries), "application/zip");
  }

  function highlightPy(raw) {
    const esc = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const re = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#.*$)|\b(def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|try|except|finally|raise|with|async|await|True|False|None)\b|\b(\d+(?:\.\d+)?)\b/gm;
    return esc.replace(re, (m, str, com, kw, num) => {
      if (str) return '<span class="tok-str">' + str + '</span>';
      if (com) return '<span class="tok-com">' + com + '</span>';
      if (kw) return '<span class="tok-kw">' + kw + '</span>';
      if (num) return '<span class="tok-num">' + num + '</span>';
      return m;
    });
  }

  const pyFiles = Object.keys(files).filter(k => k.endsWith(".py"));
  document.getElementById("bundleSummary").textContent =
    "共 " + pyFiles.length + " 个教学级 Python 源文件 + 运行说明 · 浏览器端即时打包生成 ZIP";

  const dlAll = () => downloadZip(pyFiles, "full");
  document.getElementById("downloadAllBtn").onclick = dlAll;
  document.getElementById("downloadAllBtn2").onclick = dlAll;

  const targetFile = new URLSearchParams(location.search).get("file");
  const fromChapter = new URLSearchParams(location.search).get("from");
  if (/^([1-9]|10)$/.test(fromChapter || "")) {
    document.getElementById("backLink").href = "index.html#chapter-" + fromChapter;
  }

  const container = document.getElementById("groupsContainer");
  for (const grp of groups) {
    const card = document.createElement("section");
    card.className = "card";
    card.style.marginBottom = "20px";

    const head = document.createElement("div");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap";
    const h2 = document.createElement("h2");
    h2.style.cssText = "margin:0;border:0;padding:0;font-size:19px";
    h2.textContent = grp.title;
    const zipBtn = document.createElement("button");
    zipBtn.className = "btn";
    zipBtn.textContent = "下载本组 ZIP（自动附带 common.py）";
    zipBtn.onclick = () => downloadZip(grp.names, grp.id);
    head.append(h2, zipBtn);

    const note = document.createElement("p");
    note.className = "muted-meta";
    note.style.margin = "8px 0 14px";
    note.textContent = grp.note;
    card.append(head, note);

    for (const name of grp.names) {
      const source = files[name] || "";
      const row = document.createElement("div");
      row.id = "file-" + name;
      row.style.cssText = "border-top:1px solid var(--line);padding:14px 0 6px";

      const topRow = document.createElement("div");
      topRow.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap";

      const info = document.createElement("div");
      info.innerHTML = "<strong><code>" + name + "</code></strong><div class='muted-meta' style='margin-top:4px'>" + (descriptions[name] || "") + "</div>";

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;flex-shrink:0";

      const previewBox = document.createElement("div");
      previewBox.style.display = targetFile === name ? "block" : "none";

      function fillPreview() {
        const cb = document.createElement("div");
        cb.className = "codebox";
        const ch = document.createElement("div");
        ch.className = "codehead";
        ch.innerHTML = "<span>labs/" + name + " · 完整源码</span>";
        const cp = document.createElement("button");
        cp.textContent = "复制全部";
        cp.onclick = () => navigator.clipboard.writeText(source);
        ch.append(cp);
        const pre = document.createElement("pre");
        pre.style.maxHeight = "520px";
        pre.innerHTML = highlightPy(source);
        cb.append(ch, pre);
        previewBox.append(cb);
      }

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "btn";
      toggleBtn.textContent = targetFile === name ? "收起源码" : "在线预览源码";
      toggleBtn.onclick = () => {
        const open = previewBox.style.display === "none";
        previewBox.style.display = open ? "block" : "none";
        toggleBtn.textContent = open ? "收起源码" : "在线预览源码";
        if (open && !previewBox.hasChildNodes()) fillPreview();
      };

      if (targetFile === name) fillPreview();

      const saveBtn = document.createElement("button");
      saveBtn.className = "btn";
      saveBtn.textContent = "下载 .py";
      saveBtn.onclick = () => triggerDownload(name, source, "text/plain;charset=utf-8");

      actions.append(toggleBtn, saveBtn);
      topRow.append(info, actions);
      row.append(topRow, previewBox);
      card.append(row);
    }
    container.append(card);
  }

  if (targetFile) {
    const el = document.getElementById("file-" + targetFile);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }
})();
