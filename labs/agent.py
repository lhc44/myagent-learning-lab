"""离线教学：模型替身只负责产生指令，Registry 执行，Runtime 维护循环。"""
from dataclasses import dataclass
from typing import Callable

@dataclass
class Tool:
    name: str
    description: str
    fields: dict
    fn: Callable

class Registry:
    def __init__(self):
        self.tools = {}

    def register(self, tool):
        if tool.name in self.tools:
            raise ValueError("duplicate tool")
        self.tools[tool.name] = tool

    def definitions(self):
        # 描述与函数分离；真实接口需要转换为对应供应商的 schema。
        return [{"name": t.name, "description": t.description,
                 "parameters": {"type": "object", "properties": {
                     k: {"type": {str:"string", int:"integer"}[v]}
                     for k,v in t.fields.items()},
                     "required": list(t.fields), "additionalProperties": False}}
                for t in self.tools.values()]

    def call(self, name, args):
        t = self.tools[name]
        if not isinstance(args, dict) or set(args) != set(t.fields):
            raise ValueError("invalid fields")
        if any(type(args[k]) is not v for k,v in t.fields.items()):
            raise ValueError("invalid type")
        return t.fn(**args)

class FakeModel:
    # 确定性替身：不是 LLM，不可用于证明语义选择能力。
    def respond(self, messages, tools):
        if messages[-1]["role"] == "tool":
            return {"text": str(messages[-1]["content"])}
        return {"calls": [{"id":"demo-1","name":"query_order",
                           "arguments":{"order_id":"10086"}}]}

def run(model, registry, task, max_steps=5):
    messages = [{"role":"user","content":task}]
    for _ in range(max_steps):
        response = model.respond(messages, registry.definitions())
        messages.append({"role":"assistant","content":response})
        if not response.get("calls"):
            return response["text"], messages
        for call in response["calls"]:
            try:
                result = registry.call(call["name"], call["arguments"])
            except (ValueError, KeyError):
                result = {"error":"invalid tool or arguments"}
            messages.append({"role":"tool","call_id":call["id"],"content":result})
    raise RuntimeError("step budget exhausted")

def make_registry():
    r = Registry()
    r.register(Tool("query_order","查询虚构订单状态",{"order_id":str},
                    lambda order_id: {"order_id":order_id,"status":"已完成" if order_id=="10086" else "不存在"}))
    return r

if __name__ == "__main__":
    answer, trace = run(FakeModel(), make_registry(), "查询订单10086")
    for message in trace:
        print(message)
    print("最终:", answer)
