from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel


class CoverImageGenerate(BaseModel):
    prompt: str
    model_id: uuid.UUID
    size: str = "1024x1024"
    quality: str = "standard"
    style: Optional[str] = None


class CoverImageResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    image_url: str
    prompt: str
    revised_prompt: Optional[str] = None
    model_id: Optional[uuid.UUID] = None
    style: Optional[str] = None
    is_selected: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CoverImageList(BaseModel):
    items: list[CoverImageResponse]
