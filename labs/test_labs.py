"""本地核心确定性逻辑单元测试 (test_labs.py) —— 毫秒级免费验证，不消耗真实 API 额度。

运行方式（在 labs 目录下）：
  python -m unittest discover -v
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from common import OrderSystem
from lab02_tool_schema import ORDER_TOOL_SCHEMA
from lab03_tool_execution import execute_tool_safely
from lab04_agent_loop import dispatch_tool
from lab05_enterprise_safety import EnterpriseOrderStore, IdempotencyConflictError, Principal
from lab06_mcp_server import prompt_refund_audit, resource_read_policy, tool_query_order
from lab07_context_rag import cosine_similarity, trim_history_safely
from lab08_eval_harness import build_eval_suite


class CoreDeterministicTests(unittest.TestCase):
    def setUp(self) -> None:
        self.orders = OrderSystem()

    def tearDown(self) -> None:
        self.orders.close()

    def test_schema_strict_enabled(self) -> None:
        fn = ORDER_TOOL_SCHEMA["function"]
        self.assertTrue(fn["strict"])
        self.assertFalse(fn["parameters"]["additionalProperties"])

    def test_four_layer_tool_defense(self) -> None:
        self.assertEqual(execute_tool_safely(self.orders, "query_order", '{"order_id":"A100"}')["data"]["payment_status"], "paid")
        self.assertEqual(execute_tool_safely(self.orders, "query_order", '{"order_id":"A100"')["error_type"], "invalid_json")
        self.assertEqual(execute_tool_safely(self.orders, "drop_db", '{"order_id":"A100"}')["error_type"], "unknown_tool")
        self.assertEqual(execute_tool_safely(self.orders, "query_order", '{"order_id":100}')["error_type"], "invalid_arguments")
        self.assertEqual(execute_tool_safely(self.orders, "query_order", '{"order_id":"Z999"}')["error_type"], "not_found")

    def test_lab04_tool_dispatcher(self) -> None:
        self.assertEqual(dispatch_tool(self.orders, "query_order", '{"order_id":"A100"}')["payment_status"], "paid")
        self.assertIn("200", dispatch_tool(self.orders, "read_refund_policy", "{}")["policy"])
        self.assertIn("error", dispatch_tool(self.orders, "unknown", "{}"))

    def test_enterprise_tenant_idempotency_and_approval(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = str(Path(tmp) / "ent.sqlite")
            store = EnterpriseOrderStore(db_path)
            cs = Principal("tenant_a", "cs1", frozenset({"order:read", "refund:request"}))
            fin = Principal("tenant_a", "fin1", frozenset({"order:read", "refund:approve"}))
            try:
                self.assertTrue(store.query_order(cs, "A100")["accessible"])
                self.assertFalse(store.query_order(cs, "B200")["accessible"])

                r1 = store.submit_refund_ticket(cs, "A100", "拍错了", "K1")
                self.assertFalse(r1["idempotent_replay"])
                r2 = store.submit_refund_ticket(cs, "A100", "拍错了", "K1")
                self.assertTrue(r2["idempotent_replay"])
                with self.assertRaises(IdempotencyConflictError):
                    store.submit_refund_ticket(cs, "A100", "改理由", "K1")

                self.assertEqual(store.approve_refund(fin, "K1")["state"], "refunded")
            finally:
                store.close()

    def test_mcp_three_primitives(self) -> None:
        self.assertEqual(tool_query_order("A100")["payment_status"], "paid")
        self.assertEqual(json.loads(resource_read_policy("P1"))["uri"], "policy://P1")
        self.assertIn("A100", prompt_refund_audit("A100"))

    def test_pair_safe_trim_and_cosine(self) -> None:
        msgs = [
            {"role": "system", "content": "系统规则"},
            {"role": "user", "content": "旧问题" * 20},
            {"role": "assistant", "content": None, "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "q", "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "c1", "content": "旧结果" * 20},
            {"role": "user", "content": "最新问题"},
        ]
        trimmed = trim_history_safely(msgs, max_input_tokens=60)
        self.assertNotIn("tool", [m["role"] for m in trimmed])
        self.assertAlmostEqual(cosine_similarity([1.0, 0.0], [1.0, 0.0]), 1.0)

    def test_eval_rejects_lucky_guess_without_tool(self) -> None:
        eval_01 = build_eval_suite()[0]
        self.assertFalse(eval_01.check("订单 A100 已付款，待发货", []))
        self.assertTrue(eval_01.check("订单 A100 已付款，待发货", ["query_order"]))


if __name__ == "__main__":
    unittest.main()
