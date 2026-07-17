import json
import uuid
import difflib
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.chapter import Chapter, ChapterVersion
from app.models.chapter_summary import ChapterSummary
from app.models.outline import ChapterOutline, Outline
from app.models.foreshadowing import Foreshadowing
from app.models.scene import Scene
from app.schemas.chapter import (
    ChapterGenerateRequest,
    ChapterResponse,
    ChapterUpdate,
    ChapterVersionResponse,
    ConsistencyCheckResponse,
    CrossChapterConsistencyResponse,
    CostEstimateRequest,
    CostEstimateResponse,
    QualityScoreRequest,
    QualityScoreResponse,
    SelectionRewriteRequest,
    ChapterRefineRequest,
    ChapterBrainstormRequest,
    ChapterBrainstormResponse,
)
from app.adapters.adapter_factory import AdapterFactory
from app.models.model_config import ModelConfig
from app.schemas.generation import BatchGenerateRequest
from app.services.consistency_service import ConsistencyService
from app.services.generation_service import GenerationService
from app.services.post_write_service import PostWriteAnalysisService
from app.services.pacing_service import PacingService
from app.services.quality_service import QualityService

router = APIRouter(tags=["chapters"])


def get_generation_service(db: AsyncSession = Depends(get_db)) -> GenerationService:
    return GenerationService(db)


def _build_diff_snapshot(old_content: str, new_content: str) -> str:
    old_lines = (old_content or "").splitlines()
    new_lines = (new_content or "").splitlines()
    diff_lines = list(difflib.unified_diff(old_lines, new_lines, lineterm="", n=2))
    if not diff_lines:
        return ""
    return "\n".join(diff_lines)[:12000]


@router.get("/chapter-outlines/{chapter_outline_id}/chapter", response_model=ChapterResponse)
async def get_chapter_by_outline(
    chapter_outline_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Chapter)
        .where(Chapter.chapter_outline_id == chapter_outline_id)
        .order_by(Chapter.updated_at.desc(), Chapter.created_at.desc())
    )
    chapter = result.scalars().first()
    if not chapter:
        # Create empty chapter
        chapter = Chapter(chapter_outline_id=chapter_outline_id, content="", status="empty")
        db.add(chapter)
        await db.flush()
        await db.refresh(chapter)
    return chapter


@router.post("/chapter-outlines/batch-chapters")
async def batch_get_chapters(
    chapter_outline_ids: list[uuid.UUID],
    db: AsyncSession = Depends(get_db),
):
    """Fetch chapters for multiple chapter outlines in one query."""
    if len(chapter_outline_ids) > 100:
        raise HTTPException(status_code=400, detail="最多一次查询100个章节")

    result = await db.execute(
        select(Chapter).where(Chapter.chapter_outline_id.in_(chapter_outline_ids))
    )
    existing = {str(ch.chapter_outline_id): ch for ch in result.scalars().all()}

    # Create missing chapters
    chapters = []
    for outline_id in chapter_outline_ids:
        oid_str = str(outline_id)
        if oid_str in existing:
            chapters.append(existing[oid_str])
        else:
            chapter = Chapter(chapter_outline_id=outline_id, content="", status="empty")
            db.add(chapter)
            chapters.append(chapter)

    await db.flush()
    for ch in chapters:
        await db.refresh(ch)

    return [{"chapter_outline_id": str(ch.chapter_outline_id), "id": str(ch.id), "content": ch.content, "word_count": ch.word_count, "status": ch.status} for ch in chapters]


