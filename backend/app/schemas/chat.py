from typing import Optional
import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=10000)
    model_id: uuid.UUID
    referenced_chapter_id: Optional[uuid.UUID] = None
    referenced_text: Optional[str] = None
    context_mode: str = "full"  # full, chapter, selection


class ChatMessageResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    project_id: uuid.UUID
    role: str
    content: str
    model_id: Optional[uuid.UUID] = None
    token_used: int
    referenced_chapter_id: Optional[uuid.UUID] = None
    referenced_text: Optional[str] = None
    context_mode: Optional[str] = None
    suggested_action: Optional[str] = None
    created_at: datetime


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessageResponse]
