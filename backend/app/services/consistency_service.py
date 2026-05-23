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
from app.services.common import load_chapter_chain_with_model
from app.utils.json_extract import extract_json


class ConsistencyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def check_consistency(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
    ) -> dict:
        """对章节内容进行一致性检查，返回检查报告"""
        chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        outline = chain["outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        if not chapter.content or len(chapter.content.strip()) < 50:
            raise ValueError("章节内容过短，无法检查")

        # 收集一致性检查的参考数据
        reference_data = await self._collect_reference_data(project, outline, chapter_outline, model_config)

        # 调用 AI 进行一致性检查
        return await self._ai_check_consistency(
            content=chapter.content,
            chapter_outline=chapter_outline,
            project=project,
            reference_data=reference_data,
            model_config=model_config,
        )

    async def _ensure_summaries(self, rows, model_config) -> None:
        """对缺失或过期的 ChapterSummary 懒生成补全"""
        if not model_config:
            return
        from app.services.generation_service import GenerationService
        gen_svc = GenerationService(self.db)
        for row in rows:
            # row 可能是 (co, ch, cs) 或 (co, ch, cs, ...)
            ch = row[1]
            cs = row[2] if len(row) > 2 else None
            if not ch or not ch.content or len(ch.content.strip()) < 100:
                continue
            need_generate = False
            if not cs and not ch.content_summary:
                need_generate = True
            elif cs and cs.is_stale:
                need_generate = True
            if need_generate:
                await gen_svc._generate_content_summary(ch, model_config)
                await self.db.refresh(ch)

    async def _collect_reference_data(self, project: Project, outline: Outline, chapter_outline: ChapterOutline = None, model_config=None) -> dict:
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

        # 如果没有世界观关联的角色，不加载全部角色，避免跨项目污染

        # 获取前章摘要（用于跨章一致性检查，优先使用结构化摘要）
        prev_summaries = ""
        if chapter_outline and chapter_outline.chapter_number > 1:
            from app.models.chapter_summary import ChapterSummary
            prev_result = await self.db.execute(
                select(ChapterOutline, Chapter, ChapterSummary)
                .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
                .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
                .where(
                    ChapterOutline.outline_id == outline.id,
                    ChapterOutline.chapter_number < chapter_outline.chapter_number,
                )
                .order_by(ChapterOutline.chapter_number.desc())
                .limit(3)
            )

            # 懒生成：对缺失或过期摘要的前章补生成
            await self._ensure_summaries(prev_result.all(), model_config)

            # 重新查询以获取最新摘要
            prev_result = await self.db.execute(
                select(ChapterOutline, Chapter.content_summary, ChapterSummary.character_states, ChapterSummary.events)
                .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
                .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
                .where(
                    ChapterOutline.outline_id == outline.id,
                    ChapterOutline.chapter_number < chapter_outline.chapter_number,
                )
                .order_by(ChapterOutline.chapter_number.desc())
                .limit(3)
            )
            lines = []
            for co, content_summary, char_states, events in reversed(prev_result.all()):
                parts = [f"第{co.chapter_number}章: {content_summary or co.summary}"]
                if char_states:
                    parts.append(f"角色状态: {char_states}")
                if events:
                    parts.append(f"事件: {events}")
                if any([content_summary or co.summary, char_states, events]):
                    lines.append(" | ".join(p for p in parts if p))
            prev_summaries = "\n".join(lines)

        return {
            "terminologies": terminologies,
            "characters": characters,
            "worldview_info": worldview_info,
            "prev_summaries": prev_summaries,
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

        prev_summaries = reference_data.get("prev_summaries", "")
        prev_section = f"前章摘要（请检查跨章一致性，如角色状态是否与前文矛盾）：\n{prev_summaries}" if prev_summaries else ""

        user_prompt = f"""小说类型：{project.genre or '未指定'}
章节标题：{chapter_outline.title or f'第{chapter_outline.chapter_number}章'}
章节概述：{chapter_outline.summary or '无'}

{worldview_info if worldview_info else ''}

术语库：
{terms_text}

角色库：
{chars_text}

{prev_section}

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
            data = extract_json(result["content"])
            return {
                "overall_score": min(10, max(0, float(data.get("overall_score", 0)))),
                "issues": data.get("issues", []),
                "summary": data.get("summary", ""),
            }
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            raise ValueError(f"AI 返回格式解析失败: {e}")

    async def cross_chapter_check(
        self,
        project_id: uuid.UUID,
        model_id: uuid.UUID,
        from_chapter: Optional[int] = None,
        to_chapter: Optional[int] = None,
    ) -> dict:
        """跨章节一致性扫描：利用 ChapterSummary 逐章比对角色状态、时间线、地点"""
        from app.services.common import load_chapter_chain_with_model as _load

        project_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError("项目不存在")

        model_result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
        model_config = model_result.scalar_one_or_none()
        if not model_config:
            raise ValueError("模型不存在")

        # 加载所有章节的结构化摘要
        outline_result = await self.db.execute(select(Outline).where(Outline.project_id == project_id))
        outline = outline_result.scalar_one_or_none()
        if not outline:
            raise ValueError("项目没有大纲")

        from app.models.chapter_summary import ChapterSummary

        query = (
            select(ChapterOutline, Chapter, ChapterSummary)
            .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
            .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
            .where(ChapterOutline.outline_id == outline.id)
        )
        if from_chapter is not None:
            query = query.where(ChapterOutline.chapter_number >= from_chapter)
        if to_chapter is not None:
            query = query.where(ChapterOutline.chapter_number <= to_chapter)
        query = query.order_by(ChapterOutline.chapter_number)

        co_result = await self.db.execute(query)

        # 懒生成：对缺失或过期摘要的章节补生成
        await self._ensure_summaries(co_result.all(), model_config)

        # 重新查询以获取最新摘要
        co_result = await self.db.execute(query)
        chapter_summaries = []
        for co, ch, cs in co_result.all():
            entry = {"chapter_number": co.chapter_number, "title": co.title or ""}
            if cs:
                entry["character_states"] = cs.character_states
                entry["events"] = cs.events
                entry["timeline"] = cs.timeline
                entry["locations"] = cs.locations
                entry["unresolved_hooks"] = cs.unresolved_hooks
            elif ch and ch.content_summary:
                entry["summary"] = ch.content_summary
            else:
                entry["summary"] = co.summary
            chapter_summaries.append(entry)

        if len(chapter_summaries) < 2:
            raise ValueError("至少需要2章的结构化摘要才能进行跨章检查")

        # 构建 prompt
        import json as _json
        summaries_text = _json.dumps(chapter_summaries, ensure_ascii=False, indent=2)

        system_prompt = """你是一位资深的文学编辑，擅长检查小说中的跨章节一致性问题。

检查维度：
1. character（角色状态连贯性）：角色状态变化是否合理（如受伤后突然康复、性格突变无解释）
2. timeline（时间线一致性）：时间线是否矛盾（如白天后又是早上、时间跳跃不合理）
3. location（地点连贯性）：地点转换是否合理（如瞬间从A城到B城且无交代）
4. foreshadowing（伏笔一致性）：未回收伏笔是否有遗忘、已回收伏笔是否与描述吻合

请严格以 JSON 格式输出：
{
  "issues": [
    {
      "dimension": "character",
      "severity": "warning",
      "from_chapter": 3,
      "description": "问题描述",
      "suggestion": "修改建议"
    }
  ],
  "summary": "总体评价"
}

severity 可选: info, warning, error
如果没有问题，issues 为空数组。"""

        user_prompt = f"小说类型：{project.genre or '未指定'}\n\n各章节结构化摘要：\n{summaries_text}"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        adapter = AdapterFactory.create(model_config)
        result = await adapter.generate(messages, max_tokens=2000)

        try:
            data = extract_json(result["content"])
            return {
                "issues": data.get("issues", []),
                "summary": data.get("summary", ""),
                "chapters_scanned": len(chapter_summaries),
            }
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            raise ValueError(f"AI 返回格式解析失败: {e}")
