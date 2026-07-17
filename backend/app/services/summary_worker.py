"""ChapterSummary 后台维护。

设计动机（Phase 2 P1 任务「ChapterSummary 自动维护」）：此前摘要刷新全部是
**懒内联**——ChatService/ConsistencyService 在用户请求线程里补 / 重生成摘要，
每个 800-token LLM 流，导致 chat 单条消息最多额外 ~3×5-15s、cross-chapter 甚至
串行补遍所有章节。同时 generate/continue/rewrite/refine 覆写正文后**不标 stale**，
旧摘要继续被当作有效上下文。

本模块提供两个能力：
1. ``mark_summaries_stale(db, chapter_id)`` —— 内容变更后调用。把该章及**后续章节**
   在同一 outline 内的 ChapterSummary.is_stale 置 True（后文上下文可能已失效）。
   供 GenerationService 在生成/续写/改写正文后调用。
2. ``SummaryWorker`` —— 后台 asyncio 任务，周期扫描 ``is_stale = True`` 行并刷新，
   复用 ``GenerationService._generate_content_summary``（但独立 DB session）。

Chat/ConsistencyService 改为**只读**：发现 stale 不再内联补，直接用旧摘要，由 worker
异步刷新。语义安全（stale 即"可能过时"）。

**单进程内存任务**：与 JobService 同属进程内，重启即丢（个人单 backend 部署可接受）。
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.database import async_session
from app.models.chapter import Chapter
from app.models.outline import ChapterOutline
from app.models.chapter_summary import ChapterSummary

logger = logging.getLogger(__name__)


async def mark_summaries_stale(db, chapter_id: uuid.UUID) -> int:
    """将该章及同一 outline 内后续章节的 ChapterSummary 标记为 stale。

    返回受影响行数。供生成/续写/改写/精炼正文后调用。仅 UPDATE 已存在的摘要行；
    缺摘要的章节留给 worker 首刷 / 或一致性路径只读跳过。
    """
    # 找到该章 chapter_number 与 outline_id
    result = await db.execute(
        select(Chapter.chapter_outline_id, ChapterOutline.chapter_number)
        .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
        .where(Chapter.id == chapter_id)
    )
    row = result.first()
    if row is None:
        return 0
    outline_id, this_number = row
    # 同 outline 内 chapter_number >= 本章 的摘要置 stale
    stmt = (
        update(ChapterSummary)
        .where(
            ChapterSummary.chapter_id.in_(
                select(Chapter.id)
                .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
                .where(
                    ChapterOutline.outline_id == outline_id,
                    ChapterOutline.chapter_number >= this_number,
                )
            )
        )
        .values(is_stale=True, updated_at=datetime.now(timezone.utc))
    )
    res = await db.execute(stmt)
    await db.commit()
    return res.rowcount or 0


async def _drain_once() -> int:
    """扫一批 stale 摘要并刷新。返回处理的数量；0 表示无任务。"""
    from app.services.generation_service import GenerationService

    refreshed = 0
    async with async_session() as session:
        # 取一条 stale（避免一次锁太多、长时间持 session）
        result = await session.execute(
            select(ChapterSummary)
            .where(ChapterSummary.is_stale.is_(True))
            .order_by(ChapterSummary.updated_at.asc())
            .limit(1)
        )
        cs = result.scalar_one_or_none()
        if cs is None:
            return 0
        chapter_result = await session.execute(
            select(Chapter).where(Chapter.id == cs.chapter_id)
        )
        chapter = chapter_result.scalar_one_or_none()
        if chapter is None:
            # 章节已删，删孤儿摘要
            await session.delete(cs)
            await session.commit()
            return 1
        if not chapter.model_id:
            # 该章未配置模型，无法自动刷新；保持 stale，等用户配置后再排
            return 0
        # 取 model_config 链
        try:
            from app.services.common import load_chapter_chain_with_model
            chain = await load_chapter_chain_with_model(session, chapter.id, chapter.model_id)
        except ValueError:
            return 0
        model_config = chain["model_config"]
        service = GenerationService(session)
        try:
            await service._generate_content_summary(chapter, model_config)
            refreshed = 1
        except Exception:  # noqa: BLE001
            logger.exception("summary worker: refresh failed for chapter %s", chapter.id)
            await session.rollback()
    return refreshed


class SummaryWorker:
    """后台循环：每 ``interval`` 秒排空 stale 摘要。单例，由 main.py lifespan 启动。"""

    def __init__(self, interval: float = 60.0) -> None:
        self.interval = interval
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def _loop(self) -> None:
        logger.info("SummaryWorker started (interval=%ss)", self.interval)
        while not self._stop.is_set():
            try:
                # 尽量在一个循环里把已积累的 stale 行刷干净（限制单批上限避免饥饿）
                for _ in range(20):
                    n = await _drain_once()
                    if n == 0:
                        break
            except Exception:  # noqa: BLE001
                logger.exception("SummaryWorker loop error")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval)
            except asyncio.TimeoutError:
                continue
        logger.info("SummaryWorker stopped")

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=10)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()
            self._task = None


summary_worker = SummaryWorker()
