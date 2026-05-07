from typing import Optional
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TerminologyCreate(BaseModel):
    term: str = Field(..., max_length=100)
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None


class TerminologyUpdate(BaseModel):
    term: Optional[str] = Field(default=None, max_length=100)
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = None


class TerminologyResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    term: str
    category: Optional[str]
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
