from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.cost_budget import (
    BudgetCheckResponse,
    CostBudgetResponse,
    CostBudgetUpdate,
    UsageHistoryItem,
)
from app.services.cost_budget_service import CostBudgetService

router = APIRouter(prefix="/cost-budget", tags=["cost-budget"])


def get_service(db: AsyncSession = Depends(get_db)) -> CostBudgetService:
    return CostBudgetService(db)


@router.get("", response_model=CostBudgetResponse)
async def get_current_budget(
    service: CostBudgetService = Depends(get_service),
):
    return await service.get_or_create_current_budget()


@router.put("", response_model=CostBudgetResponse)
async def update_budget(
    data: CostBudgetUpdate,
    service: CostBudgetService = Depends(get_service),
):
    budget = await service.get_or_create_current_budget()
    return await service.update_budget(budget.month, data)


@router.get("/check", response_model=BudgetCheckResponse)
async def check_budget(
    service: CostBudgetService = Depends(get_service),
):
    return await service.check_budget()


@router.get("/history", response_model=list[UsageHistoryItem])
async def get_usage_history(
    months: int = Query(default=6, ge=1, le=24),
    service: CostBudgetService = Depends(get_service),
):
    return await service.get_usage_history(months)
