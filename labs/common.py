"""Agent 工程实验室 · 公共基础设施模块 (common.py)

本模块提供所有分步实验共享的三项基础能力（仅依赖 Python 3.11+ 标准库）：
1. StepLogger：在终端清晰打印“第几步、发了什么报文、返回了什么结果”，方便分步观察。
2. OrderSystem：基于内存 SQLite 的模拟电商订单与制度服务（代表企业里已有的确定性后端服务）。
3. LLMClient：支持 OpenAI Chat Completions / Responses / Anthropic Messages 的轻量 HTTPS 客户端。
"""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request


class StepLogger:
    """教学用的终端分步输出工具，帮助看清每一步的数据流向。"""

    @staticmethod
    def banner(title: str) -> None:
        line = "=" * 68
        print(f"\n{line}\n  {title}\n{line}")

    @staticmethod
    def step(num: int | str, title: str) -> None:
        print(f"\n[Step {num}] {title}")
        print("-" * 56)

    @staticmethod
    def json_box(label: str, payload: Any) -> None:
        print(f"▸ {label}:")
        formatted = json.dumps(payload, ensure_ascii=False, indent=2)
        for line in formatted.splitlines():
            print(f"  {line}")

    @staticmethod
    def note(text: str) -> None:
        print(f"💡 教学提示：{text}")


class OrderSystem:
    """模拟企业现有的确定性业务服务（基于内存 SQLite）。

    预置两笔虚构订单和三份企业制度文档，全部操作均为本地安全数据，不涉及任何真实资金。
    """

    def __init__(self) -> None:
        self.db = sqlite3.connect(":memory:")
        self._init_data()

    def _init_data(self) -> None:
        self.db.executescript(
            """
            CREATE TABLE orders (
                order_id TEXT PRIMARY KEY,
                customer TEXT NOT NULL,
                amount_yuan INTEGER NOT NULL,
                payment_status TEXT NOT NULL,
                shipping_status TEXT NOT NULL
            );
            INSERT INTO orders VALUES
                ('A100', '张三', 299, 'paid', 'pending'),
                ('B200', '李四', 599, 'paid', 'shipped'),
                ('C300', '王五', 129, 'unpaid', 'pending');

            CREATE TABLE policies (
                doc_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL
            );
            INSERT INTO policies VALUES
                ('P1', '退款管理制度', '已付款（paid）且未发货（pending）的订单可提交退款申请，金额满 200 元须经人工审批后方可执行打款；已发货（shipped）订单需先办理退货入库。'),
                ('P2', '物流时效制度', '普通订单付款后 24 小时内发货；大促期间 48 小时内发货。发货后可通过快递单号查询轨迹。'),
                ('P3', '生产发布制度', '核心交易服务上线前必须通过自动化回归测试、安全扫描并获得技术负责人审批单。');
            """
        )

    def query_order(self, order_id: str) -> dict[str, Any]:
        """确定性业务查询：根据订单号返回实时付款与发货状态。"""
        row = self.db.execute(
            "SELECT order_id, customer, amount_yuan, payment_status, shipping_status "
            "FROM orders WHERE order_id = ?",
            (order_id,),
        ).fetchone()
        if row is None:
            return {
                "found": False,
                "order_id": order_id,
                "message": "未找到该订单编号，请核对输入。",
            }
        return {
            "found": True,
            "order_id": row[0],
            "customer": row[1],
            "amount_yuan": row[2],
            "payment_status": row[3],
            "shipping_status": row[4],
        }

    def read_refund_policy(self) -> dict[str, Any]:
        """读取公司现行退款制度。"""
        row = self.db.execute(
            "SELECT doc_id, title, content FROM policies WHERE doc_id = 'P1'"
        ).fetchone()
        return {"doc_id": row[0], "title": row[1], "policy": row[2]}

    def list_policies(self) -> list[tuple[str, str, str]]:
        """返回全部制度文档列表：(doc_id, title, content)。"""
        return list(
            self.db.execute("SELECT doc_id, title, content FROM policies ORDER BY doc_id")
        )

    def close(self) -> None:
        self.db.close()


class _NoRedirectHandler(request.HTTPRedirectHandler):
    """安全防护：禁止 HTTP 重定向自动携带 Authorization / API Key 头跳转到外部未知域名。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        return None


@dataclass(frozen=True)
class APIConfig:
    """大模型接口连接配置（全部从环境变量读取，绝不硬编码密钥）。"""

    api_format: str  # "chat" | "responses" | "messages"
    base_url: str
    api_key: str
    model: str
    legacy_max_tokens: bool = False

    @classmethod
    def from_env(cls, require_key: bool = True) -> "APIConfig | None":
        fmt = os.getenv("AGENT_API_FORMAT", "chat").strip().lower()
        if fmt not in {"chat", "responses", "messages"}:
            raise ValueError("AGENT_API_FORMAT 必须是 chat、responses 或 messages 之一")
        key = os.getenv("AGENT_API_KEY", "").strip()
        model = os.getenv("AGENT_MODEL", "").strip()
        default_base = (
            "https://api.anthropic.com/v1" if fmt == "messages" else "https://api.openai.com/v1"
        )
        base = os.getenv("AGENT_BASE_URL", default_base).strip()
        legacy = os.getenv("AGENT_CHAT_LEGACY_MAX_TOKENS", "0").strip() == "1"

        if not key or not model:
            if require_key:
                raise SystemExit(
                    "\n⚠️  尚未配置真实大模型环境变量（AGENT_API_KEY 与 AGENT_MODEL）。\n"
                    "  👉 零配置直接开始学习：在刚才的命令末尾加上 --mock 即可观察完整离线协议交互！\n"
                    "  👉 连接真实大模型实测：打开 docs/start.html 复制环境变量配置命令后再运行。"
                )
            return None
        return cls(
            api_format=fmt,
            base_url=base,
            api_key=key,
            model=model,
            legacy_max_tokens=legacy,
        )


def post_json(base_url: str, path: str, api_key: str, api_format: str, body: dict[str, Any]) -> dict[str, Any]:
    """向大模型服务端发送标准 HTTPS JSON 请求（无任何第三方 SDK 黑盒封装）。"""
    url = base_url.rstrip("/") + path
    parsed = parse.urlsplit(url)

    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("安全检查未通过：API 基础地址不能内嵌账号密码、查询参数或锚点")

    is_local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not is_local_http:
        raise ValueError("安全检查未通过：远程大模型接口必须使用 HTTPS 协议")

    headers = {"Content-Type": "application/json"}
    if api_format == "messages":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
    else:
        headers["Authorization"] = f"Bearer {api_key}"

    raw_payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = request.Request(url, data=raw_payload, headers=headers, method="POST")

    try:
        opener = request.build_opener(_NoRedirectHandler())
        with opener.open(req, timeout=40) as resp:
            max_bytes = 4 * 1024 * 1024
            data = resp.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise RuntimeError("响应体积超过 4MB 安全上限")
            return json.loads(data.decode("utf-8"))
    except error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read(512).decode("utf-8", errors="replace")
        except Exception:
            pass
        raise RuntimeError(
            f"HTTP {exc.code} 请求失败：请检查 API 地址、模型名称、权限或配额。"
            + (f" 服务端提示：{detail}" if detail else "")
        ) from None
    except error.URLError as exc:
        raise RuntimeError(f"网络连接失败（{exc.reason}）：请检查网络、DNS 或本地代理设置") from None
