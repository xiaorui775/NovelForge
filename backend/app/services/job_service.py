"""轻量异步任务系统（进程内，无 Redis/Celery）。

适用场景：个人创作者单 backend 进程部署。用户触发的长耗时 AI 调用（post-write
综合分析、封面生成等）发起后台任务后立即返回 ``job_id``，前端轮询 ``GET /jobs/{id}``
取结果。

**不适用于多副本 / 水平扩展**：任务记录存在单进程内存，多 worker 间不共享、重启即丢。
对当前单 docker backend 部署足够；如需横向扩展再换 Redis/Celery。

任务协程需自行通过 ``async_session`` 创建独立 DB session（请求 session 随响应结束）。
"""
import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class JobRecord:
    id: str
    kind: str
    params: dict
    status: JobStatus = JobStatus.PENDING
    result: Any = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status.value,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class JobService:
    """进程内任务注册表 + asyncio 调度。单例。"""

    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}

    def submit(
        self,
        kind: str,
        params: dict,
        coro_factory: Callable[[JobRecord], Awaitable[Any]],
    ) -> str:
        """创建任务记录并立即用 asyncio.create_task 起后台协程。

        ``coro_factory(record)`` 接收任务记录（可读 params），返回终态结果。内部 try/except
        会把成功/失败写回 record。任务协程自行管理 DB session 生命周期。
        """
        job_id = uuid.uuid4().hex
        record = JobRecord(id=job_id, kind=kind, params=dict(params))
        self._jobs[job_id] = record

        async def _runner() -> None:
            record.status = JobStatus.RUNNING
            record.updated_at = datetime.now(timezone.utc)
            try:
                result = await coro_factory(record)
                record.result = result
                record.status = JobStatus.COMPLETED
            except Exception as e:  # noqa: BLE001 — 任意后台失败都要落库可查
                logger.exception("job %s (%s) failed", job_id, kind)
                record.error = f"{type(e).__name__}: {e}"
                record.status = JobStatus.FAILED
            finally:
                record.updated_at = datetime.now(timezone.utc)

        # create_task 让协程脱离请求生命周期在事件循环中后台运行
        asyncio.create_task(_runner())
        return job_id

    def get(self, job_id: str) -> JobRecord | None:
        return self._jobs.get(job_id)


# 全局单例。main.py lifespan 不需要特殊初始化。
job_service = JobService()
