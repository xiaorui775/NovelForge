import json
import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.foreshadowing import Foreshadowing
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project

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
        """AI 扫描章节，识别伏笔"""
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

        # 获取所有已完成章节
        chapters_result = await self.db.execute(
            select(Chapter, ChapterOutline)
            .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
            .join(Outline, ChapterOutline.outline_id == Outline.id)
            .where(Outline.project_id == project_id, Chapter.status == "completed")
            .order_by(ChapterOutline.chapter_number)
        )
        chapters = chapters_result.all()

        if not chapters:
            raise ValueError("没有已完成的章节可供扫描")

        # 构建章节内容摘要
        chapter_texts = []
        for chapter, chapter_outline in chapters:
            content_excerpt = (chapter.content or "")[:2000]
            chapter_texts.append(
                f"第{chapter_outline.chapter_number}章「{chapter_outline.title or '无标题'}」\n{content_excerpt}"
            )

        adapter = AdapterFactory.create(model_config)

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
            raise ValueError("AI 返回内容为空，请稍后重试")

        # 提取 JSON
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            raw = match.group(0)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.warning(f"伏笔扫描 JSON 解析失败: {e}, raw={raw[:200]}")
            raise ValueError(f"AI 返回格式异常，无法解析结果，请重试")

        if not isinstance(data, list):
            raise ValueError("AI 返回格式异常：期望数组，请重试")

        # 建立章节号 -> chapter_outline_id 映射
        chapter_map = {}
        for _, co in chapters:
            chapter_map[co.chapter_number] = co.id

        results = []
        for item in data:
            if not isinstance(item, dict):
                continue
            ch_num = item.get("plant_chapter_number", 0)
            results.append({
                "description": item.get("description", ""),
                "plant_chapter_number": ch_num,
                "plant_chapter_id": str(chapter_map.get(ch_num)) if ch_num in chapter_map else None,
                "confidence": min(1, max(0, float(item.get("confidence", 0.5)))),
            })

        return results
