from typing import Optional
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ChapterResponse(BaseModel):
    id: uuid.UUID
    chapter_outline_id: uuid.UUID
    content: Optional[str]
    content_summary: Optional[str] = None
    word_count: int
    model_id: Optional[uuid.UUID]
    token_used: int
    cost: Decimal
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChapterUpdate(BaseModel):
    content: str
    auto_save: bool = False


class ChapterGenerateRequest(BaseModel):
    model_id: uuid.UUID
    max_tokens: Optional[int] = None
    template_id: Optional[uuid.UUID] = None
    auto_score: bool = False
    score_threshold: float = Field(default=6.0, ge=0, le=10)
    multi_round: bool = False
    auto_revise: bool = False


class ChapterVersionResponse(BaseModel):
    id: uuid.UUID
    chapter_id: uuid.UUID
    version_number: int
    content: str
    word_count: int
    model_id: Optional[uuid.UUID]
    token_used: int
    quality_score: Optional[Decimal]
    change_type: str
    diff_snapshot: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class QualityScoreRequest(BaseModel):
    model_id: uuid.UUID


class QualityScoreResponse(BaseModel):
    coherence: float
    writing_quality: float
    plot_progression: float
    overall: float
    notes: str


class CostEstimateRequest(BaseModel):
    model_id: uuid.UUID
    template_id: Optional[uuid.UUID] = None


class CostEstimateResponse(BaseModel):
    estimated_input_tokens: int
    estimated_output_tokens: int
    estimated_cost: float


class ConsistencyIssue(BaseModel):
    dimension: str
    severity: str
    description: str
    location: Optional[str] = None
    suggestion: Optional[str] = None


class ConsistencyCheckResponse(BaseModel):
    overall_score: float
    issues: list[ConsistencyIssue]
    summary: str


class SelectionRewriteRequest(BaseModel):
    model_id: uuid.UUID
    selected_text: str = Field(..., min_length=1, max_length=5000)
    instruction: str = Field(..., min_length=1, max_length=500)
    context_before: str = ""
    context_after: str = ""


class ChapterRefineRequest(BaseModel):
    model_id: uuid.UUID
    draft_text: str = Field(..., min_length=50, max_length=120000)
    max_suggestions: int = Field(default=10, ge=1, le=20)


class ChapterBrainstormRequest(BaseModel):
    model_id: uuid.UUID
    selected_direction: Optional[str] = None


class BrainstormDirection(BaseModel):
    title: str
    summary: str
    why_it_works: str


class ChapterBrainstormResponse(BaseModel):
    directions: list[BrainstormDirection]
    transition_text: Optional[str] = None
