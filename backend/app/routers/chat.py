import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.chat import ChatMessageResponse, ChatRequest
from app.services.chat_service import ChatService

router = APIRouter(tags=["chat"])


@router.get("/projects/{project_id}/chat/history", response_model=list[ChatMessageResponse])
async def get_chat_history(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    return await service.get_history(project_id)


@router.post("/projects/{project_id}/chat")
async def send_message(
    project_id: uuid.UUID,
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)

    async def event_stream():
        async for event in service.send_message_stream(
            project_id=project_id,
            message=data.message,
            model_id=data.model_id,
        ):
            yield f"data: {event}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/projects/{project_id}/chat/history")
async def clear_chat_history(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    await service.clear_history(project_id)
    return {"ok": True}
