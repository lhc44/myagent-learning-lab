"""Agent Lab: 真实 HTTP API 实验。仅发送虚构订单数据；不调用任何生产写入接口。
Python 3.11+，标准库。配置 AGENT_API_FORMAT、AGENT_API_KEY、AGENT_MODEL、AGENT_BASE_URL。
"""
import argparse
import json
import os
import sqlite3
import sys
from urllib import request, error, parse

SYSTEM = "你是订单助手。涉及订单实时状态或退款规则时，先调用相应工具，不要编造；缺少订单编号时先询问。用中文回答。"
SCHEMA = {"type":"object","properties":{"order_id":{"type":"string","description":"订单编号，例如 A100"}},"required":["order_id"],"additionalProperties":False}
EMPTY = {"type":"object","properties":{},"required":[],"additionalProperties":False}
TOOLS = [
    {"name":"query_order","description":"根据订单编号查询实时付款和发货状态；只读。","parameters":SCHEMA},
    {"name":"read_refund_policy","description":"读取当前模拟退款制度；只读，不执行退款。","parameters":EMPTY},
]

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # 不把认证头转发给另一个域名。
        return None

def post(base, path, key, fmt, body):
    url = base.rstrip("/") + path
    u = parse.urlsplit(url)
    if u.username or u.password or u.query or u.fragment:
        raise ValueError("接口地址不能包含凭据、查询参数或 fragment")
    if u.scheme != "https" and not (u.scheme == "http" and u.hostname in {"localhost","127.0.0.1","::1"}):
        raise ValueError("远程 API 必须使用 HTTPS")
    headers = {"Content-Type":"application/json"}
    if fmt == "messages":
        headers.update({"x-api-key":key,"anthropic-version":"2023-06-01"})
    else:
        headers["Authorization"] = "Bearer " + key
    req = request.Request(url, data=json.dumps(body,ensure_ascii=False).encode("utf-8"), headers=headers, method="POST")
    try:
        with request.build_opener(NoRedirect()).open(req, timeout=30) as r:
            raw=r.read(4*1024*1024+1)
            if len(raw)>4*1024*1024:raise RuntimeError("响应过大")
            return json.loads(raw)
    except error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}：检查接口地址、模型、权限、余额或限流；未自动重试") from None
    except error.URLError:
        raise RuntimeError("网络请求失败：检查 DNS、代理、TLS 和服务可达性") from None

class OrderStore:
    def __init__(self):
        self.db=sqlite3.connect(":memory:")
        self.db.executescript("CREATE TABLE orders(id TEXT PRIMARY KEY,payment TEXT,shipping TEXT); INSERT INTO orders VALUES('A100','paid','pending'),('B200','paid','shipped');")
    def execute(self, name, args):
        # 真实运行的本地数据库查询。数据库中是明确标注的虚构数据。
        if name=="query_order":
            if not isinstance(args,dict) or set(args)!={"order_id"} or type(args["order_id"]) is not str:
                return {"error":"订单编号必须为字符串"}
            row=self.db.execute("SELECT payment,shipping FROM orders WHERE id=?",(args["order_id"],)).fetchone()
            return {"order_id":args["order_id"],"payment":row[0],"shipping":row[1]} if row else {"status":"not_found"}
        if name=="read_refund_policy" and args=={}:
            return {"policy":"已支付且未发货的模拟订单可以提交退款申请，但须人工审批。"}
        return {"error":"未知工具或无效参数"}

def encode(value):
    return json.dumps(value,ensure_ascii=False)

