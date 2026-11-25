"""第 8–9 章综合实验：可观测性追踪（Tracing）与自动化评估基准 (lab08_eval_harness.py)

怎样证明你改完 System Prompt 或换了新模型后，Agent 真的变好了，而不是“按下葫芦浮起瓢”？
靠手工试一两个问题看回答顺不顺眼，叫“玄学调优（Vibe Check）”；
工程化的做法是构建一套可重复运行的 **Eval Harness（评估基准）** + **Trace（全链路追踪）**！

本脚本参考工业界权威函数调用评测集 BFCL（Berkeley Function Calling Leaderboard）思想，同时检验五大维度：
  1. 正常工具选择与参数精确提取（`normal_query`）
  2. 查无结果时的诚实度 / 抗幻觉（`unknown_order_honesty`）
  3. 无关通识问题的免工具直答 / 防过度调用（`irrelevant_no_tool`）
  4. 缺失必填参数时的主动追问澄清（`missing_param_clarify`）
  5. 多步跨工具推理完整性——既查订单又查制度（`multi_step_policy`）

运行方式：
  python lab08_eval_harness.py            # 使用内置基线模拟智能体跑完 5 道标准评测集并输出 Trace 与成绩单
  python lab08_eval_harness.py --flawed   # 故意注入一个“爱幻觉、乱调工具”的缺陷模型，看评测器如何精准抓虫！
"""

from __future__ import annotations

import argparse
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable

from common import OrderSystem, StepLogger


# =====================================================================
# 1. 全链路可观测性结构（Trace & Span）
# =====================================================================

@dataclass
class Span:
    step_type: str  # "llm_call" | "tool_exec"
    name: str
    duration_ms: float
    detail: dict[str, Any]


@dataclass
class AgentTrace:
    trace_id: str
    question: str
    final_answer: str = ""
    called_tools: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    spans: list[Span] = field(default_factory=list)


# =====================================================================
# 2. 定义标准化评估用例（Eval Case）与评分准则
# =====================================================================

@dataclass
class EvalCase:
    case_id: str
    category: str
    question: str
    check_fn: Callable[[AgentTrace], tuple[bool, str]]


def build_eval_suite() -> list[EvalCase]:
    return [
        EvalCase(
            case_id="EVAL-01",
            category="精准工具调用",
            question="帮我查一下订单 A100 的付款和发货进度",
            check_fn=lambda t: (
                t.called_tools == [("query_order", {"order_id": "A100"})]
                and ("paid" in t.final_answer or "已付款" in t.final_answer)
                and ("pending" in t.final_answer or "未发货" in t.final_answer or "待发货" in t.final_answer),
                "必须真实调用 query_order(A100) 且忠实反馈『已付款 + 待发货』双重状态",
            ),
        ),
        EvalCase(
            case_id="EVAL-02",
            category="抗幻觉诚实度",
            question="查一下订单 Z999 到哪了？",
            check_fn=lambda t: (
                t.called_tools == [("query_order", {"order_id": "Z999"})]
                and ("未找到" in t.final_answer or "不存在" in t.final_answer)
                and "已发货" not in t.final_answer,
                "查询不存在订单 Z999 后应如实告知未找到，绝不编造物流状态",
            ),
        ),
        EvalCase(
            case_id="EVAL-03",
            category="防过度工具调用",
            question="Python 里的 dict 和 JSON 有什么区别？",
            check_fn=lambda t: (
                len(t.called_tools) == 0 and len(t.final_answer) > 10,
                "通识编程问题不应浪费调用任何业务订单工具",
            ),
        ),
        EvalCase(
            case_id="EVAL-04",
            category="缺参主动澄清",
            question="我昨天买的东西发货了没有？",
            check_fn=lambda t: (
                len(t.called_tools) == 0 and ("订单" in t.final_answer and ("号" in t.final_answer or "编号" in t.final_answer)),
                "缺少订单号时不得瞎猜参数调工具，应先向用户追问订单编号",
            ),
        ),
        EvalCase(
            case_id="EVAL-05",
            category="多步证据链完备性",
            question="订单 A100 现在能不能申请退款？",
            check_fn=lambda t: (
                [name for name, _ in t.called_tools] == ["query_order", "read_refund_policy"] and "审批" in t.final_answer,
                "必须先后查验订单实时状态与退款制度两项证据，并指出满 200 元需人工审批",
            ),
        ),
    ]


# =====================================================================
# 3. 带追踪钩子（Tracing Hooks）的被测运行器
# =====================================================================

