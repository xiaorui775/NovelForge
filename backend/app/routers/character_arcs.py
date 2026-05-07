import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.character_appearance import (
    AppearanceCreate,
    AppearanceResponse,
    AppearanceUpdate,
)
from app.services.character_arc_service import CharacterArcService

router = APIRouter(tags=["character-arcs"])


def get_service(db: AsyncSession = Depends(get_db)) -> CharacterArcService:
    return CharacterArcService(db)


@router.post("/character-appearances", response_model=AppearanceResponse, status_code=201)
async def create_appearance(
    data: AppearanceCreate,
    service: CharacterArcService = Depends(get_service),
):
    return await service.add_appearance(
        data.character_id, data.chapter_outline_id, data.role_in_chapter, data.notes
    )


@router.put("/character-appearances/{appearance_id}", response_model=AppearanceResponse)
async def update_appearance(
    appearance_id: uuid.UUID,
    data: AppearanceUpdate,
    service: CharacterArcService = Depends(get_service),
):
    result = await service.update_appearance(appearance_id, data.role_in_chapter, data.notes)
    if not result:
        raise HTTPException(status_code=404, detail="出场记录不存在")
    return result


@router.delete("/character-appearances/{appearance_id}", status_code=204)
async def delete_appearance(
    appearance_id: uuid.UUID,
    service: CharacterArcService = Depends(get_service),
):
    if not await service.remove_appearance(appearance_id):
        raise HTTPException(status_code=404, detail="出场记录不存在")


@router.get("/characters/{character_id}/arc")
async def get_character_arc(
    character_id: uuid.UUID,
    service: CharacterArcService = Depends(get_service),
):
    result = await service.get_character_arc(character_id)
    if not result:
        raise HTTPException(status_code=404, detail="角色不存在")
    return result


@router.get("/outlines/{outline_id}/character-arc")
async def get_outline_arc(
    outline_id: uuid.UUID,
    service: CharacterArcService = Depends(get_service),
):
    return await service.get_outline_arc(outline_id)
