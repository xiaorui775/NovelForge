import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.chapter import Chapter, ChapterVersion
from app.models.character import Character
from app.models.foreshadowing import Foreshadowing
from app.models.generation import GenerationLog
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.models.scene import Scene

router = APIRouter(tags=["analytics"])


@router.get("/analytics/daily-words")
async def get_daily_words(days: int = 365, db: AsyncSession = Depends(get_db)):
    """获取每天的写作字数（基于 chapter_versions）"""
    cutoff = datetime.utcnow() - timedelta(days=days)

    day_expr = func.to_char(ChapterVersion.created_at, "YYYY-MM-DD")
    result = await db.execute(
        select(
            day_expr.label("date"),
            func.coalesce(func.sum(ChapterVersion.word_count), 0).label("words"),
            func.count(ChapterVersion.id).label("versions"),
        )
        .where(ChapterVersion.created_at >= cutoff)
        .group_by(literal_column("date"))
        .order_by(literal_column("date"))
    )

    rows = result.all()
    return [
        {
            "date": row.date,
            "words": int(row.words),
            "versions": row.versions,
        }
        for row in rows
    ]


@router.get("/analytics/overview")
async def get_overview(db: AsyncSession = Depends(get_db)):
    """获取总体使用统计"""
    # 总生成次数
    gen_count_result = await db.execute(select(func.count(GenerationLog.id)))
    total_generations = gen_count_result.scalar() or 0

    # 总 token 消耗
    token_result = await db.execute(
        select(
            func.coalesce(func.sum(GenerationLog.token_input + GenerationLog.token_output), 0)
        )
    )
    total_tokens = int(token_result.scalar() or 0)

    # 总费用
    cost_result = await db.execute(
        select(func.coalesce(func.sum(GenerationLog.cost), 0))
    )
    total_cost = float(cost_result.scalar() or 0)

    # 平均质量评分
    score_result = await db.execute(
        select(func.avg(GenerationLog.quality_score)).where(GenerationLog.quality_score.isnot(None))
    )
    avg_score = round(float(score_result.scalar() or 0), 1)

    # 总章节数
    chapter_count_result = await db.execute(
        select(func.count(Chapter.id)).where(Chapter.status == "completed")
    )
    total_chapters = chapter_count_result.scalar() or 0

    # 总字数
    word_count_result = await db.execute(
        select(func.coalesce(func.sum(Chapter.word_count), 0)).where(Chapter.status == "completed")
    )
    total_words = int(word_count_result.scalar() or 0)

    # 总项目数
    project_count_result = await db.execute(select(func.count(Project.id)))
    total_projects = project_count_result.scalar() or 0

    # 平均生成耗时
    duration_result = await db.execute(
        select(func.avg(GenerationLog.duration_ms)).where(GenerationLog.duration_ms > 0)
    )
    avg_duration_ms = int(duration_result.scalar() or 0)

    return {
        "total_generations": total_generations,
        "total_tokens": total_tokens,
        "total_cost": round(total_cost, 4),
        "avg_score": avg_score,
        "total_chapters": total_chapters,
        "total_words": total_words,
        "total_projects": total_projects,
        "avg_duration_ms": avg_duration_ms,
    }


@router.get("/analytics/monthly")
async def get_monthly_stats(months: int = 6, db: AsyncSession = Depends(get_db)):
    """获取近 N 个月的月度统计"""
    cutoff = datetime.utcnow() - timedelta(days=months * 30)

    month_expr = func.to_char(GenerationLog.created_at, "YYYY-MM")
    result = await db.execute(
        select(
            month_expr.label("month"),
            func.count(GenerationLog.id).label("generations"),
            func.coalesce(func.sum(GenerationLog.token_input + GenerationLog.token_output), 0).label("tokens"),
            func.coalesce(func.sum(GenerationLog.cost), 0).label("cost"),
            func.avg(GenerationLog.quality_score).label("avg_score"),
        )
        .where(GenerationLog.created_at >= cutoff)
        .group_by(literal_column("month"))
        .order_by(literal_column("month"))
    )

    rows = result.all()
    return [
        {
            "month": row.month,
            "generations": row.generations,
            "tokens": int(row.tokens),
            "cost": round(float(row.cost), 4),
            "avg_score": round(float(row.avg_score), 1) if row.avg_score else None,
        }
        for row in rows
    ]


