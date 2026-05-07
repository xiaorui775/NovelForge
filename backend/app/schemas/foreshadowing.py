import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ForeshadowingCreate(BaseModel):
    description: str
    plant_chapter_id: Optional[uuid.UUID] = None
    resolution_chapter_id: Optional[uuid.UUID] = None
    status: str = "open"
    notes: Optional[str] = None


class ForeshadowingUpdate(BaseModel):
    description: Optional[str] = None
    plant_chapter_id: Optional[uuid.UUID] = None
    resolution_chapter_id: Optional[uuid.UUID] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ForeshadowingResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    description: str
    plant_chapter_id: Optional[uuid.UUID] = None
    resolution_chapter_id: Optional[uuid.UUID] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ForeshadowingScanRequest(BaseModel):
    model_id: uuid.UUID


class ForeshadowingScanResult(BaseModel):
    description: str
    plant_chapter_number: int
    confidence: float
