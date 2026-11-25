"""全套分步实验自动化单元测试 (test_labs.py)

运行方式（在 labs 目录下）：
  python -m unittest discover -v
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from common import OrderSystem
from lab01_llm_vs_agent import mock_agent_model, step3_minimal_agent
from lab02_tool_schema import ORDER_TOOL_SCHEMA, build_chat_request, mock_chat_completions
from lab03_tool_execution import create_order_registry
from lab04_agent_loop import AgentRuntime, build_mock_sender, dispatch_business_tool, make_adapter
from lab05_enterprise_safety import (
    EnterpriseOrderStore,
    IdempotencyConflictError,
    Principal,
    SecureToolGateway,
)
from lab06_mcp_bridge import mcp_tool_to_openai_schema
from lab06_mcp_server import prompt_refund_audit, resource_read_policy, tool_query_order
from lab07_context_rag import cosine_similarity, trim_history_safely
from lab08_eval_harness import build_eval_suite, flawed_model, reliable_baseline_model, run_with_tracing


class Lab01To03Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.orders = OrderSystem()
        self.registry = create_order_registry(self.orders)

    def tearDown(self) -> None:
        self.orders.close()

    def test_minimal_agent_closed_loop(self) -> None:
        answer = step3_minimal_agent("查一下 A100", self.orders, mock_agent_model)
        self.assertIn("A100", answer)
        self.assertIn("paid", answer)

    def test_schema_strict_contract(self) -> None:
        params = ORDER_TOOL_SCHEMA["function"]["parameters"]
        self.assertEqual(params["properties"]["order_id"]["type"], "string")
        self.assertFalse(params["additionalProperties"])

    def test_compare_with_and_without_tools(self) -> None:
        no_tool_resp = mock_chat_completions(build_chat_request("m", "A100 发货了吗？", with_tools=False))
        self.assertIsNone(no_tool_resp["choices"][0]["message"].get("tool_calls"))

        with_tool_resp = mock_chat_completions(build_chat_request("m", "A100 发货了吗？", with_tools=True))
        calls = with_tool_resp["choices"][0]["message"]["tool_calls"]
        self.assertEqual(calls[0]["function"]["name"], "query_order")

    def test_four_layer_error_defense(self) -> None:
        ok_res = self.registry.execute_safely("query_order", '{"order_id": "A100"}')
        self.assertTrue(ok_res["ok"])
        self.assertIsNone(ok_res["error_type"])
        self.assertEqual(ok_res["data"]["payment_status"], "paid")

        bad_json = self.registry.execute_safely("query_order", '{"order_id": "A100"')
        self.assertEqual(bad_json["error_type"], "invalid_json")

        bad_tool = self.registry.execute_safely("drop_table", '{"order_id": "A100"}')
        self.assertEqual(bad_tool["error_type"], "unknown_tool")

        bad_type = self.registry.execute_safely("query_order", '{"order_id": 100}')
        self.assertEqual(bad_type["error_type"], "invalid_arguments")

        bool_as_int = self.registry.execute_safely("query_order", '{"order_id": true}')
        self.assertEqual(bool_as_int["error_type"], "invalid_arguments")

        missing_order = self.registry.execute_safely("query_order", '{"order_id": "Z999"}')
        self.assertTrue(missing_order["ok"])
        self.assertEqual(missing_order["error_type"], "not_found")


class Lab04ProtocolAndLoopTests(unittest.TestCase):
    def setUp(self) -> None:
        self.orders = OrderSystem()

    def tearDown(self) -> None:
        self.orders.close()

    def test_all_three_protocols_complete_react_loop(self) -> None:
        for fmt in ("chat", "responses", "messages"):
            with self.subTest(protocol=fmt):
                runtime = AgentRuntime(
                    adapter=make_adapter(fmt),
                    send_fn=build_mock_sender(fmt),
                    execute_tool_fn=lambda n, a: dispatch_business_tool(self.orders, n, a),
                )
                answer, calls = runtime.run("mock", "A100 能退款吗？", verbose=False)
                self.assertEqual(calls, 2)
                self.assertIn("A100", answer)

    def test_tool_budget_guard(self) -> None:
        runtime = AgentRuntime(
            adapter=make_adapter("chat"),
            send_fn=build_mock_sender("chat"),
            execute_tool_fn=lambda n, a: dispatch_business_tool(self.orders, n, a),
            max_tool_calls=1,
        )
        with self.assertRaises(RuntimeError):
            runtime.run("mock", "A100 能退款吗？", verbose=False)


class Lab05EnterpriseSafetyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = EnterpriseOrderStore()
        self.gateway = SecureToolGateway(self.store)
        self.cs = Principal("tenant_a", "cs1", "support", frozenset({"order:read", "refund:request"}))
        self.intern = Principal("tenant_a", "in1", "intern", frozenset({"order:read"}))
        self.fin = Principal("tenant_a", "fin1", "finance", frozenset({"order:read", "refund:approve"}))

    def tearDown(self) -> None:
        self.store.close()

    def test_tenant_isolation_and_rbac(self) -> None:
        self.assertTrue(self.gateway.call(self.cs, "query_order", {"order_id": "A100"})["accessible"])
        self.assertFalse(self.gateway.call(self.cs, "query_order", {"order_id": "B200"})["accessible"])
        self.assertEqual(len(self.gateway.definitions_for(self.intern)), 1)
        with self.assertRaises(PermissionError):
            self.gateway.call(
                self.intern,
                "submit_refund_ticket",
                {"order_id": "A100", "reason": "test", "idempotency_key": "K1"},
            )

    def test_idempotency_and_persistence_and_approval(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_file = str(Path(tmp) / "enterprise.sqlite")
            s1 = EnterpriseOrderStore(db_file)
            try:
                g1 = SecureToolGateway(s1)
                r1 = g1.call(self.cs, "submit_refund_ticket", {"order_id": "A100", "reason": "r", "idempotency_key": "K1"})
                self.assertFalse(r1["idempotent_replay"])
            finally:
                s1.close()

            # 模拟进程重启后重新连接同一 SQLite 文件，验证幂等与审批流
            s2 = EnterpriseOrderStore(db_file)
            try:
                g2 = SecureToolGateway(s2)
                r2 = g2.call(self.cs, "submit_refund_ticket", {"order_id": "A100", "reason": "r", "idempotency_key": "K1"})
                self.assertTrue(r2["idempotent_replay"])
                with self.assertRaises(IdempotencyConflictError):
                    g2.call(self.cs, "submit_refund_ticket", {"order_id": "A100", "reason": "changed", "idempotency_key": "K1"})
                approved = s2.approve_and_execute_refund(self.fin, "K1")
                self.assertEqual(approved["state"], "refunded")
            finally:
                s2.close()


class Lab06To08Tests(unittest.TestCase):
    def test_mcp_schema_translation(self) -> None:
        mcp_tool = {
            "name": "query_order",
            "description": "查询订单",
            "inputSchema": {"type": "object", "properties": {"order_id": {"type": "string"}}, "required": ["order_id"]},
        }
        translated = mcp_tool_to_openai_schema(mcp_tool)
        self.assertEqual(translated["type"], "function")
        self.assertIn("parameters", translated["function"])

    def test_mcp_three_primitives_implementations(self) -> None:
        """验证 MCP 三大原语（Tool / Resource / Prompt）各自返回预期的结构与效果。"""
        order_res = tool_query_order("A100")
        self.assertEqual(order_res["payment_status"], "paid")

        policy_json = json.loads(resource_read_policy("P1"))
        self.assertEqual(policy_json["uri"], "policy://P1")
        self.assertIn("200", policy_json["content"])

        prompt_text = prompt_refund_audit("A100", "买重了")
        self.assertIn("A100", prompt_text)
        self.assertIn("query_order", prompt_text)

    def test_pair_safe_context_trimming(self) -> None:
        msgs = [
            {"role": "system", "content": "系统规则"},
            {"role": "user", "content": "旧问题" * 20},
            {"role": "assistant", "content": None, "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "q", "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "c1", "content": "旧工具结果" * 20},
            {"role": "user", "content": "最新问题"},
        ]
        trimmed = trim_history_safely(msgs, max_input_tokens=60)
        roles = [m["role"] for m in trimmed]
        self.assertEqual(roles[0], "system")
        self.assertNotIn("tool", roles)  # 孤立的 tool 消息绝不能单独残留！
        self.assertEqual(trimmed[-1]["content"], "最新问题")

    def test_cosine_similarity(self) -> None:
        self.assertAlmostEqual(cosine_similarity([1.0, 0.0], [1.0, 0.0]), 1.0)
        self.assertAlmostEqual(cosine_similarity([1.0, 0.0], [0.0, 1.0]), 0.0)

    def test_eval_rejects_lucky_guess_without_tool_call(self) -> None:
        """科学严谨性验证：若模型未调用工具却瞎猜中『已付款、未发货』字样，EVAL-01 必须判定为 FAIL！"""
        orders = OrderSystem()
        try:
            eval_01 = build_eval_suite()[0]
            lucky_guesser = lambda _q, _obs: {"answer": "订单 A100 当前已付款，待发货。"}
            trace = run_with_tracing(orders, lucky_guesser, eval_01.question)
            passed, _ = eval_01.check_fn(trace)
            self.assertFalse(passed)
        finally:
            orders.close()

    def test_eval_suite_catches_flaws(self) -> None:
        orders = OrderSystem()
        try:
            suite = build_eval_suite()
            baseline_passes = sum(
                case.check_fn(run_with_tracing(orders, reliable_baseline_model, case.question))[0]
                for case in suite
            )
            flawed_passes = sum(
                case.check_fn(run_with_tracing(orders, flawed_model, case.question))[0]
                for case in suite
            )
            self.assertEqual(baseline_passes, len(suite))
            self.assertLess(flawed_passes, len(suite))
        finally:
            orders.close()


if __name__ == "__main__":
    unittest.main()
