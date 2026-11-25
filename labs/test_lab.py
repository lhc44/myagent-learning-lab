import unittest
from agent import FakeModel, make_registry, run
from retrieval import retrieve, pack
from workflow import Workflow

class LabTests(unittest.TestCase):
    def test_agent(self):
        result, trace = run(FakeModel(),make_registry(),"查订单")
        self.assertIn("已完成",result)
        self.assertEqual(trace[2]["call_id"],"demo-1")

    def test_invalid_args(self):
        with self.assertRaises(ValueError):
            make_registry().call("query_order",{"order_id":123})

    def test_unknown_tool(self):
        with self.assertRaises(KeyError):
            make_registry().call("unknown",{})

    def test_budget(self):
        with self.assertRaises(RuntimeError):
            run(FakeModel(),make_registry(),"查订单",max_steps=1)

    def test_tenant(self):
        docs = [{"tenant":"b","text":"order"},{"tenant":"a","text":"order"}]
        self.assertEqual(retrieve("order",docs,"a"),[docs[1]])
        self.assertEqual(pack(docs,0),[])

    def test_approval(self):
        w = Workflow("a")
        with self.assertRaises(PermissionError):
            w.execute("a","k")
        with self.assertRaises(PermissionError):
            w.approve("b","approver")
        w.approve("a","approver")
        self.assertEqual(w.execute("a","k"),"done")
        self.assertEqual(w.execute("a","k"),"already done")
        self.assertEqual(w.writes,1)
