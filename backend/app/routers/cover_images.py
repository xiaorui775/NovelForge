import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.cover_image import CoverImageGenerate, CoverImageResponse, CoverImageList
from app.services.cover_service import CoverService

router = APIRouter(prefix="/projects/{project_id}/covers", tags=["covers"])


@router.post("/generate", response_model=CoverImageResponse)
async def generate_cover(
    project_id: uuid.UUID,
    data: CoverImageGenerate,
    db: AsyncSession = Depends(get_db),
):
    service = CoverService(db)
    try:
        cover = await service.generate_cover(project_id, data)
        return cover
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=CoverImageList)
async def list_covers(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = CoverService(db)
    covers = await service.list_covers(project_id)
    return CoverImageList(items=covers)


@router.post("/{cover_id}/select", response_model=CoverImageResponse)
async def select_cover(
    project_id: uuid.UUID,
    cover_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = CoverService(db)
    try:
        cover = await service.select_cover(project_id, cover_id)
        return cover
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{cover_id}")
async def delete_cover(
    project_id: uuid.UUID,
    cover_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = CoverService(db)
    try:
        await service.delete_cover(project_id, cover_id)
        return {"message": "已删除"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
