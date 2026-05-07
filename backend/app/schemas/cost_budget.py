from typing import Optional
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CostBudgetCreate(BaseModel):
    monthly_limit: Decimal = Field(..., ge=0)


class CostBudgetUpdate(BaseModel):
    monthly_limit: Optional[Decimal] = Field(default=None, ge=0)


class CostBudgetResponse(BaseModel):
    id: uuid.UUID
    monthly_limit: float
    current_usage: float
    month: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BudgetCheckResponse(BaseModel):
    allowed: bool
    remaining: float
    limit: float
    usage: float


class UsageHistoryItem(BaseModel):
    month: str
    usage: float
    limit: float
