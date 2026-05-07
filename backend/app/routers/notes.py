import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.note import NoteCreate, NoteResponse, NoteUpdate
from app.services.note_service import NoteService

router = APIRouter(tags=["notes"])


def get_service(db: AsyncSession = Depends(get_db)) -> NoteService:
    return NoteService(db)


@router.get("/projects/{project_id}/notes", response_model=list[NoteResponse])
async def list_notes(
    project_id: uuid.UUID,
    category: Optional[str] = Query(default=None),
    service: NoteService = Depends(get_service),
):
    return await service.list_notes(project_id, category)


@router.post("/projects/{project_id}/notes", response_model=NoteResponse, status_code=201)
async def create_note(
    project_id: uuid.UUID,
    data: NoteCreate,
    service: NoteService = Depends(get_service),
):
    return await service.create_note(project_id, data)


@router.get("/notes/{note_id}", response_model=NoteResponse)
async def get_note(note_id: uuid.UUID, service: NoteService = Depends(get_service)):
    note = await service.get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note


@router.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: uuid.UUID,
    data: NoteUpdate,
    service: NoteService = Depends(get_service),
):
    note = await service.update_note(note_id, data)
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return note


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(note_id: uuid.UUID, service: NoteService = Depends(get_service)):
    if not await service.delete_note(note_id):
        raise HTTPException(status_code=404, detail="笔记不存在")
