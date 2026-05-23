import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.chat import ChatMessage
from app.models.chapter import Chapter
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
            referenced_chapter_id=data.referenced_chapter_id,
            referenced_text=data.referenced_text,
            context_mode=data.context_mode,
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


class ApplyActionRequest(BaseModel):
    message_id: uuid.UUID
    action_index: int = 0  # 当 suggested_action 是数组时，指定应用第几个


@router.post("/chat/apply-action")
async def apply_suggested_action(
    data: ApplyActionRequest,
    db: AsyncSession = Depends(get_db),
):
    """应用 AI 建议的改写操作到章节"""
    msg_result = await db.execute(select(ChatMessage).where(ChatMessage.id == data.message_id))
    msg = msg_result.scalar_one_or_none()
    if not msg or not msg.suggested_action:
        raise HTTPException(status_code=404, detail="未找到可应用的操作")

    try:
        parsed = json.loads(msg.suggested_action)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="操作数据格式错误")

    # 兼容：parsed 可能是单个对象或对象数组
    if isinstance(parsed, list):
        if data.action_index < 0 or data.action_index >= len(parsed):
            raise HTTPException(status_code=400, detail="操作索引超出范围")
        action = parsed[data.action_index]
        # 应用后从数组中移除该条
        parsed.pop(data.action_index)
        msg.suggested_action = json.dumps(parsed, ensure_ascii=False) if parsed else None
    else:
        action = parsed
        msg.suggested_action = None

    chapter_id = action.get("chapter_id")
    content = action.get("content", "")

    if not chapter_id or not content:
        raise HTTPException(status_code=400, detail="操作缺少章节ID或内容")

    chapter_result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
    chapter = chapter_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="章节不存在")

    chapter.content = content
    chapter.word_count = len(content)

    await db.commit()

    return {"ok": True, "word_count": len(content)}