@router.put("/chapters/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    chapter_id: uuid.UUID,
    data: ChapterUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    old_content = chapter.content or ""
    new_content = data.content or ""

    chapter.content = new_content
    chapter.word_count = len(new_content)
    chapter.status = "completed" if new_content else "empty"

    if old_content != new_content and not data.auto_save:
        version_count_result = await db.execute(
            select(ChapterVersion).where(ChapterVersion.chapter_id == chapter_id)
        )
        versions = list(version_count_result.scalars().all())
        db.add(
            ChapterVersion(
                chapter_id=chapter_id,
                version_number=len(versions) + 1,
                content=new_content,
                word_count=len(new_content),
                model_id=chapter.model_id,
                token_used=chapter.token_used or 0,
                change_type="user_edit",
                diff_snapshot=_build_diff_snapshot(old_content, new_content),
            )
        )

    # 标记摘要为过期（内容变更超过 20% 时）
    if old_content != new_content:
        cs_result = await db.execute(
            select(ChapterSummary).where(ChapterSummary.chapter_id == chapter_id)
        )
        cs = cs_result.scalar_one_or_none()
        if cs and cs.word_count_at_summary > 0:
            if abs(len(new_content) - cs.word_count_at_summary) / cs.word_count_at_summary > 0.2:
                cs.is_stale = True

    await db.flush()
    await db.refresh(chapter)
    return chapter


@router.post("/chapters/{chapter_id}/generate")
async def generate_chapter(
    chapter_id: uuid.UUID,
    data: ChapterGenerateRequest,
    service: GenerationService = Depends(get_generation_service),
):
    async def event_stream():
        try:
            if data.multi_round:
                gen = service.generate_multi_round_stream(
                    chapter_id=chapter_id,
                    model_id=data.model_id,
                    max_tokens=data.max_tokens,
                    template_id=data.template_id,
                    temperature=data.temperature,
                    top_p=data.top_p,
                )
            else:
                gen = service.generate_chapter_stream(
                    chapter_id=chapter_id,
                    model_id=data.model_id,
                    max_tokens=data.max_tokens,
                    template_id=data.template_id,
                    auto_score=data.auto_score,
                    score_threshold=data.score_threshold,
                    auto_revise=data.auto_revise,
                    preview=data.preview,
                    temperature=data.temperature,
                    top_p=data.top_p,
                )
            async for event in gen:
                yield f"data: {event}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'生成失败: {type(e).__name__}: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chapters/{chapter_id}/regenerate")
async def regenerate_chapter(
    chapter_id: uuid.UUID,
    data: ChapterGenerateRequest,
    service: GenerationService = Depends(get_generation_service),
):
    async def event_stream():
        try:
            async for event in service.generate_chapter_stream(
                chapter_id=chapter_id,
                model_id=data.model_id,
                max_tokens=data.max_tokens,
                template_id=data.template_id,
                auto_score=data.auto_score,
                score_threshold=data.score_threshold,
                auto_revise=data.auto_revise,
                preview=data.preview,
                temperature=data.temperature,
                top_p=data.top_p,
            ):
                yield f"data: {event}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'重新生成失败: {type(e).__name__}: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chapters/{chapter_id}/continue")
async def continue_chapter(
    chapter_id: uuid.UUID,
    data: ChapterGenerateRequest,
    service: GenerationService = Depends(get_generation_service),
):
    """续写章节（基于已有内容继续）"""
    async def event_stream():
        try:
            async for event in service.continue_chapter_stream(
                chapter_id=chapter_id,
                model_id=data.model_id,
                max_tokens=data.max_tokens,
                auto_revise=data.auto_revise,
                temperature=data.temperature,
                top_p=data.top_p,
            ):
                yield f"data: {event}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'续写失败: {type(e).__name__}: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )




@router.post("/chapters/{chapter_id}/rewrite-selection")
async def rewrite_selection(
    chapter_id: uuid.UUID,
    data: SelectionRewriteRequest,
    service: GenerationService = Depends(get_generation_service),
):
    """改写选中的文本片段（SSE 流式输出，不自动保存）"""
    async def event_stream():
        try:
            async for event in service.rewrite_selection_stream(
                chapter_id=chapter_id,
                selected_text=data.selected_text,
                instruction=data.instruction,
                model_id=data.model_id,
                context_before=data.context_before,
                context_after=data.context_after,
                temperature=data.temperature,
                top_p=data.top_p,
            ):
                yield f"data: {event}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'改写失败: {type(e).__name__}: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chapters/{chapter_id}/refine")
