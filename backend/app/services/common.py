"""公共实体链加载工具，消除各 service 中重复的 chapter -> chapter_outline -> outline -> project 查询链"""

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chapter import Chapter
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project


async def load_chapter_chain(
    db: AsyncSession,
    chapter_id: uuid.UUID,
) -> dict:
    """加载 chapter -> chapter_outline -> outline -> project 实体链

    Returns:
        dict with keys: chapter, chapter_outline, outline, project

    Raises:
        ValueError: 任何实体不存在时
    """
    chapter_result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = chapter_result.scalar_one_or_none()
    if not chapter:
        raise ValueError("章节不存在")

    co_result = await db.execute(
        select(ChapterOutline).where(ChapterOutline.id == chapter.chapter_outline_id)
    )
    chapter_outline = co_result.scalar_one_or_none()
    if not chapter_outline:
        raise ValueError("章节大纲不存在")

    ol_result = await db.execute(select(Outline).where(Outline.id == chapter_outline.outline_id))
    outline = ol_result.scalar_one_or_none()
    if not outline:
        raise ValueError("大纲不存在")

    pr_result = await db.execute(select(Project).where(Project.id == outline.project_id))
    project = pr_result.scalar_one_or_none()
    if not project:
        raise ValueError("项目不存在")

    return {
        "chapter": chapter,
        "chapter_outline": chapter_outline,
        "outline": outline,
        "project": project,
    }


async def load_chapter_chain_with_model(
    db: AsyncSession,
    chapter_id: uuid.UUID,
    model_id: uuid.UUID,
) -> dict:
    """加载实体链 + model_config

    Returns:
        dict with keys: chapter, chapter_outline, outline, project, model_config
    """
    chain = await load_chapter_chain(db, chapter_id)

    model_result = await db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
    model_config = model_result.scalar_one_or_none()
    if not model_config:
        raise ValueError("模型不存在")

    chain["model_config"] = model_config
    return chain
