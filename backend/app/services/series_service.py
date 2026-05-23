import json
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chapter_summary import ChapterSummary
from app.models.foreshadowing import Foreshadowing
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.models.series import Series
from app.models.story_bible import StoryBible


class SeriesService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_series(self) -> list[Series]:
        result = await self.db.execute(
            select(Series).order_by(Series.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_series(self, series_id: uuid.UUID) -> Optional[Series]:
        result = await self.db.execute(
            select(Series)
            .where(Series.id == series_id)
            .options(selectinload(Series.projects))
        )
        return result.scalar_one_or_none()

    async def create_series(self, data) -> Series:
        series = Series(name=data.name, description=data.description)
        self.db.add(series)
        await self.db.flush()
        await self.db.refresh(series)

        for i, pid in enumerate(data.project_ids):
            proj_result = await self.db.execute(select(Project).where(Project.id == pid))
            project = proj_result.scalar_one_or_none()
            if project:
                project.series_id = series.id
                project.sort_order_in_series = i + 1

        await self.db.flush()
        await self.db.refresh(series)
        return series

    async def update_series(self, series_id: uuid.UUID, data) -> Optional[Series]:
        series = await self.get_series(series_id)
        if not series:
            return None
        if data.name is not None:
            series.name = data.name
        if data.description is not None:
            series.description = data.description
        await self.db.flush()
        await self.db.refresh(series)
        return series

    async def delete_series(self, series_id: uuid.UUID) -> bool:
        series = await self.get_series(series_id)
        if not series:
            return False
        # Clear series_id on all projects (ondelete SET NULL handles DB level)
        for project in series.projects:
            project.series_id = None
            project.sort_order_in_series = 1
        await self.db.delete(series)
        await self.db.flush()
        return True

    async def add_project(self, series_id: uuid.UUID, project_id: uuid.UUID) -> bool:
        series = await self.get_series(series_id)
        if not series:
            return False
        proj_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if not project:
            return False
        project.series_id = series_id
        max_order = max((p.sort_order_in_series for p in series.projects), default=0)
        project.sort_order_in_series = max_order + 1
        await self.db.flush()
        return True

    async def remove_project(self, series_id: uuid.UUID, project_id: uuid.UUID) -> bool:
        proj_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if not project or project.series_id != series_id:
            return False
        project.series_id = None
        project.sort_order_in_series = 1
        await self.db.flush()
        return True

    async def reorder_projects(self, series_id: uuid.UUID, project_ids: list[uuid.UUID]) -> bool:
        for i, pid in enumerate(project_ids):
            proj_result = await self.db.execute(select(Project).where(Project.id == pid))
            project = proj_result.scalar_one_or_none()
            if project and project.series_id == series_id:
                project.sort_order_in_series = i + 1
        await self.db.flush()
        return True

    async def get_predecessor_context(self, project_id: uuid.UUID) -> Optional[dict]:
        """For a project in a series, return predecessor projects' context for AI generation."""
        proj_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = proj_result.scalar_one_or_none()
        if not project or not project.series_id:
            return None

        # Load all projects in the series, ordered
        series_result = await self.db.execute(
            select(Project)
            .where(Project.series_id == project.series_id, Project.deleted_at.is_(None))
            .order_by(Project.sort_order_in_series)
        )
        all_projects = list(series_result.scalars().all())

        # Find predecessors (lower sort_order)
        predecessors = [p for p in all_projects if p.sort_order_in_series < project.sort_order_in_series]
        if not predecessors:
            return None

        immediate = predecessors[-1]  # Closest predecessor
        earlier = predecessors[:-1]   # Earlier books

        # Build earlier books context (just name + synopsis)
        earlier_text = ""
        for p in earlier:
            ol_result = await self.db.execute(select(Outline).where(Outline.project_id == p.id))
            outline = ol_result.scalars().first()
            synopsis = outline.synopsis[:100] if outline and outline.synopsis else ""
            earlier_text += f"前作《{p.name}》：{synopsis}...\n"

        # Build immediate predecessor context
        immediate_text = f"前作《{immediate.name}》（紧接前作）：\n"
        ol_result = await self.db.execute(select(Outline).where(Outline.project_id == immediate.id))
        outline = ol_result.scalars().first()
        if outline:
            if outline.synopsis:
                immediate_text += f"  概要：{outline.synopsis[:300]}\n"

            # Last 2-3 chapter summaries
            from app.models.chapter import Chapter
            cs_result = await self.db.execute(
                select(ChapterOutline, Chapter, ChapterSummary)
                .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
                .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
                .where(ChapterOutline.outline_id == outline.id)
                .order_by(ChapterOutline.chapter_number.desc())
                .limit(3)
            )
            for co, ch, cs in reversed(cs_result.all()):
                if cs and cs.character_states:
                    immediate_text += f"  第{co.chapter_number}章角色状态：{cs.character_states[:200]}\n"
                if cs and cs.narrative_threads:
                    immediate_text += f"  第{co.chapter_number}章叙事线索：{cs.narrative_threads[:200]}\n"

            # Open foreshadowings
            fs_result = await self.db.execute(
                select(Foreshadowing)
                .where(Foreshadowing.project_id == immediate.id, Foreshadowing.status.in_(["planted", "hinted"]))
                .limit(5)
            )
            foreshadowings = list(fs_result.scalars().all())
            if foreshadowings:
                immediate_text += "  未回收伏笔：\n"
                for fs in foreshadowings:
                    immediate_text += f"    - {fs.description[:80]}\n"

            # Top story bible entries
            sb_result = await self.db.execute(
                select(StoryBible)
                .where(StoryBible.project_id == immediate.id)
                .order_by(StoryBible.updated_at.desc())
                .limit(10)
            )
            story_bibles = list(sb_result.scalars().all())
            if story_bibles:
                immediate_text += "  关键设定：\n"
                for sb in story_bibles:
                    immediate_text += f"    - [{sb.category or '设定'}] {sb.title[:30]}：{sb.content[:80]}\n"

        return {
            "series_id": str(project.series_id),
            "book_number": project.sort_order_in_series,
            "total_books": len(all_projects),
            "earlier_books_text": earlier_text.strip(),
            "immediate_predecessor_text": immediate_text.strip(),
        }
