"""公共实体链加载工具，消除各 service 中重复的 chapter -> chapter_outline -> outline -> project 查询链"""

import json
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chapter import Chapter
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project


def format_chapter_card(
    chapter_outline: ChapterOutline,
    chapter_summary=None,
    content_summary: Optional[str] = None,
) -> str:
    """将章节摘要格式化为紧凑的结构化卡片，用于 prompt 注入。

    优先使用 ChapterSummary 结构化字段（~80 字/章），否则回退到自由文本摘要。
    """
    if chapter_summary is None:
        fallback = content_summary or chapter_outline.summary or ""
        return f"- 第{chapter_outline.chapter_number}章 {chapter_outline.title or ''}: {fallback}"

    parts = [f"- 第{chapter_outline.chapter_number}章 {chapter_outline.title or ''}"]

    # timeline + locations → 行内标注
    timeline = _safe_str_field(chapter_summary, "timeline")
    locations = _safe_json_field(chapter_summary, "locations")
    meta = []
    if timeline:
        meta.append(timeline)
    if locations and isinstance(locations, list):
        meta.append("→".join(str(l) for l in locations[:3]))
    if meta:
        parts.append(" | ".join(meta))

    # character_states → 紧凑键值对
    char_states = _safe_json_field(chapter_summary, "character_states")
    if char_states and isinstance(char_states, dict):
        entries = []
        for name, state in list(char_states.items())[:5]:
            if isinstance(state, dict):
                s = "/".join(str(v) for v in state.values() if v)
                entries.append(f"{name}: {s}" if s else name)
            else:
                entries.append(f"{name}: {state}")
        if entries:
            parts.append("角色: {" + ", ".join(entries) + "}")

    # unresolved_hooks → 简表
    hooks = _safe_json_field(chapter_summary, "unresolved_hooks")
    if hooks and isinstance(hooks, list):
        hook_strs = [str(h)[:30] for h in hooks[:4]]
        parts.append("悬念: [" + ", ".join(hook_strs) + "]")

    return "\n  ".join(parts)


def _safe_json_field(obj, field_name: str):
    """安全解析 ChapterSummary 上的 JSON Text 字段"""
    raw = getattr(obj, field_name, None)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _safe_str_field(obj, field_name: str) -> Optional[str]:
    """安全获取 ChapterSummary 上的字符串字段"""
    val = getattr(obj, field_name, None)
    return val if val else None


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