@router.get("/analytics/by-model")
async def get_stats_by_model(db: AsyncSession = Depends(get_db)):
    """按模型统计使用量"""
    result = await db.execute(
        select(
            ModelConfig.name.label("model_name"),
            ModelConfig.id.label("model_id"),
            func.count(GenerationLog.id).label("generations"),
            func.coalesce(func.sum(GenerationLog.token_input + GenerationLog.token_output), 0).label("tokens"),
            func.coalesce(func.sum(GenerationLog.cost), 0).label("cost"),
            func.avg(GenerationLog.quality_score).label("avg_score"),
        )
        .join(ModelConfig, GenerationLog.model_id == ModelConfig.id)
        .group_by(ModelConfig.id, ModelConfig.name)
        .order_by(func.sum(GenerationLog.cost).desc())
    )

    rows = result.all()
    return [
        {
            "model_id": str(row.model_id),
            "model_name": row.model_name,
            "generations": row.generations,
            "tokens": int(row.tokens),
            "cost": round(float(row.cost), 4),
            "avg_score": round(float(row.avg_score), 1) if row.avg_score else None,
        }
        for row in rows
    ]


@router.get("/analytics/by-project")
async def get_stats_by_project(db: AsyncSession = Depends(get_db)):
    """按项目统计使用量"""
    result = await db.execute(
        select(
            Project.id.label("project_id"),
            Project.name.label("project_name"),
            func.count(GenerationLog.id).label("generations"),
            func.coalesce(func.sum(GenerationLog.token_input + GenerationLog.token_output), 0).label("tokens"),
            func.coalesce(func.sum(GenerationLog.cost), 0).label("cost"),
        )
        .join(Chapter, GenerationLog.chapter_id == Chapter.id)
        .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
        .join(Outline, ChapterOutline.outline_id == Outline.id)
        .join(Project, Outline.project_id == Project.id)
        .group_by(Project.id, Project.name)
        .order_by(func.sum(GenerationLog.cost).desc())
    )

    rows = result.all()
    return [
        {
            "project_id": str(row.project_id),
            "project_name": row.project_name,
            "generations": row.generations,
            "tokens": int(row.tokens),
            "cost": round(float(row.cost), 4),
        }
        for row in rows
    ]


@router.get("/analytics/recent")
async def get_recent_activity(limit: int = 20, db: AsyncSession = Depends(get_db)):
    """获取最近的生成活动"""
    result = await db.execute(
        select(GenerationLog)
        .order_by(GenerationLog.created_at.desc())
        .limit(limit)
    )
    logs = list(result.scalars().all())

    activities = []
    for log in logs:
        # 获取章节信息
        chapter_info = None
        if log.chapter_id:
            ch_result = await db.execute(
                select(Chapter, ChapterOutline)
                .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
                .where(Chapter.id == log.chapter_id)
            )
            row = ch_result.first()
            if row:
                chapter_info = {
                    "chapter_id": str(row.Chapter.id),
                    "chapter_number": row.ChapterOutline.chapter_number,
                    "title": row.ChapterOutline.title,
                }

        # 获取模型名
        model_name = None
        if log.model_id:
            model_result = await db.execute(
                select(ModelConfig.name).where(ModelConfig.id == log.model_id)
            )
            model_name = model_result.scalar()

        activities.append({
            "id": str(log.id),
            "status": log.status,
            "token_input": log.token_input,
            "token_output": log.token_output,
            "cost": float(log.cost),
            "duration_ms": log.duration_ms,
            "quality_score": float(log.quality_score) if log.quality_score else None,
            "model_name": model_name,
            "chapter": chapter_info,
            "created_at": log.created_at.isoformat(),
        })

    return activities


