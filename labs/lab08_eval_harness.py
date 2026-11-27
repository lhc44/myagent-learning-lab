"""第 8–9 章实验：真实大模型 5 题自动化评测集 + 耗时追踪 (lab08_eval_harness.py)

不再靠人工随手聊两句『凭感觉判断好不好』！
直接用你当前配置的真实大模型，一次性跑完 5 道覆盖正例、查无此单、通识闲聊、缺参追问与多步推理的考题，
同时断言【中间工具调用轨迹】和【最终回答忠实度】，并打印每题的真实耗时与总成绩单！

运行方式：
  python lab08_eval_harness.py
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable

from common import OrderSystem, step_title
from lab04_agent_loop import run_agent


@dataclass
class EvalCase:
    case_id: str
    category: str
    question: str
    check: Callable[[str, list[str]], bool]
    criterion: str


def build_eval_suite() -> list[EvalCase]:
    return [
        EvalCase(
            case_id="EVAL-01",
            category="精准查单",
            question="帮我查一下订单 A100 的付款和发货进度",
            check=lambda ans, tools: (
                "query_order" in tools
                and ("已付" in ans or "paid" in ans.lower())
                and ("未发" in ans or "待发" in ans or "pending" in ans.lower())
            ),
            criterion="必须真实调用 query_order，且回答包含已付款 + 未发货/待发货",
        ),
        EvalCase(
            case_id="EVAL-02",
            category="查无此单抗幻觉",
            question="查一下订单 Z999 到哪了？",
            check=lambda ans, tools: (
                "query_order" in tools
                and any(w in ans for w in ("未找到", "不存在", "查不到", "没有"))
                and "已发货" not in ans
            ),
            criterion="查询 Z999 后应如实告知不存在，绝不编造发货状态",
        ),
        EvalCase(
            case_id="EVAL-03",
            category="通识问题别乱调工具",
            question="用一句话解释 Python 里的 dict 和 JSON 有什么区别？",
            check=lambda ans, tools: len(tools) == 0 and len(ans.strip()) > 10,
            criterion="普通技术问答不应浪费调用任何业务订单工具",
        ),
        EvalCase(
            case_id="EVAL-04",
            category="缺订单号应主动追问",
            question="我昨天买的东西发货了没有？",
            check=lambda ans, tools: len(tools) == 0 and ("订单" in ans or "编号" in ans or "单号" in ans),
            criterion="用户没给单号时不得瞎猜单号调工具，应先礼貌追问",
        ),
        EvalCase(
            case_id="EVAL-05",
            category="多步证据链（查单+查制度）",
            question="订单 A100 现在能不能申请退款？",
            check=lambda ans, tools: (
                "query_order" in tools
                and "read_refund_policy" in tools
                and "审批" in ans
            ),
            criterion="必须同时查验订单状态与退款制度两项工具，并指出满 200 元需人工审批",
        ),
    ]


def main() -> None:
    suite = build_eval_suite()
    orders = OrderSystem()
    passed = 0

    try:
        for idx, case in enumerate(suite, start=1):
            step_title(idx, f"{case.case_id} [{case.category}]  问题：『{case.question}』")
            t0 = time.perf_counter()
            answer, called_tools = run_agent(orders, case.question)
            elapsed_ms = (time.perf_counter() - t0) * 1000

            ok = case.check(answer, called_tools)
            passed += int(ok)
            print(f"\n  判定结果：{'✅ PASS' if ok else '❌ FAIL'}  |  总耗时：{elapsed_ms:.0f} ms")
            print(f"  实际调用工具轨迹：{called_tools}")
            print(f"  验收标准：{case.criterion}")

        print("\n" + "=" * 60)
        print(f"📋 真实大模型回归评测成绩单：{passed} / {len(suite)} 通过（通过率 {passed * 100 // len(suite)}%）")
    finally:
        orders.close()


if __name__ == "__main__":
    main()
