# AI Agent 工程学习实验室 · V4.2

这是一套面向企业后台开发的中文学习主线。从模型如何理解任务和选择工具入手，学习真实 API 工具定义、工具执行和多轮执行，再学习 MCP、上下文、检索、安全和可靠性。暂不学习前端框架。

## 从哪里开始

- [打开学习网站](https://lhc44.github.io/myagent-learning-lab/)（需 GitHub Pages 已启用）
- [课程说明与环境准备](https://lhc44.github.io/myagent-learning-lab/start.html) · [实验程序下载中心](https://lhc44.github.io/myagent-learning-lab/downloads.html)
- [网站源码](docs/index.html) · [主线课文](docs/textbook.js) · [逐章源码讲解](docs/code-reading.js)
- [真实模型实验](labs/REAL_API.md) · [分步实验脚本](labs/step_by_step.py)

主线采用 11 章、38 个连续小节。每章先解释原因，再逐步观察真实程序，最后安排完整练习和讲解；不再强制每个小知识点配一道选择题。旧版 44 节课程保留于 [选读页面](docs/reference.html)，属于补充资料，原有学习进度和笔记使用旧版独立存储键，不覆盖。新版读完标记不是技能认证。

## 主线顺序

1. 普通业务程序与智能体的区别
2. 模型如何理解任务并决定调用工具
3. 工具说明与参数规范
4. 工具执行、结果回传与错误区分
5. 连续工具调用与执行循环
6. 企业身份、权限、事务与幂等
7. MCP 标准化接入、现代 SDK 2.x 与真实模型桥接
8. 上下文、记忆和真实向量检索
9. 工具检索、技能、长任务与运行支撑
10. 生产可靠性、模型适配、状态和评估
11. 成熟框架与 Java 企业落地

## 运行说明

Python 3.11+，选择 Python 是为了以较少的代码展示模型接口、工具与执行循环，智能体并不依赖特定语言。前五章无需第三方库。下载完整 ZIP 并进入解压目录；若使用 Git 克隆，请先 `cd labs`。教材的命令统一以实验目录为起点，例如 `python step_by_step.py local`。从第二章开始按课程说明配置 API。分步在线实验使用 Chat Completions；多轮实验支持三种接口格式，兼容性由实际供应商验证。所有订单数据为虚构，不执行支付或退款。

本版本不声称全部高级内容已达到生产级：现代 MCP 实验已编写但未联调；真实向量数据库、流式多供应商适配、Java 完整项目和生产部署仍需深化。实际模型调用可能收费，不要提交密钥。

[旧版 Markdown 索引](ROADMAP.md) · [术语表](GLOSSARY.md) · [官方资料索引](references/README.md) · [本地累进项目](labs/ENTERPRISE.md)

[现代 MCP 实验指南](labs/MODERN_MCP.md)、实际工具选择对照实验以及协议与源码逐步阅读。真实模型和 MCP SDK 均须在自己的环境中验证，不宣称线上联调已通过。

V4.2 新增独立下载中心、按章节 ZIP 与完整 ZIP、课程说明、真实 Python 源码逐段讲解。网站进度与笔记仍使用 V4 存储键。
