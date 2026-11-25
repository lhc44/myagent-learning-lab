import unittest
from copy import deepcopy
from real_api_agent import run, OrderStore
class ProtocolTests(unittest.TestCase):
    def setUp(self):self.store=OrderStore()
    def tearDown(self):self.store.db.close()
    def replay(self,fmt,first,last,path,assert_result):
        requests=[]
        def send(p,b):
            self.assertEqual(p,path);requests.append(deepcopy(b))
            return first if len(requests)==1 else last
        answer,count=run(fmt,send,self.store.execute,"查A100",show=lambda _:None)
        self.assertEqual((answer,count),("已付款",1))
        assert_result(requests[1])
    def test_responses(self):
        self.replay("responses",{"status":"completed","output":[{"type":"function_call","call_id":"c1","name":"query_order","arguments":"{\"order_id\":\"A100\"}"}]},{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"已付款"}]}]},"/responses",lambda b:self.assertEqual(b["input"][-1]["call_id"],"c1"))
    def test_chat(self):
        self.replay("chat",{"choices":[{"message":{"role":"assistant","tool_calls":[{"id":"c2","type":"function","function":{"name":"query_order","arguments":"{\"order_id\":\"A100\"}"}}]}}]},{"choices":[{"message":{"role":"assistant","content":"已付款"}}]},"/chat/completions",lambda b:self.assertEqual(b["messages"][-1]["tool_call_id"],"c2"))
    def test_messages(self):
        self.replay("messages",{"content":[{"type":"tool_use","id":"c3","name":"query_order","input":{"order_id":"A100"}}]},{"content":[{"type":"text","text":"已付款"}]},"/messages",lambda b:self.assertEqual(b["messages"][-1]["content"][0]["tool_use_id"],"c3"))
    def test_invalid_args(self):self.assertIn("error",self.store.execute("query_order",{"order_id":1}))
    def test_unknown_tool(self):self.assertIn("error",self.store.execute("delete",{}))
    def test_not_found(self):self.assertEqual(self.store.execute("query_order",{"order_id":"Z999"})["status"],"not_found")
    def test_budget(self):
        def send(p,b):return {"output":[{"type":"function_call","call_id":"c","name":"query_order","arguments":"{}"}]}
        with self.assertRaises(RuntimeError):run("responses",send,self.store.execute,"q",max_calls=0,show=lambda _:None)
