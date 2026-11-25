import unittest,tempfile
from pathlib import Path
from enterprise_agent import Principal,Store,Registry,run,fake
class EnterpriseTests(unittest.TestCase):
    def setUp(self):
        self.s=Store();self.r=Registry(self.s)
        self.p=Principal("t1","a",frozenset({"order:read","refund:request"}))
    def tearDown(self):self.s.db.close()
    def test_read(self):self.assertIn("paid",run(fake,self.r,self.p,"query")[0])
    def test_tenant(self):self.assertEqual(self.r.call(self.p,"query_order",{"id":"B200"})["status"],"not_accessible")
    def test_permission(self):
        with self.assertRaises(PermissionError):self.r.call(self.p,"search_policy",{})
    def test_args(self):
        with self.assertRaises(ValueError):self.r.call(self.p,"query_order",{"id":123})
    def test_pending_idempotent(self):
        for _ in range(2):self.assertEqual(self.r.call(self.p,"submit_refund_request",{"id":"A100","key":"R1"})["state"],"pending")
        self.assertEqual(self.s.db.execute("SELECT count(*) FROM requests").fetchone()[0],1)
    def test_conflict(self):
        self.r.call(self.p,"submit_refund_request",{"id":"A100","key":"R1"})
        with self.assertRaises(ValueError):self.r.call(self.p,"submit_refund_request",{"id":"B200","key":"R1"})
    def test_budget(self):
        def loop(h,t):return {"calls":[{"id":"x","name":"query_order","args":{"id":"A100"}}]}
        with self.assertRaises(RuntimeError):run(loop,self.r,self.p,"q",max_calls=1)
    def test_no_tool(self):self.assertEqual(run(lambda h,t:{"text":"hello"},self.r,self.p,"hi")[0],"hello")
    def test_restart(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"db.sqlite"
            s=Store(path);Registry(s).call(self.p,"submit_refund_request",{"id":"A100","key":"R1"});s.db.close()
            s=Store(path)
            try:self.assertEqual(Registry(s).call(self.p,"submit_refund_request",{"id":"A100","key":"R1"})["state"],"pending")
            finally:s.db.close()
