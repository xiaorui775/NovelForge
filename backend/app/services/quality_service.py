import json
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.services.common import load_chapter_chain_with_model
from app.utils.json_extract import extract_json


class QualityService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def score_chapter(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
    ) -> dict:
        """对章节进行 AI 质量评分"""
        chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        if not chapter.content or len(chapter.content.strip()) < 50:
            raise ValueError("章节内容过短，无法评分")

        # 调用 AI 评分
        return await self.score_text(
            content=chapter.content,
            outline_summary=chapter_outline.summary or "",
            genre=project.genre or "",
            model_config=model_config,
        )

    async def score_text(
        self,
        content: str,
        outline_summary: str,
        genre: str,
        model_config: ModelConfig,
    ) -> dict:
        """对文本进行 AI 质量评分，可复用"""
        # 截取内容避免过长（取前 5000 字）
        content_excerpt = content[:5000] if len(content) > 5000 else content

        messages = [
            {
                "role": "system",
                "content": (
                    "你是一位资深的文学编辑和小说评论家。请对以下小说章节进行专业评分。\n"
                    "评分维度（0-10 分，可以有一位小数）：\n"
                    "1. coherence（连贯性）：情节是否连贯，逻辑是否通顺\n"
                    "2. writing_quality（文笔）：语言表达、修辞手法、文字功底\n"
                    "3. plot_progression（情节推进）：情节是否有效推进，节奏是否合理\n"
                    "4. overall（综合分）：加权总分\n\n"
                    "请严格以 JSON 格式输出，不要包含任何其他内容：\n"
                    '{"coherence": 8, "writing_quality": 7, "plot_progression": 9, "overall": 8.0, "notes": "简短评语"}'
                ),
            },
            {
                "role": "user",
                "content": (
                    f"小说类型：{genre}\n"
                    f"章节大纲：{outline_summary}\n\n"
                    f"章节内容：\n{content_excerpt}"
                ),
            },
        ]

        adapter = AdapterFactory.create(model_config)
        result = await adapter.generate(messages, max_tokens=500)

        # 解析 AI 返回的 JSON
        try:
            score_data = extract_json(result["content"])
            return {
                "coherence": min(10, max(0, float(score_data.get("coherence", 0)))),
                "writing_quality": min(10, max(0, float(score_data.get("writing_quality", 0)))),
                "plot_progression": min(10, max(0, float(score_data.get("plot_progression", 0)))),
                "overall": min(10, max(0, float(score_data.get("overall", 0)))),
                "notes": score_data.get("notes", ""),
            }
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            raise ValueError(f"AI 返回格式解析失败: {e}")
