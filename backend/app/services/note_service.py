from typing import Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.note import ProjectNote
from app.schemas.note import NoteCreate, NoteUpdate


class NoteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_notes(self, project_id: uuid.UUID, category: Optional[str] = None) -> list[ProjectNote]:
        query = select(ProjectNote).where(ProjectNote.project_id == project_id)
        if category:
            query = query.where(ProjectNote.category == category)
        query = query.order_by(ProjectNote.updated_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_note(self, note_id: uuid.UUID) -> Optional[ProjectNote]:
        result = await self.db.execute(select(ProjectNote).where(ProjectNote.id == note_id))
        return result.scalar_one_or_none()

    async def create_note(self, project_id: uuid.UUID, data: NoteCreate) -> ProjectNote:
        note = ProjectNote(project_id=project_id, **data.model_dump())
        self.db.add(note)
        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def update_note(self, note_id: uuid.UUID, data: NoteUpdate) -> Optional[ProjectNote]:
        note = await self.get_note(note_id)
        if not note:
            return None
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(note, field, value)
        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def delete_note(self, note_id: uuid.UUID) -> bool:
        note = await self.get_note(note_id)
        if not note:
            return False
        await self.db.delete(note)
        await self.db.flush()
        return True
