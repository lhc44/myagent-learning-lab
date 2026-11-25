"""循序渐进的真实模型实验。前 3 个本地步骤不请求外网；在线步骤需要真实 Chat Completions 接口。
在 labs 目录或与 real_api_agent.py 同目录运行。仅使用虚构订单，不执行任何退款。
"""
import argparse
import json
import os
from real_api_agent import post, OrderStore

def display(title, value):
    print("\n" + title)
    print(json.dumps(value, ensure_ascii=False, indent=2))

def send(messages, tools=None, choice=None):
    key = os.environ.get("AGENT_API_KEY")
    model = os.environ.get("AGENT_MODEL")
    base = os.environ.get("AGENT_BASE_URL", "https://api.openai.com/v1")
    if not key or not model:
        raise ValueError("先配置 AGENT_API_KEY 和 AGENT_MODEL。")
    body = {"model":model, "messages":messages}
    body["max_tokens" if os.getenv("AGENT_CHAT_LEGACY_MAX_TOKENS")=="1" else "max_completion_tokens"] = 1024
    if tools is not None:
        body["tools"] = tools
        if choice is not None:
            body["tool_choice"] = choice
    display("实际请求正文（不含密钥）", body)
    result = post(base, "/chat/completions", key, "chat", body)
    display("接口真实返回（仅使用虚构业务数据）", result)
    choice = result["choices"][0]
    if choice.get("finish_reason") not in (None, "stop", "tool_calls"):
        raise ValueError("输出未正常完成："+str(choice.get("finish_reason")))
    return choice["message"]

def query(store, name, raw):
    """四种错误分别处理，便于定位。仅提供一个只读查询工具。"""
    try:
        args = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {"error":"invalid_json", "说明":"参数字符串不是合法 JSON，尚未查询数据库。"}
    if name != "query_order":
        return {"error":"unknown_tool", "说明":"程序未注册这个工具，尚未查询数据库。"}
    if not isinstance(args, dict) or set(args) != {"order_id"} or type(args["order_id"]) is not str:
        return {"error":"invalid_arguments", "说明":"必须提供字符串类型的订单编号，尚未查询数据库。"}
    return store.execute(name, args)

TOOL = {
    "type":"function",
    "function":{
        "name":"query_order",
        "description":"根据订单编号查询虚构订单的付款和发货状态，只读。",
        "parameters":{
            "type":"object",
            "properties":{"order_id":{"type":"string","description":"订单编号，例如 A100"}},
            "required":["order_id"],
            "additionalProperties":False
        }
    }
}
SYSTEM = "你是订单查询助手。用户问订单状态时应先查询工具；如果未提供订单编号，先询问。找不到订单请如实说明。不要编造结果。"

def main():
    p = argparse.ArgumentParser()
    p.add_argument("stage", choices=["local","errors","schema","chat","request","finish"])
    p.add_argument("question", nargs="?", default=None)
    p.add_argument("--choice", choices=["auto","none","required"], default=None, help="工具选择方式；仅 request/finish 支持，兼容接口可能不支持全部选项。")
    p.add_argument("--no-tools", action="store_true", help="request 阶段不提供工具，便于对照实验")
    a = p.parse_args()
    if a.no_tools and (a.stage != "request" or a.choice is not None):
        p.error("--no-tools 只用于 request，且不能与 --choice 一起使用")
    store = OrderStore()
    try:
        if a.stage == "local":
            display("查询 A100",query(store,"query_order",'{"order_id":"A100"}'))
        elif a.stage == "errors":
            for name, raw in [
                ("query_order",'{"order_id":"A100"}'),
                ("query_order",'{"order_id":"A100"'),
                ("query_order",'{"order_id":100}'),
                ("not_registered",'{"order_id":"A100"}'),
                ("query_order",'{"order_id":"Z999"}')
            ]:
                display("输入："+name+" "+raw,query(store,name,raw))
        elif a.stage == "schema":
            display("工具说明",TOOL)
        elif a.stage == "chat":
            msg=send([{"role":"user","content":a.question or "请用一句中文解释什么是 API。"}])
            print("模型回答：",msg.get("content"))
        else:
            messages=[{"role":"system","content":SYSTEM},{"role":"user","content":a.question or "请查询 A100 的付款与发货状态。"}]
            msg=send(messages,None if a.no_tools else [TOOL],a.choice)
            calls=msg.get("tool_calls") or []
            if not calls:
                print("模型没有申请调用工具。回答：",msg.get("content"))
                return
            if a.no_tools:
                raise ValueError("未提供工具却收到工具调用，请检查接口兼容性")
            if a.stage=="request":
                print("到此停止：只是收到工具调用请求，尚未执行查询。")
                return
            if len(calls)>4:
                raise ValueError("本实验最多执行四个只读调用")
            # 只回传此教学所需的 assistant 字段，不把供应商私有扩展混入请求。
            messages.append({"role":"assistant","content":msg.get("content"),"tool_calls":calls})
            for call in calls:
                if call["type"]!="function":raise ValueError("非函数调用")
                f=call["function"]
                value=query(store,f["name"],f["arguments"])
                display("Python 实际执行结果",value)
                messages.append({"role":"tool","tool_call_id":call["id"],"content":json.dumps(value,ensure_ascii=False)})
            # 本阶段只演示一次工具往返；第二次不提供工具，要求模型依据结果作答。
            final=send(messages)
            if final.get("tool_calls"):raise ValueError("第二轮不应继续请求工具")
            print("最终回答：",final.get("content"))
    finally:
        store.db.close()

if __name__=="__main__":
    try:
        main()
    except (ValueError,RuntimeError,KeyError,IndexError,TypeError) as e:
        raise SystemExit("实验未完成："+str(e))