@router.get("/projects/{project_id}/health")
async def get_story_health(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """获取项目的故事健康度数据"""
    # Verify project exists
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # Get outline
    ol_result = await db.execute(
        select(Outline)
        .where(Outline.project_id == project_id)
        .order_by(Outline.updated_at.desc(), Outline.created_at.desc())
    )
    outline = ol_result.scalars().first()
    if not outline:
        raise HTTPException(status_code=400, detail="项目还没有大纲")

    # All chapter outlines for this project
    co_result = await db.execute(
        select(ChapterOutline)
        .where(ChapterOutline.outline_id == outline.id)
        .order_by(ChapterOutline.chapter_number)
    )
    chapter_outlines = list(co_result.scalars().all())

    # All chapters for these outlines
    co_ids = [co.id for co in chapter_outlines]
    ch_result = await db.execute(
        select(Chapter).where(Chapter.chapter_outline_id.in_(co_ids))
    )
    chapters_by_outline = {str(ch.chapter_outline_id): ch for ch in ch_result.scalars().all()}

    # 1. Chapter completion stats
    completed = 0
    in_progress = 0
    empty = 0
    chapter_words = []  # For line chart and heatmap

    for co in chapter_outlines:
        ch = chapters_by_outline.get(str(co.id))
        if ch and ch.status == "completed":
            completed += 1
            chapter_words.append({
                "chapter_number": co.chapter_number,
                "title": co.title or f"第{co.chapter_number}章",
                "word_count": ch.word_count or 0,
            })
        elif ch and ch.content:
            in_progress += 1
            chapter_words.append({
                "chapter_number": co.chapter_number,
                "title": co.title or f"第{co.chapter_number}章",
                "word_count": ch.word_count or 0,
            })
        else:
            empty += 1
            chapter_words.append({
                "chapter_number": co.chapter_number,
                "title": co.title or f"第{co.chapter_number}章",
                "word_count": 0,
            })

    # 2. Foreshadowing stats
    fs_result = await db.execute(
        select(Foreshadowing.status, func.count(Foreshadowing.id))
        .where(Foreshadowing.project_id == project_id)
        .group_by(Foreshadowing.status)
    )
    foreshadowing_stats = {row[0]: row[1] for row in fs_result.all()}

    # 3. Character scene frequency (POV appearances)
    chapter_ids = [ch.id for ch in chapters_by_outline.values() if ch]
    char_freq = {}
    if chapter_ids:
        scene_result = await db.execute(
            select(Scene.pov_character_id, func.count(Scene.id))
            .where(Scene.chapter_id.in_(chapter_ids), Scene.pov_character_id.isnot(None))
            .group_by(Scene.pov_character_id)
        )
        scene_rows = scene_result.all()
        char_ids = [row[0] for row in scene_rows]
        if char_ids:
            char_name_result = await db.execute(
                select(Character.id, Character.name).where(Character.id.in_(char_ids))
            )
            char_names = {str(row[0]): row[1] for row in char_name_result.all()}
            for char_id, count in scene_rows:
                name = char_names.get(str(char_id), "未知")
                char_freq[name] = count

    # 4. Total stats
    total_words = sum(cw["word_count"] for cw in chapter_words)

    return {
        "project_name": project.name,
        "total_chapters": len(chapter_outlines),
        "completed": completed,
        "in_progress": in_progress,
        "empty": empty,
        "total_words": total_words,
        "chapter_words": chapter_words,
        "foreshadowing": {
            "open": foreshadowing_stats.get("open", 0),
            "resolved": foreshadowing_stats.get("resolved", 0),
            "abandoned": foreshadowing_stats.get("abandoned", 0),
        },
        "character_frequency": char_freq,
    }
