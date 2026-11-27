"""公共基础模块 (common.py) —— 极简、直白、仅依赖 Python 3.11+ 标准库。

只做三件事：
1. OrderSystem：内存 SQLite 模拟订单与制度数据库（代表公司现有的业务后端）。
2. call_llm / call_embedding：读取环境变量，直接发 HTTP/HTTPS 请求调用真实大模型（不限制 http/https）。
3. show：在终端清晰打印每一步的 JSON 报文。
"""

from __future__ import annotations

import json
import os
import sqlite3
from typing import Any
from urllib import error, request


def show(title: str, data: Any) -> None:
    """在终端清晰打印标题和中文可读的 JSON。"""
    print(f"\n▸ {title}:")
    if isinstance(data, str):
        print(f"  {data}")
    else:
        for line in json.dumps(data, ensure_ascii=False, indent=2).splitlines():
            print(f"  {line}")


def step_title(num: int | str, text: str) -> None:
    print(f"\n[Step {num}] {text}")
    print("-" * 56)


class OrderSystem:
    """模拟企业现有的订单与制度数据库（内存 SQLite，全部为虚构安全数据）。"""

    def __init__(self) -> None:
        self.db = sqlite3.connect(":memory:")
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
        row = self.db.execute(
            "SELECT order_id, customer, amount_yuan, payment_status, shipping_status "
            "FROM orders WHERE order_id = ?",
            (order_id,),
        ).fetchone()
        if row is None:
            return {"found": False, "order_id": order_id, "message": "未找到该订单编号"}
        return {
            "found": True,
            "order_id": row[0],
            "customer": row[1],
            "amount_yuan": row[2],
            "payment_status": row[3],
            "shipping_status": row[4],
        }

    def read_refund_policy(self) -> dict[str, Any]:
        row = self.db.execute("SELECT doc_id, title, content FROM policies WHERE doc_id = 'P1'").fetchone()
        return {"doc_id": row[0], "title": row[1], "policy": row[2]}

    def list_policies(self) -> list[tuple[str, str, str]]:
        return list(self.db.execute("SELECT doc_id, title, content FROM policies ORDER BY doc_id"))

    def close(self) -> None:
        self.db.close()


def _get_env_config() -> tuple[str, str, str]:
    base_url = os.getenv("AGENT_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
    api_key = os.getenv("AGENT_API_KEY", "").strip()
    model = os.getenv("AGENT_MODEL", "").strip()
    if not api_key or not model:
        raise SystemExit(
            "\n⚠️  请先在终端设置环境变量 AGENT_BASE_URL、AGENT_MODEL 和 AGENT_API_KEY：\n"
            '  PowerShell 示例：\n'
            '    $env:AGENT_BASE_URL = "http://你的地址/v1"   # 支持 http 或 https\n'
            '    $env:AGENT_MODEL    = "你的模型名"\n'
            '    $env:AGENT_API_KEY  = "你的API_KEY"\n'
        )
    return base_url, api_key, model


def post_json(url: str, api_key: str, body: dict[str, Any]) -> dict[str, Any]:
    """直接发送 JSON POST 请求，支持任意 http:// 或 https:// 地址。"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = request.Request(url, data=raw, headers=headers, method="POST")
    try:
        with request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read(512).decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} 请求失败：{detail}") from None
    except error.URLError as exc:
        raise RuntimeError(f"网络连接失败（{exc.reason}），请检查 AGENT_BASE_URL 是否可达") from None


def call_llm(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | None = None,
) -> dict[str, Any]:
    """调用真实大模型 /chat/completions 接口，返回完整响应 JSON。"""
    base_url, api_key, model = _get_env_config()
    token_field = "max_tokens" if os.getenv("AGENT_CHAT_LEGACY_MAX_TOKENS") == "1" else "max_completion_tokens"

    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        token_field: 1024,
    }
    if tools is not None:
        body["tools"] = tools
        if tool_choice is not None:
            body["tool_choice"] = tool_choice

    return post_json(f"{base_url}/chat/completions", api_key, body)


def call_embedding(texts: list[str], embed_model: str) -> list[list[float]]:
    """调用真实 /embeddings 接口，将多段文本转为向量列表。"""
    base_url, api_key, _ = _get_env_config()
    resp = post_json(f"{base_url}/embeddings", api_key, {"model": embed_model, "input": texts})
    ordered = sorted(resp["data"], key=lambda item: item["index"])
    return [item["embedding"] for item in ordered]
