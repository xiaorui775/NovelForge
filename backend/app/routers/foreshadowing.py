import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.foreshadowing import (
    ForeshadowingCreate,
    ForeshadowingResponse,
    ForeshadowingScanRequest,
    ForeshadowingUpdate,
)
from app.services.foreshadowing_service import ForeshadowingService

router = APIRouter(tags=["foreshadowing"])


@router.get("/projects/{project_id}/foreshadowings", response_model=list[ForeshadowingResponse])
async def list_foreshadowings(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = ForeshadowingService(db)
    return await service.list_by_project(project_id)


@router.post("/projects/{project_id}/foreshadowings", response_model=ForeshadowingResponse)
async def create_foreshadowing(
    project_id: uuid.UUID,
    data: ForeshadowingCreate,
    db: AsyncSession = Depends(get_db),
):
    service = ForeshadowingService(db)
    try:
        return await service.create(project_id, data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/foreshadowings/{foreshadowing_id}", response_model=ForeshadowingResponse)
async def update_foreshadowing(
    foreshadowing_id: uuid.UUID,
    data: ForeshadowingUpdate,
    db: AsyncSession = Depends(get_db),
):
    service = ForeshadowingService(db)
    try:
        return await service.update(foreshadowing_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/foreshadowings/{foreshadowing_id}")
async def delete_foreshadowing(
    foreshadowing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = ForeshadowingService(db)
    try:
        await service.delete(foreshadowing_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/projects/{project_id}/foreshadowings/scan")
async def scan_foreshadowings(
    project_id: uuid.UUID,
    data: ForeshadowingScanRequest,
    db: AsyncSession = Depends(get_db),
):
    service = ForeshadowingService(db)
    try:
        return await service.scan_chapters(project_id, data.model_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"伏笔扫描失败: {type(e).__name__}: {str(e)}")
