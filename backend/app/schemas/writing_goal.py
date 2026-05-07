from typing import Optional
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class WritingGoalCreate(BaseModel):
    type: str = Field(default="daily_words", pattern=r"^(daily_words|weekly_chapters|deadline)$")
    target: int = Field(..., gt=0)
    start_date: date
    end_date: date
    notes: str = ""


class WritingGoalUpdate(BaseModel):
    type: Optional[str] = Field(default=None, pattern=r"^(daily_words|weekly_chapters|deadline)$")
    target: Optional[int] = Field(default=None, gt=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None


class WritingGoalResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    type: str
    target: int
    start_date: date
    end_date: date
    notes: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WritingGoalProgress(BaseModel):
    goal: WritingGoalResponse
    current: int
    target: int
    progress_percent: float
    consecutive_days: int
    total_days: int
    days_remaining: int


class CalendarGoalMark(BaseModel):
    date: str
    words: int
    target: int
    achieved: bool
    missed: bool


class TodayGoalProgress(BaseModel):
    goal_id: uuid.UUID
    goal_type: str
    target: int
    current: int
    achieved: bool


class ProjectGoalsProgress(BaseModel):
    project_id: uuid.UUID
    today: str
    today_goal: Optional[TodayGoalProgress] = None
    streak_days: int
    calendar_marks: list[CalendarGoalMark]

