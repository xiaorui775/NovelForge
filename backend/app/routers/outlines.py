import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.outline import (
    ChapterOutlineCreate,
    ChapterOutlineReorder,
    ChapterOutlineResponse,
    ChapterOutlineUpdate,
    OutlineCreate,
    OutlineResponse,
    OutlineUpdate,
)
from app.services.outline_service import OutlineService

router = APIRouter(tags=["outlines"])

logger = logging.getLogger(__name__)


class ModelIdRequest(BaseModel):
    model_id: uuid.UUID


class GenerateOutlineRequest(BaseModel):
    model_id: uuid.UUID
    synopsis: str = ""
    force: bool = False
    total_chapters: int = 20
    pacing_style: str = ""  # fast/slow/balanced


class SplitChapterRequest(BaseModel):
    split_position: int  # 在第 N 段之后拆分（1-based）


class MergeChaptersRequest(BaseModel):
    chapter_outline_id_2: uuid.UUID  # 被合并的章节（合并到当前章节之后）


def get_service(db: AsyncSession = Depends(get_db)) -> OutlineService:
    return OutlineService(db)


# --- Outline endpoints ---

@router.get("/projects/{project_id}/outline", response_model=OutlineResponse)
async def get_outline(project_id: uuid.UUID, service: OutlineService = Depends(get_service)):
    outline = await service.get_outline(project_id)
    if not outline:
        raise HTTPException(status_code=404, detail="大纲不存在")
    return outline


@router.post("/projects/{project_id}/outline", response_model=OutlineResponse, status_code=201)
async def create_outline(
    project_id: uuid.UUID,
    data: OutlineCreate,
    service: OutlineService = Depends(get_service),
):
    existing = await service.get_outline(project_id)
    if existing:
        raise HTTPException(status_code=400, detail="该项目已有大纲")
    return await service.create_outline(project_id, data)


@router.put("/outlines/{outline_id}", response_model=OutlineResponse)
async def update_outline(
    outline_id: uuid.UUID,
    data: OutlineUpdate,
    service: OutlineService = Depends(get_service),
):
    outline = await service.update_outline(outline_id, data)
    if not outline:
        raise HTTPException(status_code=404, detail="大纲不存在")
    return outline


# --- Chapter Outline endpoints ---

@router.get("/outlines/{outline_id}/chapters", response_model=list[ChapterOutlineResponse])
async def list_chapter_outlines(
    outline_id: uuid.UUID,
    service: OutlineService = Depends(get_service),
):
    return await service.list_chapter_outlines(outline_id)


@router.post("/outlines/{outline_id}/chapters", response_model=ChapterOutlineResponse, status_code=201)
async def create_chapter_outline(
    outline_id: uuid.UUID,
    data: ChapterOutlineCreate,
    service: OutlineService = Depends(get_service),
):
    return await service.create_chapter_outline(outline_id, data)


@router.get("/chapter-outlines/{chapter_outline_id}", response_model=ChapterOutlineResponse)
async def get_chapter_outline(
    chapter_outline_id: uuid.UUID,
    service: OutlineService = Depends(get_service),
):
    result = await service.get_chapter_outline(chapter_outline_id)
    if not result:
        raise HTTPException(status_code=404, detail="章节概述不存在")
    return result


@router.put("/chapter-outlines/{chapter_outline_id}", response_model=ChapterOutlineResponse)
async def update_chapter_outline(
    chapter_outline_id: uuid.UUID,
    data: ChapterOutlineUpdate,
    service: OutlineService = Depends(get_service),
):
    result = await service.update_chapter_outline(chapter_outline_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="章节概述不存在")
    return result


@router.delete("/chapter-outlines/{chapter_outline_id}", status_code=204)
async def delete_chapter_outline(
    chapter_outline_id: uuid.UUID,
    service: OutlineService = Depends(get_service),
):
    if not await service.delete_chapter_outline(chapter_outline_id):
        raise HTTPException(status_code=404, detail="章节概述不存在")


@router.put("/outlines/{outline_id}/chapters/reorder", response_model=list[ChapterOutlineResponse])
async def reorder_chapter_outlines(
    outline_id: uuid.UUID,
    items: list[ChapterOutlineReorder],
    service: OutlineService = Depends(get_service),
):
    if len(items) > 100:
        raise HTTPException(status_code=400, detail="单次排序不能超过 100 项")
    return await service.reorder_chapter_outlines(outline_id, items)


# --- AI Generation endpoints ---

