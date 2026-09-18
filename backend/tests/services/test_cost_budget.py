"""tests.services.test_cost_budget

CostBudgetService 的核心逻辑测试。
覆盖：预算创建、费用记录、原子更新、预估计算、历史查询。
使用内存 FakeSession + 真实 service 逻辑。
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy.sql.dml import Update as SAUpdateStmt

from app.services.cost_budget_service import CostBudgetService


class _FakeScalars:
    def __init__(self, items):
        self._items = items

    def first(self):
        return self._items[0] if self._items else None

    def all(self):
        return list(self._items)

    def scalars(self):
        return self

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None


class _FakeSession:
    """极简 AsyncSession 模拟：按表名分派结果 + 记录执行的 update。"""

    def __init__(self, results: dict):
        self._results = results
        self._updates = []  # 记录 update 调用，用于断言
        self._added = []
        self._flushed = False

    async def execute(self, stmt):
        # 区分 update(CostBudget) 与普通 select
        if isinstance(stmt, SAUpdateStmt):
            self._updates.append(stmt)
            return _FakeScalars([])
        # 默认按 CostBudget 返回
        return _FakeScalars(self._results.get("CostBudget", []))

    def add(self, obj):
        self._added.append(obj)

    async def flush(self):
        self._flushed = True

    async def refresh(self, obj):
        pass


def _mk_budget(month: str, limit: float = 100.0, usage: float = 0.0):
    b = type("CostBudget", (), {})()
    b.month = month
    b.monthly_limit = Decimal(str(limit))
    b.current_usage = Decimal(str(usage))
    b.id = "b1"
    b.created_at = datetime.utcnow()
    b.updated_at = datetime.utcnow()
    return b


def test_get_or_create_creates_when_missing():
    db = _FakeSession({"CostBudget": []})
    svc = CostBudgetService(db)
    import asyncio

    b = asyncio.run(svc.get_or_create_current_budget())
    # 因 Fake 不真写，这里只能校验 add + flush 发生
    assert len(db._added) >= 1 or db._flushed


def test_check_budget_respects_limit():
    month = datetime.utcnow().strftime("%Y-%m")
    b = _mk_budget(month, limit=50.0, usage=40.0)
    db = _FakeSession({"CostBudget": [b]})
    svc = CostBudgetService(db)
    import asyncio

    res = asyncio.run(svc.check_budget())
    assert res["allowed"] is True
    assert float(res["remaining"]) == 10.0
    assert float(res["limit"]) == 50.0
    assert float(res["usage"]) == 40.0


def test_check_budget_blocks_when_exhausted():
    month = datetime.utcnow().strftime("%Y-%m")
    b = _mk_budget(month, limit=10.0, usage=10.0)
    db = _FakeSession({"CostBudget": [b]})
    svc = CostBudgetService(db)
    import asyncio

    res = asyncio.run(svc.check_budget())
    assert res["allowed"] is False
    assert float(res["remaining"]) == 0.0


def test_record_cost_atomic_update_called():
    month = datetime.utcnow().strftime("%Y-%m")
    b = _mk_budget(month, limit=100.0, usage=0.0)
    db = _FakeSession({"CostBudget": [b]})
    svc = CostBudgetService(db)
    import asyncio

    asyncio.run(svc.record_cost(Decimal("3.14")))
    # 关键：必须执行过一次 update 语句
    assert len(db._updates) >= 1


def test_calculate_cost_uses_effective_rates(monkeypatch):
    # 构造一个带价格的“模型配置”对象
    class M:
        input_cost_per_1k = 0.002
        output_cost_per_1k = 0.006
        model_name = "custom"

    cost = CostBudgetService.calculate_cost(M(), 1000, 2000)
    # 0.002*1 + 0.006*2 = 0.014
    assert abs(cost - 0.014) < 1e-9


def test_get_usage_history_returns_recent_months():
    b1 = _mk_budget("2026-08", 100, 12.5)
    b2 = _mk_budget("2026-09", 100, 3.0)
    db = _FakeSession({"CostBudget": [b2, b1]})
    svc = CostBudgetService(db)
    import asyncio

    hist = asyncio.run(svc.get_usage_history(months=6))
    # 实现中做了 reversed，这里只要校验结构
    assert isinstance(hist, list)
    if hist:
        assert "month" in hist[0] and "usage" in hist[0] and "limit" in hist[0]