async def refine_chapter(
    chapter_id: uuid.UUID,
    data: ChapterRefineRequest,
    service: GenerationService = Depends(get_generation_service),
):
    async def event_stream():
        try:
            async for event in service.refine_chapter_stream(
                chapter_id=chapter_id,
                model_id=data.model_id,
                draft_text=data.draft_text,
                max_suggestions=data.max_suggestions,
                temperature=data.temperature,
                top_p=data.top_p,
            ):
                yield f"data: {event}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'精修失败: {type(e).__name__}: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chapters/{chapter_id}/brainstorm", response_model=ChapterBrainstormResponse)
async def brainstorm_chapter(
    chapter_id: uuid.UUID,
    data: ChapterBrainstormRequest,
    service: GenerationService = Depends(get_generation_service),
):
    """写作瓶颈脑暴：SSE 流式返回走向与过渡文本"""
    async def event_stream():
        try:
            async for event in service.brainstorm_chapter_stream(
                chapter_id=chapter_id,
                model_id=data.model_id,
                selected_direction=data.selected_direction,
                temperature=data.temperature,
                top_p=data.top_p,
            ):
                yield f"data: {event}\n\n"
        except ValueError as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'脑暴失败: {type(e).__name__}: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@router.post("/chapters/{chapter_id}/versions/{version_id}/adopt", response_model=ChapterResponse)
async def adopt_preview_version(
    chapter_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """采纳预览版本，将其内容应用到章节正文"""
    chapter_result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = chapter_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    version_result = await db.execute(
        select(ChapterVersion).where(
            ChapterVersion.id == version_id,
            ChapterVersion.chapter_id == chapter_id,
        )
    )
    version = version_result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="版本不存在")

    old_content = chapter.content or ""
    chapter.content = version.content
    chapter.word_count = version.word_count
    chapter.model_id = version.model_id
    chapter.token_used = version.token_used
    chapter.status = "completed"

    # Mark the preview version as adopted so getLatestPreview won't return it again
    if version.change_type == "preview":
        version.change_type = "adopt_preview"
        # Update diff snapshot to reflect the adoption
        version.diff_snapshot = _build_diff_snapshot(old_content, version.content or "")

    await db.flush()
    await db.refresh(chapter)
    return chapter


@router.post("/chapters/{chapter_id}/versions/{version_id}/discard", status_code=204)
async def discard_preview_version(
    chapter_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """丢弃预览版本，标记为已丢弃"""
    version_result = await db.execute(
        select(ChapterVersion).where(
            ChapterVersion.id == version_id,
            ChapterVersion.chapter_id == chapter_id,
        )
    )
    version = version_result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="版本不存在")

    if version.change_type == "preview":
        version.change_type = "discard_preview"
        await db.flush()


@router.get("/chapters/{chapter_id}/versions", response_model=list[ChapterVersionResponse])
async def list_versions(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChapterVersion)
        .where(ChapterVersion.chapter_id == chapter_id)
        .order_by(ChapterVersion.version_number.desc())
    )
    return list(result.scalars().all())


@router.get("/chapters/{chapter_id}/latest-preview", response_model=ChapterVersionResponse)
async def get_latest_preview(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChapterVersion)
        .where(ChapterVersion.chapter_id == chapter_id, ChapterVersion.change_type == "preview")
        .order_by(ChapterVersion.created_at.desc())
        .limit(1)
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="无待处理预览版本")
    return version


