# 权威论文、标准规范与官方文档导航

本目录收录课程各章节引用的**一手权威资料**（奠基论文、协议标准、头部实验室工程指南与主流框架官方文档），建议在完成对应章节的本地 Python 实验后对照深入阅读。

## 一、核心架构范式与工程指南
- **[Anthropic · Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)**：工业界最经典的智能体系统设计指南，清晰界定 Workflows 与 Autonomous Agents 及五大编排模式。
- **[Yao et al. (ICLR 2023) · ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)**：提出 Thought–Action–Observation 交替推理循环的奠基论文。
- **[Anthropic · Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)**：深入剖析智能体上下文窗口预算、工具描述优化、历史压缩与子智能体隔离策略。
- **[OpenAI · A Practical Guide to Building Agents (PDF)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)**：面向工程团队的单智能体构建、护栏设计与多智能体拆分实用手册。

## 二、原生工具调用与开放连接协议
- **[OpenAI · Function Calling & Structured Outputs Guide](https://platform.openai.com/docs/guides/function-calling)**：详解 `tools`、`tool_choice`、`strict: true` 受限解码与并行工具调用协议。
- **[Anthropic · Claude Tool Use Documentation](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview)**：详解 `input_schema`、`tool_use`、`tool_result` 与错误回传自愈模式。
- **[Model Context Protocol (MCP) Official Specification](https://modelcontextprotocol.io/specification/)**：MCP 架构拓扑、JSON-RPC 2.0 消息规范、Tools / Resources / Prompts 原语与安全建议。
- **[MCP Python SDK Repository](https://github.com/modelcontextprotocol/python-sdk)**：官方 Python 服务端与客户端实现源码及文档。

## 三、安全、可观测性与科学评估
- **[OWASP Top 10 for Large Language Model Applications](https://genai.owasp.org/llm-top-10/)**：涵盖提示词注入（Prompt Injection）、过度代理（Excessive Agency）等关键安全风险与缓解方案。
- **[Berkeley Function Calling Leaderboard (BFCL)](https://gorilla.cs.berkeley.edu/leaderboard.html)**：加州大学伯克利分校维护的函数调用多维评估基准（单轮、多轮、并行、无关问题拒止）。
- **[Anthropic · Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)**：如何针对多步智能体设计高信噪比的轨迹评估与自动评分器。
- **[OpenTelemetry · Semantic Conventions for Generative AI](https://opentelemetry.io/docs/specs/semconv/gen-ai/)**：大模型与智能体全链路追踪（Trace / Span）行业标准字段规范。

## 四、主流生产框架与系统课程
- **[OpenAI Agents SDK (Python)](https://openai.github.io/openai-agents-python/)**：轻量级智能体编排、Handoffs、Guardrails 与内置追踪框架。
- **[LangGraph Documentation](https://docs.langchain.com/oss/python/langgraph/overview)**：有状态图编排、持久化 Checkpointer 与 Human-in-the-Loop 框架文档。
- **[Spring AI Reference Documentation](https://docs.spring.io/spring-ai/reference/)**：Java / Spring Boot 企业生态集成 `ChatClient`、`@Tool`、`ToolContext`、RAG 与 MCP 官方参考。
- **[Hugging Face · AI Agents Course](https://huggingface.co/learn/agents-course/en/unit0/introduction)** 与 **[MCP Course](https://huggingface.co/learn/mcp-course/en/unit0/introduction)**：免费开放的社区互动课程补充读物。
