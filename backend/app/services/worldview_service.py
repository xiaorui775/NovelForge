from typing import Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.character import Character
from app.models.worldview import Worldview
from app.schemas.worldview import WorldviewCreate, WorldviewUpdate


class WorldviewService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_worldviews(self) -> list[Worldview]:
        result = await self.db.execute(select(Worldview).order_by(Worldview.name))
        return list(result.scalars().all())

    async def get_worldview(self, worldview_id: uuid.UUID) -> Optional[Worldview]:
        result = await self.db.execute(
            select(Worldview)
            .where(Worldview.id == worldview_id)
            .options(selectinload(Worldview.characters))
        )
        return result.scalar_one_or_none()

    async def create_worldview(self, data: WorldviewCreate) -> Worldview:
        worldview = Worldview(**data.model_dump())
        self.db.add(worldview)
        await self.db.flush()
        await self.db.refresh(worldview)
        return worldview

    async def update_worldview(self, worldview_id: uuid.UUID, data: WorldviewUpdate) -> Optional[Worldview]:
        worldview = await self.get_worldview(worldview_id)
        if not worldview:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(worldview, field, value)
        await self.db.flush()
        await self.db.refresh(worldview)
        return worldview

    async def delete_worldview(self, worldview_id: uuid.UUID) -> bool:
        worldview = await self.get_worldview(worldview_id)
        if not worldview:
            return False
        await self.db.delete(worldview)
        return True

    async def list_characters(self, worldview_id: uuid.UUID) -> list[Character]:
        worldview = await self.get_worldview(worldview_id)
        if not worldview:
            return []
        return list(worldview.characters)

    async def add_character(self, worldview_id: uuid.UUID, character_id: uuid.UUID) -> bool:
        worldview = await self.get_worldview(worldview_id)
        if not worldview:
            return False
        result = await self.db.execute(select(Character).where(Character.id == character_id))
        character = result.scalar_one_or_none()
        if not character:
            return False
        if character not in worldview.characters:
            worldview.characters.append(character)
        await self.db.flush()
        return True

    async def remove_character(self, worldview_id: uuid.UUID, character_id: uuid.UUID) -> bool:
        worldview = await self.get_worldview(worldview_id)
        if not worldview:
            return False
        result = await self.db.execute(select(Character).where(Character.id == character_id))
        character = result.scalar_one_or_none()
        if not character:
            return False
        if character in worldview.characters:
            worldview.characters.remove(character)
        await self.db.flush()
        return True