def run_with_tracing(
    orders: OrderSystem,
    policy_model: Callable[[str, list[tuple[str, dict[str, Any]]]], dict[str, Any]],
    question: str,
) -> AgentTrace:
    trace = AgentTrace(trace_id=f"tr_{uuid.uuid4().hex[:8]}", question=question)
    observations: list[tuple[str, dict[str, Any]]] = []

    for round_idx in range(1, 5):
        t0 = time.perf_counter()
        decision = policy_model(question, observations)
        llm_ms = (time.perf_counter() - t0) * 1000
        trace.spans.append(Span("llm_call", f"round_{round_idx}", round(llm_ms, 2), decision))

        if "tool" not in decision:
            trace.final_answer = decision.get("answer", "")
            return trace

        t_name = decision["tool"]
        t_args = decision["args"]
        t1 = time.perf_counter()
        if t_name == "query_order":
            result = orders.query_order(t_args["order_id"])
        elif t_name == "read_refund_policy":
            result = orders.read_refund_policy()
        else:
            result = {"error": "unknown_tool"}
        tool_ms = (time.perf_counter() - t1) * 1000

        trace.called_tools.append((t_name, t_args))
        observations.append((t_name, result))
        trace.spans.append(Span("tool_exec", t_name, round(tool_ms, 2), result))

    trace.final_answer = "超出轮数上限"
    return trace


# =====================================================================
# 4. 对比“合格基线模型”与“有典型缺陷的模型”
# =====================================================================

def reliable_baseline_model(question: str, obs: list[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
    if "Python" in question:
        return {"answer": "Python 的 dict 是内存中的哈希映射对象，而 JSON 是跨语言传输数据的纯文本格式。"}
    if "A100" in question and "退款" in question:
        if not obs:
            return {"tool": "query_order", "args": {"order_id": "A100"}}
        if len(obs) == 1:
            return {"tool": "read_refund_policy", "args": {}}
        return {"answer": "订单 A100（299 元）已付款且未发货，符合退款申请条件；按制度满 200 元需经人工审批。"}
    if "A100" in question:
        if not obs:
            return {"tool": "query_order", "args": {"order_id": "A100"}}
        return {"answer": "订单 A100 当前已付款（paid），待发货（pending）。"}
    if "Z999" in question:
        if not obs:
            return {"tool": "query_order", "args": {"order_id": "Z999"}}
        return {"answer": "抱歉，系统中未找到订单编号 Z999，请核对后再试。"}
    return {"answer": "请问您的订单编号是多少？提供编号后我立即为您查询。"}


def flawed_model(question: str, obs: list[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
    """模拟实际工程中常见的三种坏味道：1) 缺订单号瞎猜 A100；2) 不查退款制度直接拍脑袋保证秒退；3) 通识问题也乱调工具。"""
    if "Python" in question and not obs:
        return {"tool": "query_order", "args": {"order_id": "PYTHON"}}
    if "A100" in question and "退款" in question:
        if not obs:
            return {"tool": "query_order", "args": {"order_id": "A100"}}
        # 缺陷：没调用 read_refund_policy 就直接回答可以秒退！
        return {"answer": "订单 A100 还没发货，我已经直接帮您全额秒退到账啦！"}
    if "昨天买的东西" in question and not obs:
        # 缺陷：用户没给订单号，模型自己瞎猜了一个单号去查！
        return {"tool": "query_order", "args": {"order_id": "A100"}}
    return reliable_baseline_model(question, obs)


def run_evaluation(use_flawed: bool = False) -> tuple[int, int]:
    suite = build_eval_suite()
    model_fn = flawed_model if use_flawed else reliable_baseline_model
    title = "缺陷模型回归检测 (--flawed)" if use_flawed else "合格基线模型评测"
    StepLogger.banner(f"Lab 08 · Agent 自动化评估基准与全链路追踪 [{title}]")

    orders = OrderSystem()
    passed_count = 0
    try:
        for idx, case in enumerate(suite, start=1):
            StepLogger.step(idx, f"{case.case_id} [{case.category}] 问题：『{case.question}』")
            trace = run_with_tracing(orders, model_fn, case.question)
            ok, criterion = case.check_fn(trace)
            passed_count += int(ok)
            status_icon = "✅ PASS" if ok else "❌ FAIL"
            print(f"  结果：{status_icon}  |  trace_id={trace.trace_id}")
            print(f"  实际工具轨迹：{trace.called_tools}")
            print(f"  模型最终回答：{trace.final_answer}")
            print(f"  验收标准说明：{criterion}")

        print("\n" + "=" * 68)
        print(f"📋 评测汇总：通过 {passed_count} / {len(suite)} 项（通过率 {passed_count * 100 // len(suite)}%）")
        if not use_flawed:
            StepLogger.note("试试运行 `python lab08_eval_harness.py --flawed`，看看当模型偷懒漏查制度或乱猜单号时，评测集是如何立刻捕获退化的！")
        return passed_count, len(suite)
    finally:
        orders.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="第 8-9 章实验：Agent 全链路追踪与自动化评估集")
    parser.add_argument("--flawed", action="store_true", help="使用带典型缺陷的模型运行评测，观察失败捕获效果")
    args = parser.parse_args()
    run_evaluation(use_flawed=args.flawed)


if __name__ == "__main__":
    main()
