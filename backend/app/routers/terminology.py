import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.terminology import TerminologyCreate, TerminologyResponse, TerminologyUpdate
from app.services.terminology_service import TerminologyService

router = APIRouter(tags=["terminology"])


def get_service(db: AsyncSession = Depends(get_db)) -> TerminologyService:
    return TerminologyService(db)


@router.get("/projects/{project_id}/terminology", response_model=list[TerminologyResponse])
async def list_terminologies(project_id: uuid.UUID, service: TerminologyService = Depends(get_service)):
    return await service.list_terminologies(project_id)


@router.post("/projects/{project_id}/terminology", response_model=TerminologyResponse, status_code=201)
async def create_terminology(
    project_id: uuid.UUID,
    data: TerminologyCreate,
    service: TerminologyService = Depends(get_service),
):
    return await service.create_terminology(project_id, data)


@router.put("/terminology/{terminology_id}", response_model=TerminologyResponse)
async def update_terminology(
    terminology_id: uuid.UUID,
    data: TerminologyUpdate,
    service: TerminologyService = Depends(get_service),
):
    result = await service.update_terminology(terminology_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="术语不存在")
    return result


@router.delete("/terminology/{terminology_id}", status_code=204)
async def delete_terminology(terminology_id: uuid.UUID, service: TerminologyService = Depends(get_service)):
    if not await service.delete_terminology(terminology_id):
        raise HTTPException(status_code=404, detail="术语不存在")


@router.get("/projects/{project_id}/terminology/check")
async def check_consistency(project_id: uuid.UUID, service: TerminologyService = Depends(get_service)):
    return await service.check_consistency(project_id)
