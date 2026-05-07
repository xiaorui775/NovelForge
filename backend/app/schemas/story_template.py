import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class StoryTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    structure: dict
    genre_hint: str
    is_builtin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class StoryTemplateCreate(BaseModel):
    name: str
    description: str
    structure: dict
    genre_hint: Optional[str] = ""


class StoryTemplateApply(BaseModel):
    project_id: uuid.UUID
    template_id: uuid.UUID
    total_chapters: Optional[int] = None
    synopsis: Optional[str] = None
