import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.character import (
    CharacterCreate,
    CharacterRelationCreate,
    CharacterRelationResponse,
    CharacterResponse,
    CharacterUpdate,
)
from app.services.character_service import CharacterService

router = APIRouter(prefix="/characters", tags=["characters"])


def get_service(db: AsyncSession = Depends(get_db)) -> CharacterService:
    return CharacterService(db)


@router.get("", response_model=list[CharacterResponse])
async def list_characters(service: CharacterService = Depends(get_service)):
    return await service.list_characters()


@router.post("", response_model=CharacterResponse, status_code=201)
async def create_character(data: CharacterCreate, service: CharacterService = Depends(get_service)):
    return await service.create_character(data)


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(character_id: uuid.UUID, service: CharacterService = Depends(get_service)):
    character = await service.get_character(character_id)
    if not character:
        raise HTTPException(status_code=404, detail="角色不存在")
    return character


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: uuid.UUID,
    data: CharacterUpdate,
    service: CharacterService = Depends(get_service),
):
    character = await service.update_character(character_id, data)
    if not character:
        raise HTTPException(status_code=404, detail="角色不存在")
    return character


@router.delete("/{character_id}", status_code=204)
async def delete_character(character_id: uuid.UUID, service: CharacterService = Depends(get_service)):
    if not await service.delete_character(character_id):
        raise HTTPException(status_code=404, detail="角色不存在")


# Relations
@router.get("/relations/all", response_model=list[CharacterRelationResponse])
async def list_all_relations(service: CharacterService = Depends(get_service)):
    return await service.list_all_relations()


@router.get("/{character_id}/relations", response_model=list[CharacterRelationResponse])
async def list_relations(character_id: uuid.UUID, service: CharacterService = Depends(get_service)):
    return await service.list_relations(character_id)


@router.post("/relations", response_model=CharacterRelationResponse, status_code=201)
async def create_relation(data: CharacterRelationCreate, service: CharacterService = Depends(get_service)):
    return await service.create_relation(data)


@router.delete("/relations/{relation_id}", status_code=204)
async def delete_relation(relation_id: uuid.UUID, service: CharacterService = Depends(get_service)):
    if not await service.delete_relation(relation_id):
        raise HTTPException(status_code=404, detail="关系不存在")
