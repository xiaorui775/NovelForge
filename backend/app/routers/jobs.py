"""Job status polling endpoints.

Long-running AI jobs (post-write analysis, cover generation) are submitted to
``JobService`` and run in background asyncio tasks; the client polls here for
results. See ``app/services/job_service.py`` for the scope caveat
(single-process, no Redis).
"""
from fastapi import APIRouter, HTTPException

from app.services.job_service import job_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}")
async def get_job(job_id: str):
    record = job_service.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    return record.to_dict()
