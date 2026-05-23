from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generation import CostBudget
from app.schemas.cost_budget import CostBudgetCreate, CostBudgetUpdate


class CostBudgetService:
    # 常见模型默认价格 (USD per 1K tokens)
    DEFAULT_PRICING = {
        "gpt-4": {"input": 0.03, "output": 0.06},
        "gpt-4-turbo": {"input": 0.01, "output": 0.03},
        "gpt-4o": {"input": 0.005, "output": 0.015},
        "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
        "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
        "o1-mini": {"input": 0.003, "output": 0.012},
        "o1-preview": {"input": 0.015, "output": 0.06},
        "claude-3-opus": {"input": 0.015, "output": 0.075},
        "claude-3-sonnet": {"input": 0.003, "output": 0.015},
        "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
        "deepseek-chat": {"input": 0.00014, "output": 0.00028},
        "deepseek-coder": {"input": 0.00014, "output": 0.00028},
        "glm-4": {"input": 0.014, "output": 0.014},
        "moonshot-v1-8k": {"input": 0.012, "output": 0.012},
        "qwen-turbo": {"input": 0.0003, "output": 0.0006},
        "qwen-plus": {"input": 0.004, "output": 0.012},
        "qwen-max": {"input": 0.016, "output": 0.064},
    }

    @staticmethod
    def get_effective_rates(model_config) -> tuple[float, float]:
        """获取有效的输入/输出价格，如果配置为 0 则使用默认价格"""
        input_rate = float(model_config.input_cost_per_1k)
        output_rate = float(model_config.output_cost_per_1k)
        if input_rate > 0 and output_rate > 0:
            return input_rate, output_rate
        name = (model_config.model_name or "").lower()
        for key, pricing in CostBudgetService.DEFAULT_PRICING.items():
            if key in name:
                return pricing["input"], pricing["output"]
        return input_rate or 0.002, output_rate or 0.006

    @staticmethod
    def calculate_cost(model_config, input_tokens: int, output_tokens: int) -> float:
        """计算单次 AI 调用的费用"""
        input_rate, output_rate = CostBudgetService.get_effective_rates(model_config)
        return input_rate * input_tokens / 1000 + output_rate * output_tokens / 1000

    async def calculate_and_record(self, model_config, input_tokens: int, output_tokens: int) -> float:
        """计算费用并记录到预算"""
        cost = self.calculate_cost(model_config, input_tokens, output_tokens)
        cost = round(cost, 6)
        await self.record_cost(Decimal(str(cost)))
        return cost
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