@router.post("/chapter-outlines/{chapter_outline_id}/expand-detail", response_model=ChapterOutlineResponse)
async def expand_detail_outline(
    chapter_outline_id: uuid.UUID,
    data: ModelIdRequest,
    service: OutlineService = Depends(get_service),
):
    try:
        return await service.expand_detail_outline(chapter_outline_id, data.model_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成细纲失败: {type(e).__name__}: {str(e)}")


@router.post("/outlines/{outline_id}/reverse-outline")
async def generate_reverse_outline(
    outline_id: uuid.UUID,
    data: ModelIdRequest,
    service: OutlineService = Depends(get_service),
):
    """生成反向大纲：对比计划与实际内容"""
    try:
        return await service.generate_reverse_outline(outline_id, data.model_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"反向大纲生成失败: {type(e).__name__}: {str(e)}")


@router.post("/projects/{project_id}/outline/generate", response_model=OutlineResponse, status_code=201)
async def generate_outline(
    project_id: uuid.UUID,
    data: GenerateOutlineRequest,
    service: OutlineService = Depends(get_service),
):
    try:
        return await service.generate_full_outline(
            project_id, data.model_id, data.synopsis,
            force=data.force, total_chapters=data.total_chapters, pacing_style=data.pacing_style,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to generate outline for project {project_id}")
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")


@router.post("/chapter-outlines/{chapter_outline_id}/split", response_model=list[ChapterOutlineResponse])
async def split_chapter(
    chapter_outline_id: uuid.UUID,
    data: SplitChapterRequest,
    db: AsyncSession = Depends(get_db),
):
    """拆分章节：在指定段落后一分为二，创建新 ChapterOutline，后半内容迁移"""
    from sqlalchemy import select
    from app.models.chapter import Chapter, ChapterVersion
    from app.models.outline import ChapterOutline, Outline

    # 加载原章节大纲
    co_result = await db.execute(
        select(ChapterOutline).where(ChapterOutline.id == chapter_outline_id)
    )
    original_co = co_result.scalar_one_or_none()
    if not original_co:
        raise HTTPException(status_code=404, detail="章节概述不存在")

    # 加载章节内容
    ch_result = await db.execute(
        select(Chapter).where(Chapter.chapter_outline_id == chapter_outline_id)
    )
    original_ch = ch_result.scalar_one_or_none()

    if not original_ch or not original_ch.content:
        raise HTTPException(status_code=400, detail="章节无内容，无法拆分")

    # 按双换行分段
    paragraphs = [p for p in original_ch.content.split("\n\n") if p.strip()]
    if data.split_position < 1 or data.split_position >= len(paragraphs):
        raise HTTPException(status_code=400, detail=f"拆分位置应在 1 到 {len(paragraphs) - 1} 之间")

    # 更新原文：前半
    first_half = "\n\n".join(paragraphs[:data.split_position])
    second_half = "\n\n".join(paragraphs[data.split_position:])

    original_ch.content = first_half
    original_ch.word_count = len(first_half)
    original_co.summary = (original_co.summary or "")[:200]

    # 后续章节号全部 +1
    all_co_result = await db.execute(
        select(ChapterOutline)
        .where(
            ChapterOutline.outline_id == original_co.outline_id,
            ChapterOutline.chapter_number > original_co.chapter_number,
        )
        .order_by(ChapterOutline.chapter_number.desc())
    )
    for co in all_co_result.scalars().all():
        co.chapter_number += 1

    # 创建新章节大纲
    new_co = ChapterOutline(
        outline_id=original_co.outline_id,
        chapter_number=original_co.chapter_number + 1,
        title=f"（拆分自第{original_co.chapter_number}章）",
        summary="",
        sort_order=original_co.sort_order + 1 if original_co.sort_order else None,
    )
    db.add(new_co)
    await db.flush()
    await db.refresh(new_co)

    # 创建新章节
    new_ch = Chapter(
        chapter_outline_id=new_co.id,
        content=second_half,
        word_count=len(second_half),
        status="completed",
    )
    db.add(new_ch)

    await db.flush()
    await db.refresh(original_co)
    await db.refresh(new_co)

    return [original_co, new_co]


@router.post("/chapter-outlines/{chapter_outline_id}/merge", response_model=ChapterOutlineResponse)
async def merge_chapters(
    chapter_outline_id: uuid.UUID,
    data: MergeChaptersRequest,
    db: AsyncSession = Depends(get_db),
):
    """合并章节：将 chapter_outline_id_2 的内容合并到当前章节，删除后者"""
    from sqlalchemy import select
    from app.models.chapter import Chapter, ChapterVersion
    from app.models.outline import ChapterOutline

    # 加载两个章节大纲
    co1_result = await db.execute(
        select(ChapterOutline).where(ChapterOutline.id == chapter_outline_id)
    )
    co1 = co1_result.scalar_one_or_none()
    if not co1:
        raise HTTPException(status_code=404, detail="第一个章节概述不存在")

    co2_result = await db.execute(
        select(ChapterOutline).where(ChapterOutline.id == data.chapter_outline_id_2)
    )
    co2 = co2_result.scalar_one_or_none()
    if not co2:
        raise HTTPException(status_code=404, detail="第二个章节概述不存在")

    if co2.chapter_number != co1.chapter_number + 1:
        raise HTTPException(status_code=400, detail="只能合并相邻章节")

    # 加载两个章节
    ch1_result = await db.execute(
        select(Chapter).where(Chapter.chapter_outline_id == chapter_outline_id)
    )
    ch1 = ch1_result.scalar_one_or_none()

    ch2_result = await db.execute(
        select(Chapter).where(Chapter.chapter_outline_id == data.chapter_outline_id_2)
    )
    ch2 = ch2_result.scalar_one_or_none()

    # 合并内容
    content1 = (ch1.content or "") if ch1 else ""
    content2 = (ch2.content or "") if ch2 else ""
    merged_content = (content1 + "\n\n" + content2).strip() if content1 and content2 else content1 or content2

    if ch1:
        ch1.content = merged_content
        ch1.word_count = len(merged_content)
        ch1.status = "completed" if merged_content else "empty"
    else:
        ch1 = Chapter(chapter_outline_id=chapter_outline_id, content=merged_content, word_count=len(merged_content), status="completed" if merged_content else "empty")
        db.add(ch1)

    # 合并摘要
    parts = []
    if co1.summary:
        parts.append(co1.summary)
    if co2.summary:
        parts.append(co2.summary)
    co1.summary = "\n".join(parts) if parts else ""

    # 删除第二个章节大纲（ORM 删除触发级联）
    await db.delete(co2)

    # 后续章节号全部 -1
    all_co_result = await db.execute(
        select(ChapterOutline)
        .where(
            ChapterOutline.outline_id == co1.outline_id,
            ChapterOutline.chapter_number > co2.chapter_number,
        )
        .order_by(ChapterOutline.chapter_number)
    )
    for co in all_co_result.scalars().all():
        co.chapter_number -= 1

    await db.flush()
    await db.refresh(co1)
    return co1
