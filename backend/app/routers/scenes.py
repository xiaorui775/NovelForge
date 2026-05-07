import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.scene import SceneCreate, SceneUpdate, SceneResponse
from app.services.scene_service import list_scenes, get_scene, create_scene, update_scene, delete_scene, reorder_scenes

router = APIRouter(prefix="/chapters/{chapter_id}/scenes", tags=["scenes"])


@router.get("", response_model=list[SceneResponse])
async def list_all(chapter_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await list_scenes(db, chapter_id)


@router.post("", response_model=SceneResponse)
async def create(chapter_id: uuid.UUID, data: SceneCreate, db: AsyncSession = Depends(get_db)):
    return await create_scene(db, chapter_id, data)


@router.put("/{scene_id}", response_model=SceneResponse)
async def update(scene_id: uuid.UUID, data: SceneUpdate, db: AsyncSession = Depends(get_db)):
    scene = await update_scene(db, scene_id, data)
    if not scene:
        raise HTTPException(status_code=404, detail="场景不存在")
    return scene


@router.delete("/{scene_id}")
async def delete(scene_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    if not await delete_scene(db, scene_id):
        raise HTTPException(status_code=404, detail="场景不存在")
    return {"ok": True}


@router.put("/reorder")
async def reorder(chapter_id: uuid.UUID, scene_ids: list[uuid.UUID], db: AsyncSession = Depends(get_db)):
    await reorder_scenes(db, chapter_id, scene_ids)
    return {"ok": True}
