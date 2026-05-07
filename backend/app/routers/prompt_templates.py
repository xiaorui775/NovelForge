from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.prompt_template import (
    PromptTemplateCreate,
    PromptTemplateResponse,
    PromptTemplateUpdate,
)
from app.services.prompt_template_service import PromptTemplateService

router = APIRouter(prefix="/prompt-templates", tags=["prompt-templates"])


def get_service(db: AsyncSession = Depends(get_db)) -> PromptTemplateService:
    return PromptTemplateService(db)


@router.get("", response_model=list[PromptTemplateResponse])
async def list_templates(
    type: Optional[str] = Query(default=None),
    service: PromptTemplateService = Depends(get_service),
):
    return await service.list_templates(template_type=type)


@router.get("/{template_id}", response_model=PromptTemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    service: PromptTemplateService = Depends(get_service),
):
    template = await service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


@router.post("", response_model=PromptTemplateResponse, status_code=201)
async def create_template(
    data: PromptTemplateCreate,
    service: PromptTemplateService = Depends(get_service),
):
    return await service.create_template(data)


@router.put("/{template_id}", response_model=PromptTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    data: PromptTemplateUpdate,
    service: PromptTemplateService = Depends(get_service),
):
    template = await service.update_template(template_id, data)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: uuid.UUID,
    service: PromptTemplateService = Depends(get_service),
):
    if not await service.delete_template(template_id):
        raise HTTPException(status_code=404, detail="模板不存在")


@router.post("/{template_id}/set-default", response_model=PromptTemplateResponse)
async def set_default(
    template_id: uuid.UUID,
    service: PromptTemplateService = Depends(get_service),
):
    template = await service.set_default(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template
