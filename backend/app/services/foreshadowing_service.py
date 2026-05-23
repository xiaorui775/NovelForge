import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.foreshadowing import Foreshadowing
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.utils.json_extract import extract_json

logger = logging.getLogger(__name__)


class ForeshadowingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_project(self, project_id: uuid.UUID) -> list[Foreshadowing]:
        result = await self.db.execute(
            select(Foreshadowing)
            .where(Foreshadowing.project_id == project_id)
            .order_by(Foreshadowing.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, project_id: uuid.UUID, data) -> Foreshadowing:
        item = Foreshadowing(project_id=project_id, **data.model_dump(exclude_unset=True))
        self.db.add(item)
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def update(self, foreshadowing_id: uuid.UUID, data) -> Foreshadowing:
        result = await self.db.execute(
            select(Foreshadowing).where(Foreshadowing.id == foreshadowing_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("伏笔不存在")

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(item, field, value)

        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def delete(self, foreshadowing_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(Foreshadowing).where(Foreshadowing.id == foreshadowing_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("伏笔不存在")
        await self.db.delete(item)
        await self.db.flush()

    async def scan_chapters(self, project_id: uuid.UUID, model_id: uuid.UUID) -> list[dict]:
        """AI 扫描章节，识别伏笔（分批处理，避免撑爆上下文）"""
        # 获取模型配置
        model_result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
        model_config = model_result.scalar_one_or_none()
        if not model_config:
            raise ValueError("模型不存在")

        # 获取项目
        project_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError("项目不存在")

        # 获取所有已完成章节（含摘要）
        from app.models.chapter_summary import ChapterSummary

        chapters_result = await self.db.execute(
            select(Chapter, ChapterOutline, ChapterSummary)
            .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
            .join(Outline, ChapterOutline.outline_id == Outline.id)
            .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
            .where(Outline.project_id == project_id, Chapter.status == "completed")
            .order_by(ChapterOutline.chapter_number)
        )
        chapters = chapters_result.all()

        if not chapters:
            raise ValueError("没有已完成的章节可供扫描")

        adapter = AdapterFactory.create(model_config)

        # 分批扫描，每批 3 章以控制 token 消耗
        batch_size = 3
        all_results = []
        seen_descriptions = set()

        for batch_start in range(0, len(chapters), batch_size):
            batch = chapters[batch_start:batch_start + batch_size]

            chapter_texts = []
            for chapter, chapter_outline, cs in batch:
                if cs and (cs.events or cs.character_states or cs.unresolved_hooks):
                    # 有结构化摘要时优先使用，大幅省 token
                    parts = [f"第{chapter_outline.chapter_number}章「{chapter_outline.title or '无标题'}」"]
                    if cs.events:
                        parts.append(f"事件: {cs.events}")
                    if cs.character_states:
                        parts.append(f"角色状态: {cs.character_states}")
                    if cs.unresolved_hooks:
                        parts.append(f"未回收悬念: {cs.unresolved_hooks}")
                    if cs.resolved_hooks:
                        parts.append(f"已回收伏笔: {cs.resolved_hooks}")
                    chapter_texts.append("\n".join(parts))
                else:
                    # 降级：截取正文尾部（尾部更有伏笔线索）
                    content = chapter.content or ""
                    content_excerpt = content[-2000:] if len(content) > 2000 else content
                    chapter_texts.append(
                        f"第{chapter_outline.chapter_number}章「{chapter_outline.title or '无标题'}」\n{content_excerpt}"
                    )

            messages = [
                {
                    "role": "system",
                    "content": (
                        "你是一位资深的文学编辑，擅长识别小说中的伏笔和悬念。\n\n"
                        "请仔细阅读以下小说章节内容，识别其中埋设的伏笔。\n"
                        "伏笔是指作者有意安排的细节、暗示或悬念，预期在后续章节中得到解答或回收。\n\n"
                        "请严格以 JSON 数组格式输出，不要包含其他内容：\n"
                        '[{"description": "伏笔描述", "plant_chapter_number": 1, "confidence": 0.8}]\n\n'
                        "description: 伏笔的简要描述\n"
                        "plant_chapter_number: 埋设伏笔的章节号\n"
                        "confidence: 置信度 0-1，越高越确定是有意的伏笔"
                    ),
                },
                {
                    "role": "user",
                    "content": f"小说类型：{project.genre or '未知'}\n\n" + "\n---\n".join(chapter_texts),
                },
            ]

            try:
                result = await adapter.generate(messages, max_tokens=2000)
            except Exception as e:
                logger.error(f"AI 模型调用失败: {e}")
                raise ValueError(f"AI 模型调用失败: {type(e).__name__}: {str(e)}")

            raw = result["content"].strip()
            if not raw:
                continue

            # 提取 JSON
            try:
                data = extract_json(result["content"])
            except ValueError as e:
                logger.warning(f"伏笔扫描 JSON 解析失败: {e}")
                continue

            if not isinstance(data, list):
                continue

            # 建立当前批次的章节号 -> chapter_outline_id 映射
            chapter_map = {}
            for _, co, _ in batch:
                chapter_map[co.chapter_number] = co.id
            # 也加入全局映射（伏笔可能引用更早章节号）
            for _, co, _ in chapters:
                chapter_map[co.chapter_number] = co.id

            for item in data:
                if not isinstance(item, dict):
                    continue
                desc = item.get("description", "")
                # 去重：相同描述不重复添加
                desc_key = desc[:50]
                if desc_key in seen_descriptions:
                    continue
                seen_descriptions.add(desc_key)

                ch_num = item.get("plant_chapter_number", 0)
                all_results.append({
                    "description": desc,
                    "plant_chapter_number": ch_num,
                    "plant_chapter_id": str(chapter_map.get(ch_num)) if ch_num in chapter_map else None,
                    "confidence": min(1, max(0, float(item.get("confidence", 0.5)))),
                })

        return all_results
