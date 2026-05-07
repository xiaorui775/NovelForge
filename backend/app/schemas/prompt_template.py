from typing import Optional
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PromptTemplateCreate(BaseModel):
    name: str = Field(..., max_length=100)
    type: str = Field(..., max_length=50)
    content: str
    is_default: bool = False


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    type: Optional[str] = Field(default=None, max_length=50)
    content: Optional[str] = None
    is_default: Optional[bool] = None


class PromptTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    content: str
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
