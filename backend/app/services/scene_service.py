import uuid
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scene import Scene
from app.schemas.scene import SceneCreate, SceneUpdate


async def list_scenes(db: AsyncSession, chapter_id: uuid.UUID) -> list[Scene]:
    result = await db.execute(
        select(Scene).where(Scene.chapter_id == chapter_id).order_by(Scene.scene_number)
    )
    return list(result.scalars().all())


async def get_scene(db: AsyncSession, scene_id: uuid.UUID) -> Optional[Scene]:
    result = await db.execute(select(Scene).where(Scene.id == scene_id))
    return result.scalars().first()


async def create_scene(db: AsyncSession, chapter_id: uuid.UUID, data: SceneCreate) -> Scene:
    scene = Scene(chapter_id=chapter_id, **data.model_dump())
    db.add(scene)
    await db.commit()
    await db.refresh(scene)
    return scene


async def update_scene(db: AsyncSession, scene_id: uuid.UUID, data: SceneUpdate) -> Optional[Scene]:
    scene = await get_scene(db, scene_id)
    if not scene:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(scene, key, value)
    await db.commit()
    await db.refresh(scene)
    return scene


async def delete_scene(db: AsyncSession, scene_id: uuid.UUID) -> bool:
    scene = await get_scene(db, scene_id)
    if not scene:
        return False
    await db.delete(scene)
    await db.commit()
    return True


async def reorder_scenes(db: AsyncSession, chapter_id: uuid.UUID, scene_ids: list[uuid.UUID]) -> None:
    """Reorder scenes by providing scene IDs in desired order."""
    scenes = await list_scenes(db, chapter_id)
    scene_map = {s.id: s for s in scenes}
    for idx, sid in enumerate(scene_ids):
        if sid in scene_map:
            scene_map[sid].scene_number = idx + 1
    await db.commit()
