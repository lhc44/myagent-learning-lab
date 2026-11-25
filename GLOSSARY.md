# 术语表
|术语|含义|
|---|---|
|LLM|语言模型，生成文本或调用指令|
|Tool definition|名称、描述、参数 schema|
|Registry|工具定义及执行函数的映射|
|Discovery|发现可用工具|
|Dispatch|根据调用名定位执行函数|
|Agent loop|模型、执行器、结果回传的循环|
|Harness|运行时、上下文、权限、日志等支撑设施|
|MCP|Host 与外部 Server 的标准通信协议|
|JSON-RPC|带方法名、参数及关联 ID 的消息格式|
|Context|本轮实际提供给模型的信息|
|Memory|跨轮次保存且按需读取的信息|
|RAG|检索材料后提供给模型生成答案|
|Tool search|从工具目录检索候选工具|
|Checkpoint|可恢复的执行状态|
|Idempotency|重复请求不会重复产生业务效果|
|HITL|人工确认或决策|
|Eval|以任务集衡量系统表现|
|Tracing|记录一次任务跨组件的调用链|
