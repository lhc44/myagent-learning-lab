# V4 验证记录 · 2026-11-25

已从 GitHub 读取以下三个源码文件，在本地重建并通过 Git blob SHA 核对，确保测试版本与仓库一致：

- real_api_agent.py: 5cf6d90663e6b881a4d352e7596a06b63aa34060
- step_by_step.py: 73d7c1de21df5b28efb5f89583b89d018d3825b3
- test_step_by_step.py: 21429ca57aa87a27a4a220bcbfb4da4979488ffb

执行 `python -m unittest test_step_by_step -v`，6 项通过：正常查询、非法 JSON、类型错误、未注册工具、订单不存在、参数规范。执行 `python step_by_step.py errors`，五组实际结果依次为 paid/pending、invalid_json、invalid_arguments、unknown_tool、not_found。

新版 HTML 内嵌 JavaScript 语法检查通过；11 章 33 小节均包含章末练习与讲解；分步脚本与网页下载内容一致；旧版进度存储键保留。

未验证：真实模型付费接口、现代 MCP 联调、完整浏览器交互与 GitHub Pages 发布。未将离线测试当作真实模型能力验证。
