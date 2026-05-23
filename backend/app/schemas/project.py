from typing import Optional
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., max_length=200)
    genre: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = None
    language: str = Field(default="zh-CN", max_length=20)
    target_words_per_chapter_min: int = Field(default=3000, ge=100)
    target_words_per_chapter_max: int = Field(default=5000, ge=100)
    worldview_id: Optional[uuid.UUID] = None
    series_id: Optional[uuid.UUID] = None
    style_reference: Optional[str] = None
    dialogue_ratio: Decimal = Field(default=0.40, ge=0, le=1)
    tags: list[str] = Field(default_factory=list, max_length=20)


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    genre: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = None
    language: Optional[str] = Field(default=None, max_length=20)
    target_words_per_chapter_min: Optional[int] = Field(default=None, ge=100)
    target_words_per_chapter_max: Optional[int] = Field(default=None, ge=100)
    worldview_id: Optional[uuid.UUID] = None
    series_id: Optional[uuid.UUID] = None
    style_reference: Optional[str] = None
    dialogue_ratio: Optional[Decimal] = Field(default=None, ge=0, le=1)
    status: Optional[str] = None
    tags: Optional[list[str]] = Field(default=None, max_length=20)


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    genre: Optional[str]
    description: Optional[str]
    language: str
    target_words_per_chapter_min: int
    target_words_per_chapter_max: int
    worldview_id: Optional[uuid.UUID]
    series_id: Optional[uuid.UUID] = None
    sort_order_in_series: int = 1
    cover_image: Optional[str]
    status: str
    style_reference: Optional[str]
    dialogue_ratio: Decimal
    tags: list[str] = Field(default_factory=list)
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectStatsResponse(BaseModel):
    total_chapters: int
    completed_chapters: int
    total_words: int
    progress_percent: float
