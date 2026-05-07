from typing import Optional
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ModelConfigCreate(BaseModel):
    name: str = Field(..., max_length=100)
    provider: str = Field(default="openai", max_length=50)
    base_url: str = Field(..., max_length=500)
    api_key: str
    model_name: str = Field(..., max_length=100)
    model_type: str = Field(default="chat", max_length=20)
    input_cost_per_1k: Decimal = Field(default=0, ge=0)
    output_cost_per_1k: Decimal = Field(default=0, ge=0)
    max_tokens: int = Field(default=4096, ge=1)
    max_context_tokens: int = Field(default=8192, ge=1024)


class ModelConfigUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    provider: Optional[str] = Field(default=None, max_length=50)
    base_url: Optional[str] = Field(default=None, max_length=500)
    api_key: Optional[str] = None
    model_name: Optional[str] = Field(default=None, max_length=100)
    model_type: Optional[str] = Field(default=None, max_length=20)
    input_cost_per_1k: Optional[Decimal] = Field(default=None, ge=0)
    output_cost_per_1k: Optional[Decimal] = Field(default=None, ge=0)
    max_tokens: Optional[int] = Field(default=None, ge=1)
    max_context_tokens: Optional[int] = Field(default=None, ge=1024)
    is_active: Optional[bool] = None


class ModelConfigResponse(BaseModel):
    id: uuid.UUID
    name: str
    provider: str
    base_url: str
    model_name: str
    model_type: str
    input_cost_per_1k: Decimal
    output_cost_per_1k: Decimal
    max_tokens: int
    max_context_tokens: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModelTestResponse(BaseModel):
    success: bool
    message: str
    latency_ms: Optional[int] = None
