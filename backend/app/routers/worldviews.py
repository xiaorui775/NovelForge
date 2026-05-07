import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.character import CharacterResponse
from app.schemas.worldview import WorldviewCreate, WorldviewResponse, WorldviewUpdate
from app.services.worldview_service import WorldviewService

router = APIRouter(prefix="/worldviews", tags=["worldviews"])


def get_service(db: AsyncSession = Depends(get_db)) -> WorldviewService:
    return WorldviewService(db)


@router.get("", response_model=list[WorldviewResponse])
async def list_worldviews(service: WorldviewService = Depends(get_service)):
    return await service.list_worldviews()


@router.post("", response_model=WorldviewResponse, status_code=201)
async def create_worldview(data: WorldviewCreate, service: WorldviewService = Depends(get_service)):
    return await service.create_worldview(data)


@router.get("/{worldview_id}", response_model=WorldviewResponse)
async def get_worldview(worldview_id: uuid.UUID, service: WorldviewService = Depends(get_service)):
    worldview = await service.get_worldview(worldview_id)
    if not worldview:
        raise HTTPException(status_code=404, detail="世界观不存在")
    return worldview


@router.put("/{worldview_id}", response_model=WorldviewResponse)
async def update_worldview(
    worldview_id: uuid.UUID,
    data: WorldviewUpdate,
    service: WorldviewService = Depends(get_service),
):
    worldview = await service.update_worldview(worldview_id, data)
    if not worldview:
        raise HTTPException(status_code=404, detail="世界观不存在")
    return worldview


@router.delete("/{worldview_id}", status_code=204)
async def delete_worldview(worldview_id: uuid.UUID, service: WorldviewService = Depends(get_service)):
    if not await service.delete_worldview(worldview_id):
        raise HTTPException(status_code=404, detail="世界观不存在")


@router.get("/{worldview_id}/characters", response_model=list[CharacterResponse])
async def list_characters(
    worldview_id: uuid.UUID,
    service: WorldviewService = Depends(get_service),
):
    return await service.list_characters(worldview_id)


@router.post("/{worldview_id}/characters/{character_id}", status_code=204)
async def add_character(
    worldview_id: uuid.UUID,
    character_id: uuid.UUID,
    service: WorldviewService = Depends(get_service),
):
    if not await service.add_character(worldview_id, character_id):
        raise HTTPException(status_code=404, detail="世界观或角色不存在")


@router.delete("/{worldview_id}/characters/{character_id}", status_code=204)
async def remove_character(
    worldview_id: uuid.UUID,
    character_id: uuid.UUID,
    service: WorldviewService = Depends(get_service),
):
    if not await service.remove_character(worldview_id, character_id):
        raise HTTPException(status_code=404, detail="世界观或角色不存在")
