import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.series import (
    SeriesCreate,
    SeriesProjectReorder,
    SeriesResponse,
    SeriesUpdate,
)
from app.services.series_service import SeriesService

router = APIRouter(prefix="/series", tags=["series"])


def get_service(db: AsyncSession = Depends(get_db)) -> SeriesService:
    return SeriesService(db)


@router.get("", response_model=list[SeriesResponse])
async def list_series(service: SeriesService = Depends(get_service)):
    return await service.list_series()


@router.post("", response_model=SeriesResponse, status_code=201)
async def create_series(data: SeriesCreate, service: SeriesService = Depends(get_service)):
    return await service.create_series(data)


@router.get("/{series_id}", response_model=SeriesResponse)
async def get_series(series_id: uuid.UUID, service: SeriesService = Depends(get_service)):
    series = await service.get_series(series_id)
    if not series:
        raise HTTPException(status_code=404, detail="系列不存在")
    return series


@router.put("/{series_id}", response_model=SeriesResponse)
async def update_series(
    series_id: uuid.UUID,
    data: SeriesUpdate,
    service: SeriesService = Depends(get_service),
):
    series = await service.update_series(series_id, data)
    if not series:
        raise HTTPException(status_code=404, detail="系列不存在")
    return series


@router.delete("/{series_id}", status_code=204)
async def delete_series(series_id: uuid.UUID, service: SeriesService = Depends(get_service)):
    if not await service.delete_series(series_id):
        raise HTTPException(status_code=404, detail="系列不存在")


@router.post("/{series_id}/projects/{project_id}", response_model=SeriesResponse)
async def add_project_to_series(
    series_id: uuid.UUID,
    project_id: uuid.UUID,
    service: SeriesService = Depends(get_service),
):
    if not await service.add_project(series_id, project_id):
        raise HTTPException(status_code=400, detail="无法添加项目到系列")
    series = await service.get_series(series_id)
    return series


@router.delete("/{series_id}/projects/{project_id}", response_model=SeriesResponse)
async def remove_project_from_series(
    series_id: uuid.UUID,
    project_id: uuid.UUID,
    service: SeriesService = Depends(get_service),
):
    if not await service.remove_project(series_id, project_id):
        raise HTTPException(status_code=400, detail="无法从系列中移除项目")
    series = await service.get_series(series_id)
    return series


@router.put("/{series_id}/reorder", response_model=SeriesResponse)
async def reorder_projects(
    series_id: uuid.UUID,
    data: SeriesProjectReorder,
    service: SeriesService = Depends(get_service),
):
    await service.reorder_projects(series_id, data.project_ids)
    series = await service.get_series(series_id)
    if not series:
        raise HTTPException(status_code=404, detail="系列不存在")
    return series


@router.get("/predecessor-context/{project_id}")
async def get_predecessor_context(
    project_id: uuid.UUID,
    service: SeriesService = Depends(get_service),
):
    """获取系列前作上下文（供 AI 生成和聊天使用）"""
    result = await service.get_predecessor_context(project_id)
    if not result:
        return {"has_predecessor": False}
    result["has_predecessor"] = True
    return result
