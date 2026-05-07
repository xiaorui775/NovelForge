from typing import Optional
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class OutlineCreate(BaseModel):
    total_chapters: int = Field(..., ge=1)
    synopsis: Optional[str] = None


class OutlineUpdate(BaseModel):
    total_chapters: Optional[int] = Field(default=None, ge=1)
    synopsis: Optional[str] = None


class OutlineResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    total_chapters: int
    synopsis: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChapterOutlineCreate(BaseModel):
    chapter_number: int = Field(..., ge=1)
    title: Optional[str] = Field(default=None, max_length=200)
    summary: str
    sort_order: int = Field(..., ge=0)


class ChapterOutlineUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    summary: Optional[str] = None
    detail_outline: Optional[str] = None
    chapter_memo: Optional[str] = None
    sort_order: Optional[int] = Field(default=None, ge=0)


class ChapterOutlineResponse(BaseModel):
    id: uuid.UUID
    outline_id: uuid.UUID
    chapter_number: int
    title: Optional[str]
    summary: str
    detail_outline: Optional[str]
    chapter_memo: Optional[str] = None
    content_summary: Optional[str] = None
    sort_order: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChapterOutlineReorder(BaseModel):
    id: uuid.UUID
    sort_order: int = Field(..., ge=0)


class ReverseOutlineItem(BaseModel):
    chapter_number: int
    title: str
    planned_summary: Optional[str] = None
    actual_summary: Optional[str] = None
    word_count: int = 0
    status: str  # "matched", "drifted", "missing", "extra"
    notes: Optional[str] = None


class ReverseOutlineResponse(BaseModel):
    items: list[ReverseOutlineItem]
    overall_assessment: str
    match_rate: float  # 0-100
