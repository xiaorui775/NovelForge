from typing import Optional
import uuid

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.story_bible import StoryBible
from app.schemas.story_bible import StoryBibleCreate, StoryBibleUpdate


class StoryBibleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_entries(self, project_id: uuid.UUID, category: Optional[str] = None) -> list[StoryBible]:
        query = select(StoryBible).where(StoryBible.project_id == project_id)
        if category:
            query = query.where(StoryBible.category == category)
        query = query.order_by(StoryBible.category, StoryBible.updated_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_entry(self, entry_id: uuid.UUID) -> Optional[StoryBible]:
        result = await self.db.execute(select(StoryBible).where(StoryBible.id == entry_id))
        return result.scalar_one_or_none()

    async def create_entry(self, project_id: uuid.UUID, data: StoryBibleCreate) -> StoryBible:
        entry = StoryBible(project_id=project_id, **data.model_dump())
        self.db.add(entry)
        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def update_entry(self, entry_id: uuid.UUID, data: StoryBibleUpdate) -> Optional[StoryBible]:
        entry = await self.get_entry(entry_id)
        if not entry:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(entry, field, value)
        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def delete_entry(self, entry_id: uuid.UUID) -> bool:
        entry = await self.get_entry(entry_id)
        if not entry:
            return False
        await self.db.delete(entry)
        await self.db.flush()
        return True

    async def search(self, project_id: uuid.UUID, query: str) -> list[StoryBible]:
        pattern = f"%{query}%"
        stmt = (
            select(StoryBible)
            .where(StoryBible.project_id == project_id)
            .where(or_(StoryBible.title.ilike(pattern), StoryBible.content.ilike(pattern)))
            .order_by(StoryBible.updated_at.desc())
            .limit(20)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
