from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generation import CostBudget
from app.schemas.cost_budget import CostBudgetCreate, CostBudgetUpdate


class CostBudgetService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _current_month(self) -> str:
        return datetime.now().strftime("%Y-%m")

    async def get_or_create_current_budget(self) -> CostBudget:
        month = self._current_month()
        result = await self.db.execute(
            select(CostBudget).where(CostBudget.month == month)
        )
        budget = result.scalar_one_or_none()
        if not budget:
            budget = CostBudget(month=month, monthly_limit=Decimal("100.00"), current_usage=Decimal("0"))
            self.db.add(budget)
            await self.db.flush()
            await self.db.refresh(budget)
        return budget

    async def get_budget(self, month: str) -> Optional[CostBudget]:
        result = await self.db.execute(
            select(CostBudget).where(CostBudget.month == month)
        )
        return result.scalar_one_or_none()

    async def update_budget(self, month: str, data: CostBudgetUpdate) -> Optional[CostBudget]:
        budget = await self.get_budget(month)
        if not budget:
            # Create if doesn't exist
            budget = CostBudget(month=month, monthly_limit=data.monthly_limit or Decimal("100.00"), current_usage=Decimal("0"))
            self.db.add(budget)
        else:
            if data.monthly_limit is not None:
                budget.monthly_limit = data.monthly_limit
        await self.db.flush()
        await self.db.refresh(budget)
        return budget

    async def check_budget(self) -> dict:
        """检查当月预算是否允许继续生成"""
        budget = await self.get_or_create_current_budget()
        remaining = budget.monthly_limit - budget.current_usage
        return {
            "allowed": remaining > 0,
            "remaining": max(Decimal("0"), remaining),
            "limit": budget.monthly_limit,
            "usage": budget.current_usage,
        }

    async def record_cost(self, amount: Decimal) -> None:
        """记录费用到当月预算（原子操作，避免并发竞态）"""
        month = self._current_month()
        # Ensure budget row exists
        await self.get_or_create_current_budget()
        # Atomic increment to avoid race condition
        await self.db.execute(
            update(CostBudget)
            .where(CostBudget.month == month)
            .values(current_usage=CostBudget.current_usage + amount)
        )
        await self.db.flush()

    async def get_usage_history(self, months: int = 6) -> list[dict]:
        """获取最近 N 个月的用量历史"""
        result = await self.db.execute(
            select(CostBudget).order_by(CostBudget.month.desc()).limit(months)
        )
        budgets = list(result.scalars().all())
        return [
            {
                "month": b.month,
                "usage": float(b.current_usage),
                "limit": float(b.monthly_limit),
            }
            for b in reversed(budgets)
        ]
