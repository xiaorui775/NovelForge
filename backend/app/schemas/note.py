from typing import Optional
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str = Field(..., max_length=200)
    content: str = ""
    category: str = Field(default="general", max_length=50)


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    content: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=50)


class NoteResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    content: str
    category: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
