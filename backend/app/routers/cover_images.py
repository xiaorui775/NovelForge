import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.cover_image import CoverImageGenerate, CoverImageResponse, CoverImageList
from app.services.cover_service import CoverService

router = APIRouter(prefix="/projects/{project_id}/covers", tags=["covers"])


@router.post("/generate")
async def generate_cover(
    project_id: uuid.UUID,
    data: CoverImageGenerate,
    db: AsyncSession = Depends(get_db),
):
    """生成封面图（10-60s），后台异步执行。立即返回 job_id，
    前端轮询 ``GET /api/jobs/{job_id}``，``result`` 为 CoverImageResponse 等价 dict。"""
    from app.services.job_service import job_service
    from app.database import async_session
    from app.services.cover_service import CoverService

    payload = data.model_dump()
    # model_id dump 后是 uuid -> 转 str 以便后台边界可序列化
    payload["model_id"] = str(payload["model_id"])

    async def _run(record):
        async with async_session() as session:
            try:
                # 重建 data 以复用 schema 校验
                req = CoverImageGenerate(**payload)
                service = CoverService(session)
                cover = await service.generate_cover(project_id, req)
                # 返回与 CoverImageResponse 一致的 dict
                return CoverImageResponse.model_validate(cover).model_dump(mode="json")
            except Exception:
                await session.rollback()
                raise

    job_id = job_service.submit("cover", {"project_id": str(project_id), "prompt": data.prompt}, _run)
    return {"job_id": job_id, "status": "pending"}


@router.get("", response_model=CoverImageList)
async def list_covers(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = CoverService(db)
    covers = await service.list_covers(project_id)
    return CoverImageList(items=covers)


@router.post("/{cover_id}/select", response_model=CoverImageResponse)
async def select_cover(
    project_id: uuid.UUID,
    cover_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = CoverService(db)
    try:
        cover = await service.select_cover(project_id, cover_id)
        return cover
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{cover_id}")
async def delete_cover(
    project_id: uuid.UUID,
    cover_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    service = CoverService(db)
    try:
        await service.delete_cover(project_id, cover_id)
        return {"message": "已删除"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
