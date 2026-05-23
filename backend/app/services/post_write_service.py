"""Post-write 分析服务：一次 AI 调用完成质量评分、一致性检查、节奏分析、伏笔识别、结构化摘要和故事圣经沉淀。"""

import json
import logging
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.chapter_summary import ChapterSummary
from app.models.character import Character
from app.models.foreshadowing import Foreshadowing
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.models.story_bible import StoryBible
from app.models.terminology import Terminology
from app.models.worldview import Worldview
from app.services.cost_budget_service import CostBudgetService

logger = logging.getLogger(__name__)


class PostWriteAnalysisService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
        adapter=None,
    ) -> dict:
        """对章节进行综合 post-write 分析"""
        # 加载实体链
        chain = await self._load_chapter_chain(chapter_id)
        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        outline = chain["outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        if not chapter.content or len(chapter.content.strip()) < 50:
            raise ValueError("章节内容过短，无法分析")

        # 检查预算
        budget_service = CostBudgetService(self.db)
        budget_check = await budget_service.check_budget()
        if not budget_check["allowed"]:
            raise ValueError("当月费用预算已用完")

        # 收集上下文
        context = await self._collect_context(project, chapter_outline, chapter)

        # 构建综合分析 prompt
        messages = self._build_messages(chapter, chapter_outline, project, context, model_config)

        # 复用或创建 adapter
        if adapter is None:
            adapter = AdapterFactory.create(model_config)
        try:
            result = await adapter.generate(messages, max_tokens=3000)
        except Exception as e:
            raise ValueError(f"AI 调用失败: {type(e).__name__}: {str(e)}")

        raw = result["content"].strip()
        if not raw:
            raise ValueError("AI 返回内容为空")

        # 提取 JSON
        data = self._extract_json(raw)

        # 持久化结果
        await self._persist_results(chapter, chapter_outline, project, model_config, data, adapter)

        # 记录费用
        usage = adapter.last_usage
        if usage and usage.prompt_tokens > 0:
            input_tokens = usage.prompt_tokens
            output_tokens = usage.completion_tokens
        else:
            input_tokens = adapter.count_tokens(messages[0]["content"] + messages[1]["content"])
            output_tokens = adapter.count_tokens(raw)

        from app.models.generation import GenerationLog
        input_rate, output_rate = self._get_effective_rates(model_config)
        cost = input_rate * input_tokens / 1000 + output_rate * output_tokens / 1000

        log = GenerationLog(
            chapter_id=chapter_id,
            model_id=model_id,
            status="completed",
            token_input=input_tokens,
            token_output=output_tokens,
            cost=round(cost, 6),
            duration_ms=0,
        )
        self.db.add(log)
        await budget_service.record_cost(__import__("decimal").Decimal(str(round(cost, 6))))
        await self.db.commit()

        return data

    async def _load_chapter_chain(self, chapter_id: uuid.UUID) -> dict:
        from app.services.common import load_chapter_chain
        chain = await load_chapter_chain(self.db, chapter_id)
        # post_write 还需要 model_config
        model_result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == chain["chapter"].model_id))
        model_config = model_result.scalar_one_or_none()
        if not model_config:
            raise ValueError("模型不存在")
        chain["model_config"] = model_config
        return chain

    async def _collect_context(self, project: Project, chapter_outline: ChapterOutline, chapter: Chapter) -> dict:
        # 术语
        terms_result = await self.db.execute(
            select(Terminology).where(Terminology.project_id == project.id)
        )
        terminologies = list(terms_result.scalars().all())

        # 世界观 + 角色
        worldview_info = ""
        characters = []
        if project.worldview_id:
            from sqlalchemy.orm import selectinload
            wv_result = await self.db.execute(
                select(Worldview)
                .where(Worldview.id == project.worldview_id)
                .options(selectinload(Worldview.characters))
            )
            wv = wv_result.scalar_one_or_none()
            if wv:
                worldview_info = f"世界观: {wv.name}"
                if wv.description:
                    worldview_info += f"\n{wv.description[:300]}"
                if wv.rules:
                    worldview_info += f"\n规则: {wv.rules[:200]}"
                characters = list(wv.characters)

        # 活跃伏笔
        fs_result = await self.db.execute(
            select(Foreshadowing)
            .where(Foreshadowing.project_id == project.id, Foreshadowing.status != "resolved")
            .limit(10)
        )
        foreshadowings = list(fs_result.scalars().all())

        # 前章摘要
        prev_summaries = ""
        if chapter_outline.chapter_number > 1:
            prev_result = await self.db.execute(
                select(ChapterOutline, Chapter.content_summary)
                .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
                .where(
                    ChapterOutline.outline_id == chapter_outline.outline_id,
                    ChapterOutline.chapter_number < chapter_outline.chapter_number,
                )
                .order_by(ChapterOutline.chapter_number.desc())
                .limit(3)
            )
            lines = []
            for co, content_summary in reversed(prev_result.all()):
                summary = content_summary or co.summary
                lines.append(f"第{co.chapter_number}章: {summary or '无'}")
            prev_summaries = "\n".join(lines)

        return {
            "terminologies": terminologies,
            "worldview_info": worldview_info,
            "characters": characters,
            "foreshadowings": foreshadowings,
            "prev_summaries": prev_summaries,
        }

    def _build_messages(self, chapter, chapter_outline, project, context, model_config) -> list[dict]:
        # 术语文本
        terms_text = "\n".join(
            [f"- {t.term}: {t.description or ''}" for t in context["terminologies"][:15]]
        ) if context["terminologies"] else "无"

        # 角色文本
        chars_text = "\n".join(
            [f"- {c.name}（{c.role_type or '未指定'}）: {(c.description or '')[:80]}" for c in context["characters"][:10]]
        ) if context["characters"] else "无"

        # 伏笔文本
        fs_text = "\n".join(
            [f"- {f.description}" for f in context["foreshadowings"]]
        ) if context["foreshadowings"] else "无"

        # 前文摘要
        prev_summaries = context.get("prev_summaries", "")
        prev_summaries_section = f"前文摘要：\n{prev_summaries}" if prev_summaries else ""

        # 截取内容：首 3000 字 + 尾 1500 字，覆盖全貌又省 token
        content = chapter.content or ""
        if len(content) > 4500:
            content_input = content[:3000] + "\n...[中间省略]...\n" + content[-1500:]
        else:
            content_input = content

        system_prompt = f"""你是一位资深小说编辑。请对以下章节进行综合分析，涵盖质量评分、一致性、节奏、伏笔识别、结构化摘要和故事圣经提取。

小说类型：{project.genre or '未指定'}
章节：第{chapter_outline.chapter_number}章 {chapter_outline.title or ''}
章节大纲：{chapter_outline.summary or '无'}

{context['worldview_info']}

术语表：
{terms_text}

角色设定：
{chars_text}

活跃伏笔：
{fs_text}

{prev_summaries_section}"""

        user_prompt = f"""请严格以 JSON 格式输出以下分析结果（不要输出其他内容）：

{{
  "quality": {{
    "coherence": 0-10,
    "writing_quality": 0-10,
    "plot_progression": 0-10,
    "overall": 0-10,
    "notes": "简短评语"
  }},
  "consistency_issues": [
    {{"dimension": "terminology|character|worldview|plot", "severity": "info|warning|error", "description": "问题描述", "suggestion": "修改建议"}}
  ],
  "pacing": {{
    "dialogue_ratio": 0-1,
    "tension_level": 1-10,
    "emotional_tone": "主导情感"
  }},
  "foreshadowings": [
    {{"description": "伏笔描述", "confidence": 0-1}}
  ],
  "summary": {{
    "events": [{{"event": "事件", "characters": ["角色名"], "location": "地点"}}],
    "character_states": {{"角色名": {{"status": "状态", "emotion": "情感", "location": "位置"}}}},
    "unresolved_hooks": ["悬念"],
    "resolved_hooks": ["已回收伏笔"],
    "timeline": "时间描述",
    "locations": ["地点"],
    "narrative_threads": ["线索"],
    "plain_summary": "200字以内自然语言摘要"
  }},
  "story_bible_drafts": [
    {{"category": "character|worldview|plot|timeline|custom", "title": "标题", "content": "内容", "tags": "标签"}}
  ]
}}

章节内容：
{content_input}"""

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def _extract_json(self, raw: str) -> dict:
        from app.utils.json_extract import extract_json
        return extract_json(raw)

    async def _persist_results(self, chapter, chapter_outline, project, model_config, data, adapter):
        # 1. 结构化摘要 -> ChapterSummary
        summary_data = data.get("summary", {})
        cs_result = await self.db.execute(
            select(ChapterSummary).where(ChapterSummary.chapter_id == chapter.id)
        )
        cs = cs_result.scalar_one_or_none()
        if not cs:
            cs = ChapterSummary(chapter_id=chapter.id)
            self.db.add(cs)

        cs.events = json.dumps(summary_data.get("events", []), ensure_ascii=False)
        cs.character_states = json.dumps(summary_data.get("character_states", {}), ensure_ascii=False)
        cs.unresolved_hooks = json.dumps(summary_data.get("unresolved_hooks", []), ensure_ascii=False)
        cs.resolved_hooks = json.dumps(summary_data.get("resolved_hooks", []), ensure_ascii=False)
        cs.timeline = summary_data.get("timeline", "")
        cs.locations = json.dumps(summary_data.get("locations", []), ensure_ascii=False)
        cs.narrative_threads = json.dumps(summary_data.get("narrative_threads", []), ensure_ascii=False)
        cs.word_count_at_summary = len(chapter.content)
        cs.is_stale = False

        # 兼容 content_summary
        plain = summary_data.get("plain_summary", "")
        if plain:
            chapter.content_summary = plain[:500]

        # 2. 故事圣经沉淀（去重）
        for draft in data.get("story_bible_drafts", [])[:2]:
            category = str(draft.get("category") or "custom")[:50]
            if category not in {"character", "worldview", "plot", "timeline", "custom"}:
                category = "custom"
            title = str(draft.get("title") or "")[:200].strip()
            content = str(draft.get("content") or "")[:4000].strip()
            tags = str(draft.get("tags") or "")[:300]
            if not title or not content:
                continue

            # 检查是否近似重复
            existing_result = await self.db.execute(
                select(StoryBible).where(StoryBible.project_id == project.id, StoryBible.title == title)
            )
            existing = existing_result.scalar_one_or_none()
            if existing:
                existing.content = content
                existing.tags = tags
                existing.category = category
            else:
                self.db.add(StoryBible(
                    project_id=project.id,
                    category=category,
                    title=title,
                    content=content,
                    tags=tags,
                ))

        # 3. 伏笔自动追踪：如果 resolved_hooks 匹配已有 open 伏笔，标记为 resolved
        resolved = summary_data.get("resolved_hooks", [])
        if resolved:
            open_fs = await self.db.execute(
                select(Foreshadowing)
                .where(Foreshadowing.project_id == project.id, Foreshadowing.status == "open")
            )
            for fs in open_fs.scalars().all():
                for rh in resolved:
                    if rh and fs.description and (rh in fs.description or fs.description in rh):
                        fs.status = "resolved"
                        fs.resolution_chapter_id = chapter_outline.id

    @staticmethod
    def _get_effective_rates(model_config: ModelConfig) -> tuple:
        from app.services.cost_budget_service import CostBudgetService
        return CostBudgetService.get_effective_rates(model_config)
