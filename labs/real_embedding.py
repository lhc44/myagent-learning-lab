"""真实向量检索：使用兼容 OpenAI /embeddings 的服务，不需要向量数据库。"""
import os,math
from real_api_agent import post

docs=[
    ("P1","退款制度：已付款且未发货的订单可提交退款申请，须人工审批。"),
    ("P2","物流制度：发货后可以查询快递单号和运输进度。"),
    ("P3","项目管理制度：上线前必须完成测试和放行审批。"),
]
question="已经付钱但还没发货，怎样申请退钱？"
def similarity(a,b):
    if len(a)!=len(b) or not a:raise ValueError("向量维度不一致")
    denom=math.sqrt(sum(x*x for x in a))*math.sqrt(sum(y*y for y in b))
    if not denom:raise ValueError("零向量")
    return sum(x*y for x,y in zip(a,b))/denom

def main():
    key=os.environ["AGENT_API_KEY"]
    base=os.getenv("AGENT_BASE_URL","https://api.openai.com/v1")
    model=os.environ["AGENT_EMBEDDING_MODEL"]
    texts=[question]+[text for _,text in docs]
    # 这里使用真实向量化接口，而不是手写向量。
    r=post(base,"/embeddings",key,"chat",{"model":model,"input":texts})
    data=sorted(r["data"],key=lambda x:x["index"])
    if [x["index"] for x in data]!=list(range(len(texts))):raise ValueError("向量返回数量或编号不符")
    q=data[0]["embedding"]
    ranked=sorted([(similarity(q,x["embedding"]),doc) for x,doc in zip(data[1:],docs)],key=lambda x:-x[0])
    for score,(id,text) in ranked:print(f"{id} 相似度={score:.4f} {text}")
    print("预期最相关：P1；实际第一名："+ranked[0][1][0])
    if "usage" in r:print("服务端用量：",r["usage"])
if __name__=="__main__":main()
