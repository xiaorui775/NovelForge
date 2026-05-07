from typing import Optional
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select, func, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chapter import Chapter, ChapterVersion
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.models.writing_goal import WritingGoal
from app.schemas.writing_goal import WritingGoalCreate, WritingGoalUpdate


class WritingGoalService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_goals(self, project_id: uuid.UUID) -> list[WritingGoal]:
        result = await self.db.execute(
            select(WritingGoal)
            .where(WritingGoal.project_id == project_id)
            .order_by(WritingGoal.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_goal(self, goal_id: uuid.UUID) -> Optional[WritingGoal]:
        result = await self.db.execute(select(WritingGoal).where(WritingGoal.id == goal_id))
        return result.scalar_one_or_none()

    async def create_goal(self, project_id: uuid.UUID, data: WritingGoalCreate) -> WritingGoal:
        goal = WritingGoal(project_id=project_id, **data.model_dump())
        self.db.add(goal)
        await self.db.flush()
        await self.db.refresh(goal)
        return goal

    async def update_goal(self, goal_id: uuid.UUID, data: WritingGoalUpdate) -> Optional[WritingGoal]:
        goal = await self.get_goal(goal_id)
        if not goal:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(goal, field, value)
        await self.db.flush()
        await self.db.refresh(goal)
        return goal

    async def delete_goal(self, goal_id: uuid.UUID) -> bool:
        goal = await self.get_goal(goal_id)
        if not goal:
            return False
        await self.db.delete(goal)
        return True

    async def get_progress(self, goal_id: uuid.UUID) -> dict:
        goal = await self.get_goal(goal_id)
        if not goal:
            raise ValueError("目标不存在")

        today = date.today()
        effective_end = min(goal.end_date, today)

        # Get the outline for this project to find chapters
        outline_result = await self.db.execute(
            select(Outline)
            .where(Outline.project_id == goal.project_id)
            .order_by(Outline.updated_at.desc(), Outline.created_at.desc())
        )
        outline = outline_result.scalars().first()

        current = 0
        co_ids: list[uuid.UUID] = []
        if outline:
            co_result = await self.db.execute(
                select(ChapterOutline).where(ChapterOutline.outline_id == outline.id)
            )
            co_ids = [co.id for co in co_result.scalars().all()]

            if co_ids:
                if goal.type in ("daily_words", "deadline"):
                    words_result = await self.db.execute(
                        select(func.coalesce(func.sum(Chapter.word_count), 0))
                        .where(
                            Chapter.chapter_outline_id.in_(co_ids),
                            Chapter.updated_at >= goal.start_date,
                        )
                    )
                    current = words_result.scalar() or 0
                elif goal.type == "weekly_chapters":
                    ch_result = await self.db.execute(
                        select(func.count())
                        .where(
                            Chapter.chapter_outline_id.in_(co_ids),
                            Chapter.status == "completed",
                            Chapter.updated_at >= goal.start_date,
                        )
                    )
                    current = ch_result.scalar() or 0

        # Calculate consecutive writing days
        consecutive_days = 0
        if outline and co_ids:
            activity_result = await self.db.execute(
                select(func.date(Chapter.updated_at).label("day"))
                .where(
                    Chapter.chapter_outline_id.in_(co_ids),
                    Chapter.word_count > 0,
                    Chapter.updated_at >= goal.start_date,
                )
                .group_by(func.date(Chapter.updated_at))
                .order_by(func.date(Chapter.updated_at).desc())
            )
            active_dates = [row[0] for row in activity_result.all()]

            if active_dates:
                if isinstance(active_dates[0], datetime):
                    active_dates = [d.date() for d in active_dates]

                expected = effective_end
                for d in active_dates:
                    if d == expected:
                        consecutive_days += 1
                        expected = d - timedelta(days=1)
                    elif d < expected:
                        break

        total_days = (goal.end_date - goal.start_date).days + 1
        days_remaining = max(0, (goal.end_date - today).days)
        progress = (current / goal.target * 100) if goal.target > 0 else 0.0

        return {
            "goal": goal,
            "current": current,
            "target": goal.target,
            "progress_percent": round(progress, 1),
            "consecutive_days": consecutive_days,
            "total_days": total_days,
            "days_remaining": days_remaining,
        }

    async def get_project_progress(self, project_id: uuid.UUID) -> dict:
        project_result = await self.db.execute(
            select(Project.id).where(Project.id == project_id)
        )
        if not project_result.scalar_one_or_none():
            raise ValueError("项目不存在")

        today = date.today()
        today_key = today.isoformat()

        streak_day_expr = func.to_char(ChapterVersion.created_at, "YYYY-MM-DD")
        streak_result = await self.db.execute(
            select(
                streak_day_expr.label("date"),
                func.coalesce(func.sum(ChapterVersion.word_count), 0).label("words"),
            )
            .join(Chapter, ChapterVersion.chapter_id == Chapter.id)
            .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
            .join(Outline, ChapterOutline.outline_id == Outline.id)
            .where(
                Outline.project_id == project_id,
                ChapterVersion.created_at >= today - timedelta(days=365),
            )
            .group_by(literal_column("date"))
            .order_by(literal_column("date"))
        )

        streak_rows = streak_result.all()
        streak_words_by_day = {row.date: int(row.words or 0) for row in streak_rows}

        streak_days = 0
        expected = today
        while True:
            key = expected.isoformat()
            if streak_words_by_day.get(key, 0) > 0:
                streak_days += 1
                expected -= timedelta(days=1)
            else:
                break

        goals = await self.list_goals(project_id)
        daily_goals = [
            goal for goal in goals
            if goal.type == "daily_words" and goal.start_date <= today <= goal.end_date
        ]

        active_goal = daily_goals[0] if daily_goals else None

        if not active_goal:
            return {
                "project_id": project_id,
                "today": today_key,
                "today_goal": None,
                "streak_days": streak_days,
                "calendar_marks": [],
            }

        day_expr = func.to_char(ChapterVersion.created_at, "YYYY-MM-DD")
        daily_words_result = await self.db.execute(
            select(
                day_expr.label("date"),
                func.coalesce(func.sum(ChapterVersion.word_count), 0).label("words"),
            )
            .join(Chapter, ChapterVersion.chapter_id == Chapter.id)
            .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
            .join(Outline, ChapterOutline.outline_id == Outline.id)
            .where(
                Outline.project_id == project_id,
                ChapterVersion.created_at >= active_goal.start_date,
                ChapterVersion.created_at < active_goal.end_date + timedelta(days=1),
            )
            .group_by(literal_column("date"))
            .order_by(literal_column("date"))
        )

        daily_rows = daily_words_result.all()
        words_by_day = {row.date: int(row.words or 0) for row in daily_rows}

        today_words = words_by_day.get(today_key, 0)

        calendar_marks = []
        cursor = active_goal.start_date
        while cursor <= min(active_goal.end_date, today):
            key = cursor.isoformat()
            words = words_by_day.get(key, 0)
            achieved = words >= active_goal.target
            missed = cursor < today and not achieved
            calendar_marks.append(
                {
                    "date": key,
                    "words": words,
                    "target": active_goal.target,
                    "achieved": achieved,
                    "missed": missed,
                }
            )
            cursor += timedelta(days=1)

        return {
            "project_id": project_id,
            "today": today_key,
            "today_goal": {
                "goal_id": active_goal.id,
                "goal_type": active_goal.type,
                "target": active_goal.target,
                "current": today_words,
                "achieved": today_words >= active_goal.target,
            },
            "streak_days": streak_days,
            "calendar_marks": calendar_marks,
        }
