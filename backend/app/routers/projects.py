import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.chapter import Chapter
from app.models.generation import GenerationLog
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.schemas.project import (
    ProjectCreate,
    ProjectResponse,
    ProjectStatsResponse,
    ProjectUpdate,
)
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


def get_service(db: AsyncSession = Depends(get_db)) -> ProjectService:
    return ProjectService(db)


@router.get("", response_model=list[ProjectResponse])
async def list_projects(include_archived: bool = False, service: ProjectService = Depends(get_service)):
    return await service.list_projects(include_archived=include_archived)


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(data: ProjectCreate, service: ProjectService = Depends(get_service)):
    return await service.create_project(data)


@router.get("/trash", response_model=list[ProjectResponse])
async def list_trash(service: ProjectService = Depends(get_service)):
    """获取回收站中的项目"""
    return await service.list_deleted_projects()


@router.post("/trash/cleanup")
async def cleanup_trash(days: int = 30, service: ProjectService = Depends(get_service)):
    """清理超过指定天数的已删除项目"""
    count = await service.cleanup_old_deleted(days)
    return {"deleted_count": count}


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: uuid.UUID, service: ProjectService = Depends(get_service)):
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    service: ProjectService = Depends(get_service),
):
    project = await service.update_project(project_id, data)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: uuid.UUID, service: ProjectService = Depends(get_service)):
    """软删除：移到回收站"""
    if not await service.delete_project(project_id):
        raise HTTPException(status_code=404, detail="项目不存在")


@router.post("/{project_id}/restore", response_model=ProjectResponse)
async def restore_project(project_id: uuid.UUID, service: ProjectService = Depends(get_service)):
    """从回收站恢复"""
    project = await service.restore_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在或未在回收站中")
    return project


@router.delete("/{project_id}/permanent", status_code=204)
async def permanent_delete_project(project_id: uuid.UUID, service: ProjectService = Depends(get_service)):
    """永久删除"""
    if not await service.permanent_delete_project(project_id):
        raise HTTPException(status_code=404, detail="项目不存在或未在回收站中")


@router.get("/{project_id}/stats", response_model=ProjectStatsResponse)
async def get_project_stats(project_id: uuid.UUID, service: ProjectService = Depends(get_service)):
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return await service.get_project_stats(project_id)


@router.post("/{project_id}/archive", response_model=ProjectResponse)
async def archive_project(project_id: uuid.UUID, service: ProjectService = Depends(get_service)):
    project = await service.archive_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.post("/{project_id}/unarchive", response_model=ProjectResponse)
async def unarchive_project(project_id: uuid.UUID, service: ProjectService = Depends(get_service)):
    project = await service.unarchive_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.get("/{project_id}/timeline")
async def get_project_timeline(project_id: uuid.UUID, limit: int = 50, db: AsyncSession = Depends(get_db)):
    """获取项目的生成事件时间线"""
    limit = min(limit, 200)
    # Find all generation logs for this project
    result = await db.execute(
        select(GenerationLog, Chapter, ChapterOutline, ModelConfig)
        .join(Chapter, GenerationLog.chapter_id == Chapter.id)
        .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
        .join(Outline, ChapterOutline.outline_id == Outline.id)
        .outerjoin(ModelConfig, GenerationLog.model_id == ModelConfig.id)
        .where(Outline.project_id == project_id)
        .order_by(GenerationLog.created_at.desc())
        .limit(limit)
    )

    events = []
    for log, chapter, chapter_outline, model in result.all():
        events.append({
            "id": str(log.id),
            "status": log.status,
            "token_input": log.token_input,
            "token_output": log.token_output,
            "cost": float(log.cost),
            "duration_ms": log.duration_ms,
            "quality_score": float(log.quality_score) if log.quality_score else None,
            "model_name": model.name if model else None,
            "chapter": {
                "chapter_id": str(chapter.id),
                "chapter_number": chapter_outline.chapter_number,
                "title": chapter_outline.title,
                "word_count": chapter.word_count,
            },
            "created_at": log.created_at.isoformat(),
        })

    return events
