import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.story_bible import StoryBibleCreate, StoryBibleResponse, StoryBibleUpdate
from app.services.story_bible_service import StoryBibleService

router = APIRouter(tags=["story_bible"])


def get_service(db: AsyncSession = Depends(get_db)) -> StoryBibleService:
    return StoryBibleService(db)


@router.get("/projects/{project_id}/story-bible", response_model=list[StoryBibleResponse])
async def list_entries(
    project_id: uuid.UUID,
    category: Optional[str] = Query(default=None),
    service: StoryBibleService = Depends(get_service),
):
    return await service.list_entries(project_id, category)


@router.post("/projects/{project_id}/story-bible", response_model=StoryBibleResponse, status_code=201)
async def create_entry(
    project_id: uuid.UUID,
    data: StoryBibleCreate,
    service: StoryBibleService = Depends(get_service),
):
    return await service.create_entry(project_id, data)


@router.get("/story-bible/search", response_model=list[StoryBibleResponse])
async def search_entries(
    project_id: uuid.UUID = Query(...),
    q: str = Query(...),
    service: StoryBibleService = Depends(get_service),
):
    return await service.search(project_id, q)


@router.get("/story-bible/{entry_id}", response_model=StoryBibleResponse)
async def get_entry(entry_id: uuid.UUID, service: StoryBibleService = Depends(get_service)):
    entry = await service.get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="故事圣经条目不存在")
    return entry


@router.put("/story-bible/{entry_id}", response_model=StoryBibleResponse)
async def update_entry(
    entry_id: uuid.UUID,
    data: StoryBibleUpdate,
    service: StoryBibleService = Depends(get_service),
):
    entry = await service.update_entry(entry_id, data)
    if not entry:
        raise HTTPException(status_code=404, detail="故事圣经条目不存在")
    return entry


@router.delete("/story-bible/{entry_id}", status_code=204)
async def delete_entry(entry_id: uuid.UUID, service: StoryBibleService = Depends(get_service)):
    if not await service.delete_entry(entry_id):
        raise HTTPException(status_code=404, detail="故事圣经条目不存在")
