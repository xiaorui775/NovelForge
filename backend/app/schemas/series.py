import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SeriesCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    project_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)


class SeriesUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None


class SeriesProjectReorder(BaseModel):
    project_ids: list[uuid.UUID]


class SeriesProjectItem(BaseModel):
    id: uuid.UUID
    name: str
    genre: Optional[str]
    status: str
    sort_order: int
    cover_image: Optional[str]

    model_config = {"from_attributes": True}


class SeriesResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    projects: list[SeriesProjectItem] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
