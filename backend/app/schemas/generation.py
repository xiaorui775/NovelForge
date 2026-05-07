from typing import Optional
import uuid

from pydantic import BaseModel, Field


class BatchGenerateRequest(BaseModel):
    model_id: uuid.UUID
    chapter_outline_ids: list[uuid.UUID] = Field(..., max_length=20)
    max_tokens: Optional[int] = None


class QueueItemResponse(BaseModel):
    id: str
    chapter_outline_id: uuid.UUID
    chapter_number: int
    title: Optional[str]
    status: str  # pending, generating, completed, failed
    word_count: Optional[int] = None
    error: Optional[str] = None
