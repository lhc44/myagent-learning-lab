# 真实模型 API 实验（主线）

这是实际 HTTP 调用，不是伪代码。业务数据为本地 SQLite 虚构订单；模型由你选择的真实服务提供。不依赖 Gradio、任何 Agent 框架或 Python 第三方库。先从 Chat Completions 格式入手，再换其他格式。

## 第一步：准备接口信息

从你已经有权限的供应商获取：接口格式、API 基础地址（通常以 /v1 结尾）、API Key、支持工具调用的模型完整名称。三种格式不能混用。仅对可信服务配置密钥，不提交 Git、不填到网站里。模型调用可能扣费，实验默认最多四轮、八次本地工具调用，每轮限制生成长度（不是金额硬上限）。

| 格式 | AGENT_API_FORMAT | 路径（相对于基础地址） |
|---|---|---|
| OpenAI Chat Completions 及兼容接口 | chat | /chat/completions |
| OpenAI Responses | responses | /responses |
| Anthropic Messages 及兼容接口 | messages | /messages |

兼容服务可能只实现其中部分字段，也可能要求不同鉴权。按供应商说明验证；不保证任意代理都支持。Gemini 原生格式不在本实验支持范围。

## 第二步：在终端执行（Windows PowerShell）

```powershell
$env:AGENT_API_FORMAT = "chat"
$env:AGENT_BASE_URL = "https://api.openai.com/v1"
$env:AGENT_MODEL = "替换为你有权限的模型名"
$env:AGENT_API_KEY = Read-Host "输入 API Key" -MaskInput
python labs/real_api_agent.py
```

macOS/Linux 使用 export 设置格式、地址和模型；用 `read -rs AGENT_API_KEY; export AGENT_API_KEY` 输入密钥（Bash）。不要复制占位符原样运行。若 Chat 兼容接口只支持 max_tokens，可依据提供商文档设置 AGENT_CHAT_LEGACY_MAX_TOKENS=1。

## 第三步：看懂实际过程

- 第 1 轮请求：模型收到问题和两个工具的名称、说明、参数规则。
- 模型请求：例如 query_order({"order_id":"A100"})。这不是数据库查询结果。
- 程序执行结果：Python 执行真正的 SQLite 查询，A100 的 payment=paid（已付款）、shipping=pending（未发货）。
- 后续轮：模型可以请求 read_refund_policy，也可以直接回答；每个调用结果附原调用 ID。
- 最终回答：理想情况下说明订单已付款未发货，依据制度可以申请，但没有执行退款。如果模型没有查制度便自行声称符合规则，记录为实验失败，不要认为只要有文字就是成功。
- 本轮用量来自真实服务返回的 usage；不同格式字段不同。若服务未返回，不推测实际 Token 数。

## 第四步：自己修改并验证

```bash
python labs/real_api_agent.py "查一下不存在的 Z999 订单"
python labs/real_api_agent.py "Java 是什么？"
python labs/real_api_agent.py "查一下我的订单"
python labs/real_api_agent.py --no-tools "A100 付款了吗？"
python -m unittest discover -s labs -p test_real_api_agent.py -v
```

理想现象：Z999 返回未找到；Java 问题不调用工具；缺编号询问用户；关闭工具时模型不应声称已查询。模型行为不是确定性的，须记录偏差。单元测试使用预设 HTTP 响应检查协议衔接，不发外部请求，也不证明真实模型选得准。

## 如果出错

401 检查密钥与服务域名；403 检查模型权限；404 检查基础地址和模型名称；400 检查工具格式与供应商支持的字段；429 检查余额/配额/速率。不要把真实密钥粘贴到 issue 或截图。没有实际返回时不要编造输出。工具报 not_found 是业务查询结果，不是 HTTP 404。

## 官方依据（2026-11-25 查阅）

- OpenAI Function calling: https://developers.openai.com/api/docs/guides/function-calling
- OpenAI API migration: https://developers.openai.com/api/docs/guides/migrate-to-responses
- Anthropic tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls

本项目只实现基础非流式、客户端自定义函数调用。尚未覆盖所有 reasoning 模型的无状态上下文要求、Gemini 原生格式、认证服务、并行执行与生产级网络重试；不宣称兼容所有模型。实际付费 API 联调需使用你自己的凭据。
