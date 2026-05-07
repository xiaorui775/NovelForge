import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class SceneCreate(BaseModel):
    scene_number: int
    location: Optional[str] = ""
    time: Optional[str] = ""
    pov_character_id: Optional[uuid.UUID] = None
    summary: Optional[str] = ""
    mood: Optional[str] = ""
    notes: Optional[str] = ""


class SceneUpdate(BaseModel):
    scene_number: Optional[int] = None
    location: Optional[str] = None
    time: Optional[str] = None
    pov_character_id: Optional[uuid.UUID] = None
    summary: Optional[str] = None
    mood: Optional[str] = None
    notes: Optional[str] = None


class SceneResponse(BaseModel):
    id: uuid.UUID
    chapter_id: uuid.UUID
    scene_number: int
    location: str
    time: str
    pov_character_id: Optional[uuid.UUID]
    summary: str
    mood: str
    notes: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
