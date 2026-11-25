# AI Agent 工程学习实验室

从工具调用到企业级智能体运行时：以原理、协议、实验、评估为主线。中文原创教材，官方资料为补充；不学习界面框架，不要求 GPU。

## 开始学习

先阅读 [学习路线](ROADMAP.md) 和 [术语表](GLOSSARY.md)，再按编号完成每章。每章先理解数据流，再做实验，最后回答验收问题。Python 3.11+ 为主线，Java/Spring AI 为企业落地选修。离线实验使用模拟模型，不代表真实模型能力；在线实验需自行配置获授权的模型接口，可能收费。

| 章 | 内容 |
|---|---|
| 01 | [Agent 基础与模型消息](courses/01-agent.md) |
| 02 | [Function Calling 与工具设计](courses/02-tools.md) |
| 03 | [Agent Runtime 与执行循环](courses/03-runtime.md) |
| 04 | [MCP 协议、客户端与服务端](courses/04-mcp.md) |
| 05 | [Context Engineering 与记忆](courses/05-context.md) |
| 06 | [RAG 与 Tool Search](courses/06-retrieval.md) |
| 07 | [Agent Harness、Skills、Hooks](courses/07-harness.md) |
| 08 | [规划、工作流、多智能体](courses/08-orchestration.md) |
| 09 | [企业安全与生产工程](courses/09-enterprise.md) |
| 10 | [成熟框架与 Java 落地](courses/10-frameworks.md) |
| 11 | [Agent Evaluation](courses/11-evaluation.md) |
| 12 | [毕业项目](courses/12-capstone.md) |

[官方资料索引](references/README.md) · [实验运行指南](labs/README.md)

课程目标：能解释每一次工具调用如何发生，自己实现最小运行时，并能设计可靠、可审计的企业智能体。所有示例业务数据均为虚构，不包含个人信息或真实企业凭据。
