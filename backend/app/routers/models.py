import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.model_config import (
    ModelConfigCreate,
    ModelConfigResponse,
    ModelConfigUpdate,
    ModelTestResponse,
)
from app.services.model_service import ModelService

router = APIRouter(prefix="/models", tags=["models"])


def get_service(db: AsyncSession = Depends(get_db)) -> ModelService:
    return ModelService(db)


@router.get("", response_model=list[ModelConfigResponse])
async def list_models(service: ModelService = Depends(get_service)):
    return await service.list_models()


@router.post("", response_model=ModelConfigResponse, status_code=201)
async def create_model(data: ModelConfigCreate, service: ModelService = Depends(get_service)):
    return await service.create_model(data)


@router.get("/{model_id}", response_model=ModelConfigResponse)
async def get_model(model_id: uuid.UUID, service: ModelService = Depends(get_service)):
    model = await service.get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    return model


@router.put("/{model_id}", response_model=ModelConfigResponse)
async def update_model(
    model_id: uuid.UUID,
    data: ModelConfigUpdate,
    service: ModelService = Depends(get_service),
):
    model = await service.update_model(model_id, data)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    return model


@router.delete("/{model_id}", status_code=204)
async def delete_model(model_id: uuid.UUID, service: ModelService = Depends(get_service)):
    if not await service.delete_model(model_id):
        raise HTTPException(status_code=404, detail="模型不存在")


@router.post("/{model_id}/test", response_model=ModelTestResponse)
async def test_model(model_id: uuid.UUID, service: ModelService = Depends(get_service)):
    result = await service.test_model(model_id)
    return result