@router.post("/chapters/{chapter_id}/versions/{version_id}/restore", response_model=ChapterResponse)
async def restore_version(
    chapter_id: uuid.UUID,
    version_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    # Get chapter
    chapter_result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = chapter_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    # Get version
    version_result = await db.execute(
        select(ChapterVersion).where(
            ChapterVersion.id == version_id,
            ChapterVersion.chapter_id == chapter_id,
        )
    )
    version = version_result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="版本不存在")

    old_content = chapter.content or ""

    chapter.content = version.content
    chapter.word_count = version.word_count
    chapter.model_id = version.model_id
    chapter.token_used = version.token_used

    if old_content != (version.content or ""):
        version_count_result = await db.execute(
            select(ChapterVersion).where(ChapterVersion.chapter_id == chapter_id)
        )
        versions = list(version_count_result.scalars().all())
        db.add(
            ChapterVersion(
                chapter_id=chapter_id,
                version_number=len(versions) + 1,
                content=version.content,
                word_count=version.word_count,
                model_id=version.model_id,
                token_used=version.token_used,
                quality_score=version.quality_score,
                change_type="restore",
                diff_snapshot=_build_diff_snapshot(old_content, version.content or ""),
            )
        )

    await db.flush()
    await db.refresh(chapter)
    return chapter


