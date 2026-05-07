import json
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.character import Character
from app.models.worldview import worldview_characters
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.models.terminology import Terminology
from app.models.worldview import Worldview


class ConsistencyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def check_consistency(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
    ) -> dict:
        """对章节内容进行一致性检查，返回检查报告"""
        # 获取章节
        chapter_result = await self.db.execute(select(Chapter).where(Chapter.id == chapter_id))
        chapter = chapter_result.scalar_one_or_none()
        if not chapter:
            raise ValueError("章节不存在")
        if not chapter.content or len(chapter.content.strip()) < 50:
            raise ValueError("章节内容过短，无法检查")

        # 获取章节大纲
        outline_result = await self.db.execute(
            select(ChapterOutline).where(ChapterOutline.id == chapter.chapter_outline_id)
        )
        chapter_outline = outline_result.scalar_one_or_none()
        if not chapter_outline:
            raise ValueError("章节大纲不存在")

        # 获取大纲和项目
        outline_result = await self.db.execute(
            select(Outline).where(Outline.id == chapter_outline.outline_id)
        )
        outline = outline_result.scalar_one_or_none()
        if not outline:
            raise ValueError("大纲不存在")

        project_result = await self.db.execute(
            select(Project).where(Project.id == outline.project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError("项目不存在")

        # 获取模型配置
        model_result = await self.db.execute(
            select(ModelConfig).where(ModelConfig.id == model_id)
        )
        model_config = model_result.scalar_one_or_none()
        if not model_config:
            raise ValueError("模型不存在")

        # 收集一致性检查的参考数据
        reference_data = await self._collect_reference_data(project, outline)

        # 调用 AI 进行一致性检查
        return await self._ai_check_consistency(
            content=chapter.content,
            chapter_outline=chapter_outline,
            project=project,
            reference_data=reference_data,
            model_config=model_config,
        )

    async def _collect_reference_data(self, project: Project, outline: Outline) -> dict:
        """收集一致性检查所需的参考数据"""
        # 获取术语
        terms_result = await self.db.execute(
            select(Terminology).where(Terminology.project_id == project.id)
        )
        terminologies = list(terms_result.scalars().all())

        # 获取世界观关联的角色
        characters = []
        worldview_info = ""
        if project.worldview_id:
            # 获取世界观
            wv_result = await self.db.execute(
                select(Worldview).where(Worldview.id == project.worldview_id)
            )
            worldview = wv_result.scalar_one_or_none()
            if worldview:
                worldview_info = f"世界观: {worldview.name}"
                if worldview.description:
                    worldview_info += f"\n描述: {worldview.description}"
                if worldview.rules:
                    worldview_info += f"\n规则: {worldview.rules}"

                # 获取世界观关联的角色
                char_result = await self.db.execute(
                    select(Character)
                    .join(worldview_characters, worldview_characters.c.character_id == Character.id)
                    .where(worldview_characters.c.worldview_id == project.worldview_id)
                )
                characters = list(char_result.scalars().all())

        # 如果没有世界观关联的角色，获取项目大纲关联的所有角色
        if not characters:
            char_result = await self.db.execute(select(Character))
            characters = list(char_result.scalars().all())

        return {
            "terminologies": terminologies,
            "characters": characters,
            "worldview_info": worldview_info,
        }

    async def _ai_check_consistency(
        self,
        content: str,
        chapter_outline: ChapterOutline,
        project: Project,
        reference_data: dict,
        model_config: ModelConfig,
    ) -> dict:
        """使用 AI 进行一致性检查"""
        terminologies = reference_data["terminologies"]
        characters = reference_data["characters"]
        worldview_info = reference_data["worldview_info"]

        # 构建参考信息
        terms_text = "\n".join(
            [f"- {t.term}（{t.category or '未分类'}）: {t.description or ''}" for t in terminologies]
        ) if terminologies else "无"

        chars_text = "\n".join(
            [f"- {c.name}（{c.role_type or '未指定'}）: {c.description or ''}" for c in characters]
        ) if characters else "无"

        # 截取内容避免过长
        content_excerpt = content[:6000] if len(content) > 6000 else content

        system_prompt = """你是一位资深的文学编辑，擅长检查小说中的一致性问题。请对以下章节内容进行一致性检查。

检查维度：
1. terminology（术语一致性）：专有名词的使用是否与术语库一致，有无拼写错误或不一致
2. character（角色一致性）：角色名称、性格、背景是否与设定一致，有无矛盾
3. worldview（世界观一致性）：世界观设定、规则是否被正确遵守
4. plot（情节一致性）：情节是否与大纲描述一致，有无逻辑矛盾

请严格以 JSON 格式输出，不要包含任何其他内容：
{
  "overall_score": 8.5,
  "issues": [
    {
      "dimension": "terminology",
      "severity": "warning",
      "description": "问题描述",
      "location": "相关文本片段",
      "suggestion": "修改建议"
    }
  ],
  "summary": "总体评价"
}

severity 可选值: "info"（建议）, "warning"（警告）, "error"（错误）
如果某个维度没有问题，issues 数组中不需要包含该维度的条目。"""

        user_prompt = f"""小说类型：{project.genre or '未指定'}
章节标题：{chapter_outline.title or f'第{chapter_outline.chapter_number}章'}
章节概述：{chapter_outline.summary or '无'}

{worldview_info if worldview_info else ''}

术语库：
{terms_text}

角色库：
{chars_text}

章节内容：
{content_excerpt}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        adapter = AdapterFactory.create(model_config)
        result = await adapter.generate(messages, max_tokens=1500)

        # 解析 AI 返回的 JSON
        try:
            raw = result["content"].strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            data = json.loads(raw)
            return {
                "overall_score": min(10, max(0, float(data.get("overall_score", 0)))),
                "issues": data.get("issues", []),
                "summary": data.get("summary", ""),
            }
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            raise ValueError(f"AI 返回格式解析失败: {e}")
