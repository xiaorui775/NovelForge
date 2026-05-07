import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AppearanceCreate(BaseModel):
    character_id: uuid.UUID
    chapter_outline_id: uuid.UUID
    role_in_chapter: str = Field(default="minor", max_length=50)
    notes: str = ""


class AppearanceUpdate(BaseModel):
    role_in_chapter: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None


class AppearanceResponse(BaseModel):
    id: uuid.UUID
    character_id: uuid.UUID
    chapter_outline_id: uuid.UUID
    role_in_chapter: str
    notes: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CharacterArcResponse(BaseModel):
    character_id: uuid.UUID
    character_name: str
    appearances: list[dict]
    total_chapters: int
    major_chapters: int
