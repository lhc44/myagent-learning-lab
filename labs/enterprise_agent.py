"""Cumulative offline enterprise Agent lab. No external API or real business data."""
from dataclasses import dataclass
import sqlite3, json, hashlib
@dataclass(frozen=True)
class Principal:
    tenant: str
    user: str
    permissions: frozenset
class Store:
    def __init__(self,path=":memory:"):
        self.db=sqlite3.connect(path)
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS orders(tenant TEXT,id TEXT,status TEXT,PRIMARY KEY(tenant,id));
        CREATE TABLE IF NOT EXISTS requests(tenant TEXT,key TEXT,digest TEXT,order_id TEXT,state TEXT,PRIMARY KEY(tenant,key));
        CREATE TABLE IF NOT EXISTS audit(tenant TEXT,user TEXT,tool TEXT,status TEXT);
        INSERT OR IGNORE INTO orders VALUES('t1','A100','paid');
        INSERT OR IGNORE INTO orders VALUES('t2','B200','paid');
        """)
    def query(self,p,id):
        row=self.db.execute("SELECT status FROM orders WHERE tenant=? AND id=?",(p.tenant,id)).fetchone()
        return {"status":row[0] if row else "not_accessible"}
    def submit(self,p,id,key):
        digest=hashlib.sha256(json.dumps({"id":id},sort_keys=True).encode()).hexdigest()
        with self.db:
            old=self.db.execute("SELECT digest,state FROM requests WHERE tenant=? AND key=?",(p.tenant,key)).fetchone()
            if old:
                if old[0]!=digest:raise ValueError("idempotency conflict")
                return {"state":old[1],"key":key}
            if self.query(p,id)["status"]!="paid":raise PermissionError("not accessible")
            self.db.execute("INSERT INTO requests VALUES(?,?,?,?,?)",(p.tenant,key,digest,id,"pending"))
        return {"state":"pending","key":key}
    def audit(self,p,name,status):
        with self.db:self.db.execute("INSERT INTO audit VALUES(?,?,?,?)",(p.tenant,p.user,name,status))
class Registry:
    def __init__(self,store):
        self.store=store
        self.tools={
            "query_order":("order:read",{"id":str},store.query),
            "query_project":("project:read",{"id":str},lambda p,id:{"status":"active" if (p.tenant,id)==("t1","P1") else "not_accessible"}),
            "search_policy":("policy:read",{},lambda p:{"evidence":["P1: 退款须审批"]} if p.tenant=="t1" else {"evidence":[]}),
            "submit_refund_request":("refund:request",{"id":str,"key":str},store.submit)}
    def definitions(self,p):
        return [{"name":n,"required":list(fields)} for n,(perm,fields,fn) in self.tools.items() if perm in p.permissions]
    def call(self,p,name,args):
        try:
            if name not in self.tools:raise ValueError("unknown tool")
            perm,fields,fn=self.tools[name]
            if perm not in p.permissions:raise PermissionError("denied")
            if not isinstance(args,dict) or set(args)!=set(fields) or any(type(args[k]) is not t for k,t in fields.items()):raise ValueError("invalid arguments")
            value=fn(p,**args)
        except (ValueError,PermissionError):
            self.store.audit(p,name,"denied_or_invalid");raise
        self.store.audit(p,name,"ok")
        return value
def run(model,registry,p,task,max_steps=4,max_calls=6):
    history=[{"role":"user","content":task}]
    for _ in range(max_steps):
        reply=model(history,registry.definitions(p))
        calls=reply.get("calls",[])
        if not calls:return reply.get("text",""),history
        history.append({"role":"assistant","calls":calls})
        for call in calls:
            if max_calls<=0:raise RuntimeError("tool budget")
            max_calls-=1
            try:result=registry.call(p,call["name"],call["args"])
            except (ValueError,PermissionError):result={"error":"denied_or_invalid"}
            history.append({"role":"tool","call_id":call["id"],"content":result})
    raise RuntimeError("step limit")
def fake(history,tools):
    if history[-1]["role"]=="tool":return {"text":str(history[-1]["content"])}
    return {"calls":[{"id":"c1","name":"query_order","args":{"id":"A100"}}]}
if __name__=="__main__":
    p=Principal("t1","student",frozenset({"order:read","refund:request","project:read","policy:read"}))
    print(run(fake,Registry(Store()),p,"查询A100")[0])
