from typing import Optional
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class StoryBibleCreate(BaseModel):
    category: str = Field(default="custom", max_length=50)
    title: str = Field(..., max_length=200)
    content: str = ""
    tags: str = ""


class StoryBibleUpdate(BaseModel):
    category: Optional[str] = Field(default=None, max_length=50)
    title: Optional[str] = Field(default=None, max_length=200)
    content: Optional[str] = None
    tags: Optional[str] = None


class StoryBibleResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    category: str
    title: str
    content: str
    tags: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
