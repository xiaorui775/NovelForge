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
        return await service.generate_full_outline(project_id, data.model_id, data.synopsis, force=data.force)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Failed to generate outline for project {project_id}")
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")
