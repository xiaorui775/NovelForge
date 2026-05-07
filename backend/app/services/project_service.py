from typing import Optional
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import Project
from app.models.outline import Outline, ChapterOutline
from app.models.chapter import Chapter, ChapterVersion
from app.models.terminology import Terminology
from app.models.story_bible import StoryBible
from app.schemas.project import ProjectCreate, ProjectUpdate


DEFAULT_TERMINOLOGIES = [
    {
        "term": "灵脉",
        "category": "功法",
        "description": "天地灵气汇聚形成的修炼脉络，可提升修炼速度。",
    },
    {
        "term": "天元城",
        "category": "地名",
        "description": "中域核心城池，宗门、商会与情报势力交汇之地。",
    },
    {
        "term": "执火卫",
        "category": "组织",
        "description": "直属皇庭的特殊行动组织，负责异象与禁术事件处置。",
    },
]

DEFAULT_STORY_BIBLE_ENTRIES = [
    {
        "category": "character",
        "title": "角色卡模板（示例）",
        "content": "姓名｜身份｜公开目标｜隐秘动机｜核心矛盾｜关系网（盟友/敌对）｜不可违背底线。",
        "tags": "角色,模板,人设",
    },
    {
        "category": "worldview",
        "title": "世界规则模板（示例）",
        "content": "力量体系层级、代价机制、禁忌边界、社会秩序与权力结构，需保持前后一致。",
        "tags": "设定,规则,世界观",
    },
    {
        "category": "plot",
        "title": "主线推进表（示例）",
        "content": "主线目标、阶段里程碑、当前阻碍、下一步触发条件；每章只推进一个关键变化。",
        "tags": "主线,节奏,推进",
    },
    {
        "category": "timeline",
        "title": "时间线锚点（示例）",
        "content": "记录关键事件发生时间、持续时长与先后关系，避免人物与事件时间冲突。",
        "tags": "时间线,一致性",
    },
]


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_projects(self, include_archived: bool = False) -> list[Project]:
        query = select(Project).where(Project.deleted_at.is_(None)).order_by(Project.updated_at.desc())
        if not include_archived:
            query = query.where(Project.status != "archived")
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def list_deleted_projects(self) -> list[Project]:
        query = select(Project).where(Project.deleted_at.isnot(None)).order_by(Project.deleted_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def archive_project(self, project_id: uuid.UUID) -> Optional[Project]:
        project = await self.get_project(project_id)
        if not project:
            return None
        project.status = "archived"
        await self.db.flush()
        await self.db.refresh(project)
        return project

    async def unarchive_project(self, project_id: uuid.UUID) -> Optional[Project]:
        project = await self.get_project(project_id)
        if not project:
            return None
        project.status = "draft"
        await self.db.flush()
        await self.db.refresh(project)
        return project

    async def get_project(self, project_id: uuid.UUID) -> Optional[Project]:
        result = await self.db.execute(select(Project).where(Project.id == project_id))
        return result.scalar_one_or_none()

    async def _seed_project_examples(self, project_id: uuid.UUID) -> None:
        """为新项目写入术语库与故事圣经示例数据（幂等）"""
        terms_exist = await self.db.execute(
            select(func.count()).select_from(Terminology).where(Terminology.project_id == project_id)
        )
        if (terms_exist.scalar() or 0) == 0:
            for item in DEFAULT_TERMINOLOGIES:
                self.db.add(Terminology(project_id=project_id, **item))

        bible_exist = await self.db.execute(
            select(func.count()).select_from(StoryBible).where(StoryBible.project_id == project_id)
        )
        if (bible_exist.scalar() or 0) == 0:
            for item in DEFAULT_STORY_BIBLE_ENTRIES:
                self.db.add(StoryBible(project_id=project_id, **item))

    async def create_project(self, data: ProjectCreate) -> Project:
        project = Project(**data.model_dump())
        self.db.add(project)
        await self.db.flush()

        await self._seed_project_examples(project.id)

        await self.db.flush()
        await self.db.refresh(project)
        return project

    async def update_project(self, project_id: uuid.UUID, data: ProjectUpdate) -> Optional[Project]:
        project = await self.get_project(project_id)
        if not project:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(project, field, value)

        await self.db.flush()
        await self.db.refresh(project)
        return project

    async def delete_project(self, project_id: uuid.UUID) -> bool:
        """软删除：移到回收站"""
        project = await self.get_project(project_id)
        if not project:
            return False
        project.deleted_at = datetime.utcnow()
        await self.db.flush()
        return True

    async def restore_project(self, project_id: uuid.UUID) -> Optional[Project]:
        """从回收站恢复"""
        project = await self.get_project(project_id)
        if not project or not project.deleted_at:
            return None
        project.deleted_at = None
        await self.db.flush()
        await self.db.refresh(project)
        return project

    async def permanent_delete_project(self, project_id: uuid.UUID) -> bool:
        """永久删除"""
        result = await self.db.execute(
            select(Project)
            .where(Project.id == project_id, Project.deleted_at.isnot(None))
            .options(
                selectinload(Project.outline)
                .selectinload(Outline.chapter_outlines)
                .selectinload(ChapterOutline.chapter)
                .selectinload(Chapter.versions),
                selectinload(Project.outline)
                .selectinload(Outline.chapter_outlines)
                .selectinload(ChapterOutline.chapter)
                .selectinload(Chapter.scenes),
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            return False
        await self.db.delete(project)
        await self.db.flush()
        return True

    async def cleanup_old_deleted(self, days: int = 30) -> int:
        """清理超过指定天数的已删除项目"""
        cutoff = datetime.utcnow() - timedelta(days=days)
        result = await self.db.execute(
            select(Project).where(
                Project.deleted_at.isnot(None),
                Project.deleted_at < cutoff,
            ).options(
                selectinload(Project.outline)
                .selectinload(Outline.chapter_outlines)
                .selectinload(ChapterOutline.chapter)
                .selectinload(Chapter.versions),
                selectinload(Project.outline)
                .selectinload(Outline.chapter_outlines)
                .selectinload(ChapterOutline.chapter)
                .selectinload(Chapter.scenes),
            )
        )
        projects = list(result.scalars().all())
        for p in projects:
            await self.db.delete(p)
        await self.db.flush()
        return len(projects)

    async def get_project_stats(self, project_id: uuid.UUID) -> dict:
        # Get outline
        outline_result = await self.db.execute(
            select(Outline)
            .where(Outline.project_id == project_id)
            .order_by(Outline.updated_at.desc(), Outline.created_at.desc())
        )
        outline = outline_result.scalars().first()

        if not outline:
            return {
                "total_chapters": 0,
                "completed_chapters": 0,
                "total_words": 0,
                "progress_percent": 0.0,
            }

        # Count total chapter outlines
        total_result = await self.db.execute(
            select(func.count()).select_from(ChapterOutline).where(ChapterOutline.outline_id == outline.id)
        )
        total = total_result.scalar() or 0

        # Count completed chapters
        completed_result = await self.db.execute(
            select(func.count()).select_from(Chapter)
            .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
            .where(ChapterOutline.outline_id == outline.id, Chapter.status == "completed")
        )
        completed = completed_result.scalar() or 0

        # Sum word count
        words_result = await self.db.execute(
            select(func.coalesce(func.sum(Chapter.word_count), 0))
            .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
            .where(ChapterOutline.outline_id == outline.id)
        )
        total_words = words_result.scalar() or 0

        progress = (completed / total * 100) if total > 0 else 0.0

        return {
            "total_chapters": total,
            "completed_chapters": completed,
            "total_words": total_words,
            "progress_percent": round(progress, 1),
        }