@router.get("/chapters/{chapter_id}/versions/{v1_id}/compare/{v2_id}")
async def compare_versions(
    chapter_id: uuid.UUID,
    v1_id: uuid.UUID,
    v2_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """对比两个版本的内容"""
    v1_result = await db.execute(
        select(ChapterVersion).where(
            ChapterVersion.id == v1_id,
            ChapterVersion.chapter_id == chapter_id,
        )
    )
    v1 = v1_result.scalar_one_or_none()
    if not v1:
        raise HTTPException(status_code=404, detail="版本1不存在")

    v2_result = await db.execute(
        select(ChapterVersion).where(
            ChapterVersion.id == v2_id,
            ChapterVersion.chapter_id == chapter_id,
        )
    )
    v2 = v2_result.scalar_one_or_none()
    if not v2:
        raise HTTPException(status_code=404, detail="版本2不存在")

    return {
        "v1": {
            "id": str(v1.id),
            "version_number": v1.version_number,
            "content": v1.content,
            "word_count": v1.word_count,
            "quality_score": float(v1.quality_score) if v1.quality_score else None,
            "created_at": v1.created_at.isoformat(),
        },
        "v2": {
            "id": str(v2.id),
            "version_number": v2.version_number,
            "content": v2.content,
            "word_count": v2.word_count,
            "quality_score": float(v2.quality_score) if v2.quality_score else None,
            "created_at": v2.created_at.isoformat(),
        },
    }


@router.post("/chapters/{chapter_id}/score", response_model=QualityScoreResponse)
async def score_chapter(
    chapter_id: uuid.UUID,
    data: QualityScoreRequest,
    db: AsyncSession = Depends(get_db),
):
    service = QualityService(db)
    try:
        result = await service.score_chapter(chapter_id, data.model_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"评分失败: {type(e).__name__}: {str(e)}")


@router.post("/chapters/{chapter_id}/estimate-cost", response_model=CostEstimateResponse)
async def estimate_cost(
    chapter_id: uuid.UUID,
    data: CostEstimateRequest,
    service: GenerationService = Depends(get_generation_service),
):
    try:
        result = await service.estimate_cost(chapter_id, data.model_id, data.template_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"费用预估失败: {type(e).__name__}: {str(e)}")


@router.post("/chapters/{chapter_id}/check-consistency", response_model=ConsistencyCheckResponse)
async def check_consistency(
    chapter_id: uuid.UUID,
    data: QualityScoreRequest,
    db: AsyncSession = Depends(get_db),
):
    """对章节内容进行一致性检查"""
    service = ConsistencyService(db)
    try:
        result = await service.check_consistency(chapter_id, data.model_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"一致性检查失败: {type(e).__name__}: {str(e)}")


@router.post("/chapters/{chapter_id}/post-write-analysis")
async def post_write_analysis(
    chapter_id: uuid.UUID,
    data: QualityScoreRequest,
    db: AsyncSession = Depends(get_db),
):
    """综合 post-write 分析：质量评分 + 一致性 + 节奏 + 伏笔 + 摘要 + 故事圣经

    后台异步执行（分析通常 10-30s），立即返回 job_id，前端轮询
    ``GET /api/jobs/{job_id}`` 取结果。单进程内存任务系统，见 JobService。
    """
    from app.services.job_service import job_service
    from app.database import async_session
    from app.services.post_write_service import PostWriteAnalysisService

    model_id = data.model_id

    async def _run(record):
        # 后台任务脱离请求生命周期，需独立 DB session
        async with async_session() as session:
            try:
                service = PostWriteAnalysisService(session)
                return await service.analyze(chapter_id, model_id)
            except Exception:
                await session.rollback()
                raise

    job_id = job_service.submit("post_write", {"chapter_id": str(chapter_id), "model_id": str(model_id)}, _run)
    return {"job_id": job_id, "status": "pending"}


@router.get("/chapters/{chapter_id}/context")
async def get_chapter_context(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """获取章节写作上下文：摘要、前章摘要、伏笔、场景"""
    # 当前章节
    result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    # 章节大纲
    co_result = await db.execute(
        select(ChapterOutline).where(ChapterOutline.id == chapter.chapter_outline_id)
    )
    chapter_outline = co_result.scalar_one_or_none()

    # 大纲（获取 project_id）
    outline = None
    if chapter_outline:
        ol_result = await db.execute(
            select(Outline).where(Outline.id == chapter_outline.outline_id)
        )
        outline = ol_result.scalar_one_or_none()

    # 前一章摘要
    prev_summary = None
    if chapter_outline and chapter_outline.chapter_number > 1:
        prev_result = await db.execute(
            select(ChapterOutline, Chapter.content_summary)
            .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
            .where(
                ChapterOutline.outline_id == chapter_outline.outline_id,
                ChapterOutline.chapter_number == chapter_outline.chapter_number - 1,
            )
        )
        prev_row = prev_result.first()
        if prev_row:
            co, content_summary = prev_row
            prev_summary = content_summary or co.summary

    # 未解决的伏笔
    foreshadowings = []
    if outline:
        fs_result = await db.execute(
            select(Foreshadowing)
            .options(selectinload(Foreshadowing.plant_chapter))
            .where(
                Foreshadowing.project_id == outline.project_id,
                Foreshadowing.status != "resolved",
            )
            .limit(10)
        )
        for fs in fs_result.scalars().all():
            foreshadowings.append({
                "description": fs.description or "",
                "plant_chapter": f"第{fs.plant_chapter.chapter_number}章" if fs.plant_chapter else None,
            })

    # 当前章节场景
    scenes = []
    sc_result = await db.execute(
        select(Scene)
        .where(Scene.chapter_id == chapter_id)
        .order_by(Scene.scene_number)
    )
    for sc in sc_result.scalars().all():
        scenes.append({
            "scene_number": sc.scene_number,
            "location": sc.location or "",
            "summary": sc.summary or "",
        })

    return {
        "chapter_summary": chapter_outline.summary if chapter_outline else None,
        "content_summary": chapter.content_summary,
        "prev_chapter_summary": prev_summary,
        "open_foreshadowings": foreshadowings,
        "last_edit_time": chapter.updated_at.isoformat() if chapter.updated_at else None,
        "word_count": chapter.word_count or 0,
        "scenes": scenes,
    }


@router.get("/chapters/{chapter_id}/summary")
async def get_chapter_summary(
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """获取章节结构化摘要"""
    result = await db.execute(
        select(ChapterSummary).where(ChapterSummary.chapter_id == chapter_id)
    )
    cs = result.scalar_one_or_none()
    if not cs:
        return {"exists": False}
    return {
        "exists": True,
        "events": json.loads(cs.events) if cs.events else [],
        "character_states": json.loads(cs.character_states) if cs.character_states else {},
        "unresolved_hooks": json.loads(cs.unresolved_hooks) if cs.unresolved_hooks else [],
        "resolved_hooks": json.loads(cs.resolved_hooks) if cs.resolved_hooks else [],
        "timeline": cs.timeline,
        "locations": json.loads(cs.locations) if cs.locations else [],
        "narrative_threads": json.loads(cs.narrative_threads) if cs.narrative_threads else [],
        "word_count_at_summary": cs.word_count_at_summary,
        "is_stale": cs.is_stale,
        "generated_at": cs.generated_at.isoformat() if cs.generated_at else None,
    }


@router.get("/chapters/{chapter_id}/context-usage")
async def get_context_usage(
    chapter_id: uuid.UUID,
    model_id: uuid.UUID,
    service: GenerationService = Depends(get_generation_service),
):
    """获取上下文使用量明细（用于前端可视化）"""
    try:
        result = await service.get_context_usage(chapter_id, model_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取上下文使用量失败: {type(e).__name__}: {str(e)}")


@router.post("/chapters/batch-generate")
async def batch_generate(
    data: BatchGenerateRequest,
    service: GenerationService = Depends(get_generation_service),
):
    """批量生成多个章节（SSE 流式）"""
    async def event_stream():
        try:
            # 创建一次 adapter，跨章节复用（省去重复解密 API key + 新建 httpx client）
            adapter = None
            model_result = await service.db.execute(
                select(ModelConfig).where(ModelConfig.id == data.model_id)
            )
            model_config = model_result.scalar_one_or_none()
            if model_config:
                adapter = await AdapterFactory.create(model_config)

            for i, co_id in enumerate(data.chapter_outline_ids):
                # Get or create chapter
                try:
                    chapter = await service.get_or_create_chapter(co_id)
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'章节 {i+1} 创建失败: {str(e)}'}, ensure_ascii=False)}\n\n"
                    continue

                yield f"data: {json.dumps({'type': 'batch_start', 'index': i, 'total': len(data.chapter_outline_ids), 'chapter_outline_id': str(co_id)}, ensure_ascii=False)}\n\n"

                try:
                    async for event in service.generate_chapter_stream(
                        chapter_id=chapter.id,
                        model_id=data.model_id,
                        adapter=adapter,
                    ):
                        yield f"data: {event}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'章节 {i+1} 生成失败: {str(e)}'}, ensure_ascii=False)}\n\n"
                    continue

                yield f"data: {json.dumps({'type': 'batch_next', 'index': i, 'total': len(data.chapter_outline_ids)}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'batch_done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/projects/{project_id}/pacing-analysis")
