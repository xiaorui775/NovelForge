import json
import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project

logger = logging.getLogger(__name__)


class PacingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze_project(self, project_id: uuid.UUID, model_id: uuid.UUID) -> list[dict]:
        """分析项目所有章节的节奏和结构"""
        # 获取项目
        project_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError("项目不存在")

        # 获取模型配置
        model_result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
        model_config = model_result.scalar_one_or_none()
        if not model_config:
            raise ValueError("模型不存在")

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
            raise ValueError("项目没有已完成的章节")

        results = []
        adapter = AdapterFactory.create(model_config)

        # 批量分析，每次 3 章以控制 token 消耗
        batch_size = 3
        for i in range(0, len(chapters), batch_size):
            batch = chapters[i:i + batch_size]
            batch_results = await self._analyze_batch(adapter, batch, project.genre or "")
            results.extend(batch_results)

        return results

    async def _analyze_batch(
        self, adapter, batch: list[tuple], genre: str
    ) -> list[dict]:
        """分析一批章节的节奏"""
        chapter_summaries = []
        for chapter, chapter_outline in batch:
            content_excerpt = (chapter.content or "")[:3000]
            chapter_summaries.append(
                f"第{chapter_outline.chapter_number}章「{chapter_outline.title or '无标题'}」\n"
                f"大纲：{chapter_outline.summary or '无'}\n"
                f"内容：{content_excerpt}\n"
            )

        messages = [
            {
                "role": "system",
                "content": (
                    "你是一位资深的文学分析师。请分析以下小说章节的节奏和结构。\n\n"
                    "对每个章节，请分析以下维度：\n"
                    "1. dialogue_ratio (0-1): 对话占比\n"
                    "2. narration_ratio (0-1): 叙述/动作占比\n"
                    "3. description_ratio (0-1): 描写/环境占比\n"
                    "4. pacing_score (1-10): 节奏快慢，10=非常快节奏\n"
                    "5. tension_level (1-10): 戏剧张力\n"
                    "6. emotional_tone: 主导情感（如：紧张、温馨、悲伤、欢快、压抑、激昂）\n\n"
                    "请严格以 JSON 数组格式输出，不要包含其他内容：\n"
                    '[{"chapter_number": 1, "dialogue_ratio": 0.3, "narration_ratio": 0.5, '
                    '"description_ratio": 0.2, "pacing_score": 7, "tension_level": 6, "emotional_tone": "紧张"}]'
                ),
            },
            {
                "role": "user",
                "content": f"小说类型：{genre}\n\n" + "\n---\n".join(chapter_summaries),
            },
        ]

        try:
            result = await adapter.generate(messages, max_tokens=1000)
            raw = result["content"].strip()

            # 提取 JSON
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            # 尝试用正则提取 JSON 数组
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            if match:
                raw = match.group(0)

            data = json.loads(raw)

            # 标准化结果
            normalized = []
            for i, (chapter, chapter_outline) in enumerate(batch):
                if i < len(data):
                    item = data[i]
                else:
                    item = {}
                normalized.append({
                    "chapter_number": chapter_outline.chapter_number,
                    "title": chapter_outline.title,
                    "dialogue_ratio": min(1, max(0, float(item.get("dialogue_ratio", 0.33)))),
                    "narration_ratio": min(1, max(0, float(item.get("narration_ratio", 0.33)))),
                    "description_ratio": min(1, max(0, float(item.get("description_ratio", 0.33)))),
                    "pacing_score": min(10, max(1, int(item.get("pacing_score", 5)))),
                    "tension_level": min(10, max(1, int(item.get("tension_level", 5)))),
                    "emotional_tone": item.get("emotional_tone", "未知"),
                })
            return normalized

        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
            logger.warning(f"节奏分析解析失败: {e}")
            # 返回默认值
            return [
                {
                    "chapter_number": co.chapter_number,
                    "title": co.title,
                    "dialogue_ratio": 0.33,
                    "narration_ratio": 0.33,
                    "description_ratio": 0.33,
                    "pacing_score": 5,
                    "tension_level": 5,
                    "emotional_tone": "未知",
                }
                for _, co in batch
            ]
