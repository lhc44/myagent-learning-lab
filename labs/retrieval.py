"""离线关键词召回：演示候选筛选，不等同于 embedding 或 tokenizer。"""
def retrieve(query, docs, tenant, k=2):
    terms = set(query.lower().split())
    scored = []
    for doc in docs:
        if doc["tenant"] != tenant:
            continue
        score = len(terms & set(doc["text"].lower().split()))
        if score:
            scored.append((score, doc))
    return [d for _,d in sorted(scored,key=lambda item:-item[0])[:k]]

def pack(docs, character_budget):
    # 字符预算只是教学近似；真实系统用 token 预算。
    result = []
    for d in docs:
        text = d["text"]
        if len(text) <= character_budget:
            result.append(text)
            character_budget -= len(text)
    return result

if __name__ == "__main__":
    docs = [{"tenant":"a","text":"order 查询 订单"},
            {"tenant":"a","text":"project 查询 项目"},
            {"tenant":"b","text":"order 查询 私密 订单"}]
    print(pack(retrieve("order 查询",docs,"a"),40))