async def analyze_pacing(
    project_id: uuid.UUID,
    model_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """分析项目的章节节奏和结构"""
    try:
        service = PacingService(db)
        results = await service.analyze_project(project_id, model_id)
        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"节奏分析失败: {type(e).__name__}: {str(e)}")


@router.post("/projects/{project_id}/cross-chapter-consistency", response_model=CrossChapterConsistencyResponse)
async def cross_chapter_consistency(
    project_id: uuid.UUID,
    model_id: uuid.UUID,
    from_chapter: Optional[int] = None,
    to_chapter: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    """跨章节一致性扫描"""
    try:
        service = ConsistencyService(db)
        results = await service.cross_chapter_check(project_id, model_id, from_chapter, to_chapter)
        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"跨章一致性检查失败: {type(e).__name__}: {str(e)}")


@router.get("/projects/{project_id}/chapters-for-chat")
async def chapters_for_chat(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """获取项目下的章节列表（供聊天引用选择），只返回 id + 标题 + 章节号"""
    # 通过 outline 查找
    ol_result = await db.execute(
        select(Outline).where(Outline.project_id == project_id)
    )
    outline = ol_result.scalar_one_or_none()
    if not outline:
        return []

    result = await db.execute(
        select(ChapterOutline, Chapter.id)
        .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
        .where(ChapterOutline.outline_id == outline.id)
        .order_by(ChapterOutline.chapter_number)
    )
    rows = result.all()
    return [
        {
            "id": str(chapter_id) if chapter_id else str(co.id),
            "title": co.title or f"第{co.chapter_number}章",
            "chapter_number": co.chapter_number,
        }
        for co, chapter_id in rows
    ]