def run(fmt, send, execute, question, with_tools=True, max_rounds=4, max_calls=8, show=print):
    """send(path,body) 真实发送 HTTP 或由测试注入。每种协议保留自己的历史格式。"""
    calls_count=0
    if fmt=="responses":
        history=[{"role":"user","content":question}]
    else:
        history=[{"role":"user","content":question}]
        if fmt=="chat":history.insert(0,{"role":"system","content":SYSTEM})
    for turn in range(1,max_rounds+1):
        if fmt=="responses":
            body={"instructions":SYSTEM,"input":history,"max_output_tokens":1024,"store":False}
            if with_tools:body["tools"]=[{"type":"function",**t,"strict":True} for t in TOOLS]
            path="/responses"
        elif fmt=="chat":
            body={"messages":history,"max_completion_tokens":1024}
            if with_tools:body["tools"]=[{"type":"function","function":t} for t in TOOLS]
            path="/chat/completions"
        elif fmt=="messages":
            body={"system":SYSTEM,"messages":history,"max_tokens":1024}
            if with_tools:body["tools"]=[{"name":t["name"],"description":t["description"],"input_schema":t["parameters"]} for t in TOOLS]
            path="/messages"
        else:raise ValueError("接口格式不支持")
        show(f"第 {turn} 轮请求：{path}")
        r=send(path,body)
        if r.get("usage") is not None:show("本轮用量："+encode(r["usage"]))
        if fmt=="responses":
            if r.get("status") not in (None,"completed"):
                raise RuntimeError("模型响应未正常完成："+str(r.get("status")))
            items=r["output"];history.extend(items)
            calls=[(x["call_id"],x["name"],x["arguments"]) for x in items if x["type"]=="function_call"]
            answer="".join(p.get("text","") for x in items if x["type"]=="message" for p in x.get("content",[]) if p["type"]=="output_text")
        elif fmt=="chat":
            choice=r["choices"][0];m=choice["message"]
            if choice.get("finish_reason") not in (None,"stop","tool_calls"):
                raise RuntimeError("模型输出未正常结束："+str(choice.get("finish_reason")))
            history.append(m)
            calls=[(x["id"],x["function"]["name"],x["function"]["arguments"]) for x in (m.get("tool_calls") or []) if x["type"]=="function"]
            answer=m.get("content") or ""
        else:
            if r.get("stop_reason") not in (None,"end_turn","tool_use","stop_sequence"):
                raise RuntimeError("模型输出未正常结束："+str(r.get("stop_reason")))
            items=r["content"];history.append({"role":"assistant","content":items})
            calls=[(x["id"],x["name"],x["input"]) for x in items if x["type"]=="tool_use"]
            answer="".join(x.get("text","") for x in items if x["type"]=="text")
        if not calls:
            if not answer.strip():raise RuntimeError("没有可用文本，也没有待执行工具；检查停止原因")
            return answer,calls_count
        if not with_tools:raise RuntimeError("本次未启用工具，拒绝执行调用")
        if calls_count+len(calls)>max_calls:raise RuntimeError("工具次数达到上限")
        ids=[c[0] for c in calls]
        if len(ids)!=len(set(ids)):raise RuntimeError("同轮工具调用 ID 重复")
        results=[]
        for cid,name,args in calls:
            if isinstance(args,str):
                try:args=json.loads(args)
                except json.JSONDecodeError:args=None
            value=execute(name,args);calls_count+=1
            show("模型请求："+name+" "+encode(args))
            show("程序执行结果："+encode(value))
            if fmt=="responses":results.append({"type":"function_call_output","call_id":cid,"output":encode(value)})
            elif fmt=="chat":results.append({"role":"tool","tool_call_id":cid,"content":encode(value)})
            else:results.append({"type":"tool_result","tool_use_id":cid,"content":encode(value),"is_error":"error" in value})
        if fmt=="messages":history.append({"role":"user","content":results})
        else:history.extend(results)
    raise RuntimeError("模型轮数达到上限；未得到最终答案")

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("question",nargs="?",default="请查询 A100 的付款与发货状态，并依据当前制度判断能否申请退款。")
    parser.add_argument("--no-tools",action="store_true",help="不提供工具，观察模型区别")
    args=parser.parse_args()
    fmt=os.getenv("AGENT_API_FORMAT","chat")
    if fmt not in {"chat","responses","messages"}:parser.error("AGENT_API_FORMAT 必须为 chat、responses 或 messages")
    key=os.getenv("AGENT_API_KEY")
    model=os.getenv("AGENT_MODEL")
    base=os.getenv("AGENT_BASE_URL", "https://api.anthropic.com/v1" if fmt=="messages" else "https://api.openai.com/v1")
    if not key or not model:parser.error("请先设置 AGENT_API_KEY 与 AGENT_MODEL，不要把密钥写进代码")
    store=OrderStore()
    try:
        def send(path,body):
            # 部分兼容 Chat API 只接受 max_tokens，按提供商文档显式选择。
            if fmt=="chat" and os.getenv("AGENT_CHAT_LEGACY_MAX_TOKENS")=="1":
                body={**body,"max_tokens":body["max_completion_tokens"]};del body["max_completion_tokens"]
            return post(base,path,key,fmt,{"model":model,**body})
        answer,n=run(fmt,send,store.execute,args.question,not args.no_tools)
        print("最终回答："+answer)
        print("实际执行工具次数："+str(n))
    except (RuntimeError,ValueError,KeyError,IndexError,TypeError) as e:
        print("实验未完成："+str(e),file=sys.stderr)
        return 1
    finally:store.db.close()
    return 0
if __name__=="__main__":sys.exit(main())
