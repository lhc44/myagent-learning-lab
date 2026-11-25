/* 汇总 10 章系统化主线教材与全局权威参考资料 */
window.TEXTBOOK = [
  ...(window.TEXTBOOK_PART1 || []),
  ...(window.TEXTBOOK_PART2 || [])
];

window.TEXTBOOK_REFERENCES = [
  ["Anthropic · Building Effective Agents", "https://www.anthropic.com/research/building-effective-agents", "区分 Workflow 与 Agent 及五大编排模式的工业界必读经典"],
  ["Yao et al. · ReAct: Synergizing Reasoning and Acting", "https://arxiv.org/abs/2210.03629", "提出 Thought-Action-Observation 交替推理循环的奠基论文"],
  ["OpenAI · Function Calling & Structured Outputs", "https://platform.openai.com/docs/guides/function-calling", "工具 JSON Schema、tool_choice 与结果回传协议规范"],
  ["Anthropic · Tool Use & Context Engineering", "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents", "工具描述打磨、上下文预算管理与智能体评测实践"],
  ["Model Context Protocol (MCP) Specification", "https://modelcontextprotocol.io/specification/", "跨系统标准化连接 Tools、Resources 与 Prompts 的开放协议规范"],
  ["OWASP Top 10 for LLM Applications", "https://genai.owasp.org/llm-top-10/", "提示词注入、过度代理（Excessive Agency）等核心安全防御准则"],
  ["Berkeley Function Calling Leaderboard (BFCL)", "https://gorilla.cs.berkeley.edu/leaderboard.html", "函数调用多维准确性、无关拒止与多轮交互评估基准"],
  ["LangGraph Documentation", "https://docs.langchain.com/oss/python/langgraph/overview", "有状态图编排、断点持久化与 Human-in-the-Loop 官方文档"],
  ["Spring AI Reference", "https://docs.spring.io/spring-ai/reference/", "Java 企业级应用集成大模型工具调用、RAG 与 MCP 官方手册"]
];
