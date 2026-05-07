import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.writing_goal import (
    ProjectGoalsProgress,
    WritingGoalCreate,
    WritingGoalProgress,
    WritingGoalResponse,
    WritingGoalUpdate,
)
from app.services.writing_goal_service import WritingGoalService

router = APIRouter(tags=["writing_goals"])


def get_service(db: AsyncSession = Depends(get_db)) -> WritingGoalService:
    return WritingGoalService(db)


@router.get("/projects/{project_id}/goals", response_model=list[WritingGoalResponse])
async def list_goals(project_id: uuid.UUID, service: WritingGoalService = Depends(get_service)):
    return await service.list_goals(project_id)


@router.post("/projects/{project_id}/goals", response_model=WritingGoalResponse, status_code=201)
async def create_goal(
    project_id: uuid.UUID,
    data: WritingGoalCreate,
    service: WritingGoalService = Depends(get_service),
):
    return await service.create_goal(project_id, data)


@router.get("/projects/{project_id}/goals/progress", response_model=ProjectGoalsProgress)
async def get_project_progress(project_id: uuid.UUID, service: WritingGoalService = Depends(get_service)):
    try:
        return await service.get_project_progress(project_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/goals/{goal_id}", response_model=WritingGoalResponse)
async def get_goal(goal_id: uuid.UUID, service: WritingGoalService = Depends(get_service)):
    goal = await service.get_goal(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")
    return goal


@router.put("/goals/{goal_id}", response_model=WritingGoalResponse)
async def update_goal(
    goal_id: uuid.UUID,
    data: WritingGoalUpdate,
    service: WritingGoalService = Depends(get_service),
):
    result = await service.update_goal(goal_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="目标不存在")
    return result


@router.delete("/goals/{goal_id}", status_code=204)
async def delete_goal(goal_id: uuid.UUID, service: WritingGoalService = Depends(get_service)):
    if not await service.delete_goal(goal_id):
        raise HTTPException(status_code=404, detail="目标不存在")


@router.get("/goals/{goal_id}/progress", response_model=WritingGoalProgress)
async def get_progress(goal_id: uuid.UUID, service: WritingGoalService = Depends(get_service)):
    try:
        return await service.get_progress(goal_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
