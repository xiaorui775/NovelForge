from typing import Optional
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WorldviewCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    rules: Optional[str] = None


class WorldviewUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    rules: Optional[str] = None


class WorldviewResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    rules: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
