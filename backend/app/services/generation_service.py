import json
import time
import uuid
import difflib
import logging
from decimal import Decimal
from typing import Optional, AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter, ChapterVersion
from app.models.character import Character, CharacterRelation
from app.models.foreshadowing import Foreshadowing
from app.models.generation import GenerationLog, PromptTemplate
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.models.scene import Scene
from app.services.validation_service import ValidationService
from app.models.terminology import Terminology
from app.models.story_bible import StoryBible
from app.models.chapter_summary import ChapterSummary
from app.models.worldview import Worldview
from app.services.cost_budget_service import CostBudgetService
from app.services.quality_service import QualityService
from app.services.common import load_chapter_chain, load_chapter_chain_with_model
from app.utils.json_extract import extract_json

logger = logging.getLogger(__name__)


class GenerationService:

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _calc_context_budget(model_config: ModelConfig, extra_chars: int = 0) -> Optional[int]:
        """统一计算上下文字数预算

        Args:
            model_config: 模型配置
            extra_chars: 额外需要预留的字符数（如续写时已有内容的尾部）
        """
        if not hasattr(model_config, 'max_context_tokens') or not model_config.max_context_tokens:
            return None
        # 1.8 倍：中文约 1.5 token/字，留 0.3 倍余量给 prompt 模板
        return max(2000, int(model_config.max_context_tokens * 1.8) - extra_chars - 500)

    @staticmethod
    def _get_effective_rates(model_config: ModelConfig) -> tuple:
        return CostBudgetService.get_effective_rates(model_config)

    @staticmethod
    def _truncate_to_budget(text: str, budget: int) -> str:
        """截断文本到指定字数预算"""
        if len(text) <= budget:
            return text
        return text[:budget - 3] + "..."

    async def _get_characters_context(self, project: Project, outline_text: str = "") -> str:
        """获取角色上下文：角色列表 + 关系（截断到 2000 字）。outline_text 用于过滤相关角色。"""
        characters = []
        if project.worldview_id:
            wv_result = await self.db.execute(
                select(Worldview)
                .where(Worldview.id == project.worldview_id)
                .options(selectinload(Worldview.characters))
            )
            wv = wv_result.scalar_one_or_none()
            if wv:
                characters = list(wv.characters)

        if not characters:
            # 无世界观关联时，不加载全部角色，避免跨项目污染
            characters = []

        # 按大纲文本过滤相关角色（避免无关角色浪费预算）
        if outline_text and characters:
            import re
            relevant = [c for c in characters if re.search(re.escape(c.name), outline_text)]
            if relevant:
                characters = relevant

        if not characters:
            return ""

        char_ids = [c.id for c in characters]
        rel_result = await self.db.execute(
            select(CharacterRelation)
            .where(
                CharacterRelation.from_character_id.in_(char_ids),
                CharacterRelation.to_character_id.in_(char_ids),
            )
        )
        relations = list(rel_result.scalars().all())
        rel_map: dict[str, list[str]] = {}
        for r in relations:
            from_name = next((c.name for c in characters if c.id == r.from_character_id), "?")
            to_name = next((c.name for c in characters if c.id == r.to_character_id), "?")
            rel_map.setdefault(from_name, []).append(f"与{to_name}：{r.relation_type}")

        lines = []
        total_len = 0
        for c in characters:
            # 截断单个角色描述
            desc_parts = []
            if c.role_type:
                desc_parts.append(c.role_type)
            if c.personality:
                desc_parts.append(f"性格{c.personality[:80]}")
            if c.background:
                desc_parts.append(c.background[:100])
            if c.description:
                desc_parts.append(c.description[:100])
            line = f"- {c.name}"
            if desc_parts:
                line += f"（{'，'.join(desc_parts)}）"
            if total_len + len(line) > 2000:
                lines.append(f"- ...（还有 {len(characters) - len(lines)} 个角色未列出）")
                break
            lines.append(line)
            total_len += len(line)
            for rel in rel_map.get(c.name, []):
                rel_line = f"  - {rel}"
                if total_len + len(rel_line) > 2000:
                    break
                lines.append(rel_line)
                total_len += len(rel_line)

        return "\n".join(lines)

    async def _get_worldview_context(self, project: Project, outline_text: str = "") -> str:
        """获取世界观上下文。如果大纲文本提及世界观关键词，给更多预算。"""
        if not project.worldview_id:
            return ""
        result = await self.db.execute(select(Worldview).where(Worldview.id == project.worldview_id))
        wv = result.scalar_one_or_none()
        if not wv:
            return ""
        # 判断大纲是否与世界观相关
        import re
        keywords = []
        if wv.name:
            keywords.append(re.escape(wv.name))
        relevant = bool(keywords) and any(re.search(k, outline_text) for k in keywords) if outline_text else False
        budget = 800 if relevant else 400
        parts = []
        if wv.description:
            parts.append(wv.description[:int(budget * 0.75)])
        if wv.rules:
            parts.append(f"规则：{wv.rules[:int(budget * 0.35)]}")
        text = "\n".join(parts)
        return text[:budget]

    async def _get_foreshadowings_context(self, project: Project, chapter_number: int) -> str:
        """获取活跃伏笔上下文（只查询未回收的伏笔）"""
        result = await self.db.execute(
            select(Foreshadowing)
            .where(Foreshadowing.project_id == project.id)
            .where(Foreshadowing.status != "resolved")
            .options(
                selectinload(Foreshadowing.plant_chapter),
                selectinload(Foreshadowing.resolution_chapter),
            )
        )
        foreshadowings = list(result.scalars().all())
        if not foreshadowings:
            return ""
        lines = []
        for f in foreshadowings:
            plant_info = ""
            if f.plant_chapter:
                plant_info = f"（第{f.plant_chapter.chapter_number}章种植）"
            line = f"- {f.description}{plant_info}"
            if f.notes:
                line += f"。备注：{f.notes}"
            lines.append(line)
        return "\n".join(lines) if lines else ""

    async def _get_scenes_context(self, chapter_id: Optional[uuid.UUID]) -> str:
        """获取当前章节的场景设定"""
        if not chapter_id:
            return ""
        result = await self.db.execute(
            select(Scene).where(Scene.chapter_id == chapter_id).order_by(Scene.scene_number)
        )
        scenes = list(result.scalars().all())
        if not scenes:
            return ""
        lines = []
        for i, s in enumerate(scenes, 1):
            parts = [f"场景{i}"]
            if s.location:
                parts.append(s.location)
            if s.time:
                parts.append(s.time)
            if s.mood:
                parts.append(f"{s.mood}气氛")
            if s.summary:
                parts.append(s.summary)
            lines.append("：".join([parts[0], "，".join(parts[1:])]) if len(parts) > 1 else parts[0])
        return "\n".join(lines)



    @staticmethod
    def _normalize_text_for_compare(text: str) -> str:
        import re

        normalized = (text or "").lower()
        normalized = re.sub(r"\s+", "", normalized)
        normalized = re.sub(r"[，。！？；：“”‘’、,.!?;:\\-_/()\[\]{}]", "", normalized)
        return normalized

    def _is_near_duplicate(self, a: str, b: str) -> bool:
        na = self._normalize_text_for_compare(a)
        nb = self._normalize_text_for_compare(b)
        if not na or not nb:
            return False
        if na == nb:
            return True
        shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
        return len(shorter) > 8 and shorter in longer

    async def _get_story_bible_context(self, project: Project, outline_text: str = "") -> tuple[str, list[StoryBible]]:
        from datetime import datetime, timedelta

        result = await self.db.execute(
            select(StoryBible)
            .where(StoryBible.project_id == project.id)
            .order_by(StoryBible.updated_at.desc())
            .limit(30)
        )
        entries = list(result.scalars().all())
        if not entries:
            return "", []

        # 过期淘汰：last_verified_chapter_id 为空且超过 30 天的条目降权（排到末尾）
        stale_cutoff = datetime.utcnow() - timedelta(days=30)
        verified = []
        stale = []
        for e in entries:
            if e.last_verified_chapter_id:
                verified.append(e)
            elif e.created_at and e.created_at < stale_cutoff:
                stale.append(e)
            else:
                verified.append(e)
        # 已验证/较新的排前面，过期的排后面
        entries = verified + stale

        import re

        tokens = [t for t in re.split(r"\W+", outline_text or "") if len(t) >= 2]
        if tokens:
            matched = []
            for entry in entries:
                haystack = f"{entry.title or ''}\n{entry.content or ''}".lower()
                hit = any(tok.lower() in haystack for tok in tokens)
                if hit:
                    matched.append(entry)
            if matched:
                entries = matched

        # 总上限降为 20
        lines = []
        for e in entries[:20]:
            title = (e.title or "").strip()
            content = (e.content or "").strip()
            if not title and not content:
                continue
            line = f"- [{e.category}] {title}"
            if content:
                line += f"：{content[:220]}"
            if e.tags:
                line += f"（标签：{e.tags[:80]}）"
            lines.append(line)

        return "\n".join(lines), entries[:20]

    async def _get_series_predecessor_context(self, project: Project) -> str:
        """If this project is in a series and not the first book, return predecessor context text."""
        if not project.series_id:
            return ""
        from app.services.series_service import SeriesService
        svc = SeriesService(self.db)
        ctx = await svc.get_predecessor_context(project.id)
        if not ctx:
            return ""
        parts = []
        if ctx.get("earlier_books_text"):
            parts.append(ctx["earlier_books_text"])
        if ctx.get("immediate_predecessor_text"):
            parts.append(ctx["immediate_predecessor_text"])
        return "\n".join(parts)

    async def _build_context_bundle(
        self,
        chapter_outline: ChapterOutline,
        project: Project,
        outline: Outline,
        chapter_id: Optional[uuid.UUID],
        context_budget: Optional[int],
        model_config: Optional[ModelConfig] = None,
    ) -> dict:
        terminologies_result = await self.db.execute(
            select(Terminology).where(Terminology.project_id == project.id)
        )
        terminologies = list(terminologies_result.scalars().all())
        terms_text = "\n".join([f"- {t.term}: {t.description or ''}" for t in terminologies]) if terminologies else ""

        prev_summaries = []
        prev_content_snippet = ""
        if chapter_outline.chapter_number > 1:
            # 根据 context_budget 动态调整前章数量
            max_prev = 8 if context_budget and context_budget >= 8000 else 5
            prev_result = await self.db.execute(
                select(ChapterOutline, Chapter, ChapterSummary)
                .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
                .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
                .where(
                    ChapterOutline.outline_id == outline.id,
                    ChapterOutline.chapter_number < chapter_outline.chapter_number,
                )
                .order_by(ChapterOutline.chapter_number.desc())
                .limit(max_prev)
            )
            prev_rows = list(prev_result.all())

            # 上下文构建只读：旧摘要或已无摘要时不再内联调 LLM 生成
            # （此前每个前章最多额外 ~5-15s 串行 LLM，严重拖慢生成链路）。
            # 缺失/过期的摘要改为标记 stale，交给 SummaryWorker 后台刷新；
            # 本次生成复用既有摘要（无则回退到 chapter_outline.summary / 标题）。
            stale_ids: list[uuid.UUID] = []
            for co, ch, cs in prev_rows:
                if not ch or not ch.content or len(ch.content.strip()) < 100:
                    continue
                need_refresh = (cs is None and not ch.content_summary) or (cs is not None and cs.is_stale)
                if need_refresh and ch.id is not None:
                    stale_ids.append(ch.id)
            if stale_ids:
                from app.services.summary_worker import mark_summaries_stale
                try:
                    await mark_summaries_stale(self.db, stale_ids[0])
                except Exception:  # noqa: BLE001
                    # 标记失败不应阻断当前生成；worker 仍会按周期扫到
                    pass

            # 衰减策略：根据前章数量动态梯度
            # 8章：2完整 → 2压缩80字 → 2仅标题 → 2仅章节号
            # 5章：2完整 → 1压缩80字 → 2仅标题
            distance = 0
            for co, ch, cs in reversed(prev_rows):
                distance += 1
                content_summary = ch.content_summary if ch else None
                summary = content_summary or co.summary or ""
                if distance <= 2:
                    # 最近 2 章：完整摘要
                    prev_summaries.append(f"第{co.chapter_number}章 {co.title or ''}: {summary}")
                elif distance <= 4 and max_prev >= 8:
                    # 第 3-4 章（8章模式）：压缩到 80 字
                    prev_summaries.append(f"第{co.chapter_number}章 {co.title or ''}: {summary[:80]}")
                elif distance <= 3 and max_prev < 8:
                    # 第 3 章（5章模式）：压缩到 80 字
                    prev_summaries.append(f"第{co.chapter_number}章 {co.title or ''}: {summary[:80]}")
                elif distance <= 6 and max_prev >= 8:
                    # 第 5-6 章（8章模式）：仅标题
                    prev_summaries.append(f"第{co.chapter_number}章 {co.title or ''}")
                elif distance <= 5 and max_prev < 8:
                    # 第 4-5 章（5章模式）：仅标题
                    prev_summaries.append(f"第{co.chapter_number}章 {co.title or ''}")
                else:
                    # 更远：仅章节号
                    prev_summaries.append(f"第{co.chapter_number}章")
            if prev_rows:
                nearest_ch = prev_rows[0][1]
                if nearest_ch and nearest_ch.content:
                    prev_content_snippet = nearest_ch.content[-500:]

        prev_summaries_text = "\n".join(prev_summaries) if prev_summaries else ""

        outline_text = f"{chapter_outline.title or ''} {chapter_outline.summary or ''} {chapter_outline.detail_outline or ''}"
        characters_text = await self._get_characters_context(project, outline_text)
        worldview_text = await self._get_worldview_context(project, outline_text)
        foreshadowings_text = await self._get_foreshadowings_context(project, chapter_outline.chapter_number)
        scenes_text = await self._get_scenes_context(chapter_id)
        story_bible_text, story_bible_entries = await self._get_story_bible_context(project, outline_text)
        series_predecessor_text = await self._get_series_predecessor_context(project)

        conflicts = []
        if terminologies and story_bible_entries:
            for t in terminologies:
                term = (t.term or "").strip()
                t_desc = (t.description or "").strip()
                if not term or not t_desc:
                    continue
                for e in story_bible_entries:
                    sb_title = e.title or ""
                    sb_content = e.content or ""
                    joined = f"{sb_title}\n{sb_content}"
                    if term not in joined:
                        continue
                    if sb_content and not self._is_near_duplicate(t_desc, sb_content):
                        conflicts.append({
                            "type": "terminology_story_bible",
                            "term": term,
                            "terminology": t_desc[:200],
                            "story_bible": sb_content[:200],
                            "entry_title": sb_title[:80] if sb_title else "",
                        })

        if context_budget and context_budget > 0:
            sections = [
                ("prev_content_snippet", prev_content_snippet, 500),
                ("prev_summaries", prev_summaries_text, 800),
                ("detail_outline", chapter_outline.detail_outline or "", 1500),
                ("scenes", scenes_text, 800),
                ("terminologies", terms_text, 600),
                ("story_bible", story_bible_text, 1000),
                ("characters", characters_text, 1200),
                ("worldview", worldview_text, 600),
                ("foreshadowings", foreshadowings_text, 700),
                ("series_predecessor", series_predecessor_text, 800),
            ]
            total_raw = sum(len(s[1]) for s in sections)
            if total_raw > context_budget:
                scale = context_budget / max(total_raw, 1)
                adjusted = {}
                for name, text, floor in sections:
                    allocated = max(floor, int(len(text) * scale))
                    adjusted[name] = self._truncate_to_budget(text, allocated)
                prev_content_snippet = adjusted["prev_content_snippet"]
                prev_summaries_text = adjusted["prev_summaries"]
                detail_outline = adjusted["detail_outline"]
                scenes_text = adjusted["scenes"]
                terms_text = adjusted["terminologies"]
                story_bible_text = adjusted["story_bible"]
                characters_text = adjusted["characters"]
                worldview_text = adjusted["worldview"]
                foreshadowings_text = adjusted["foreshadowings"]
                series_predecessor_text = adjusted["series_predecessor"]
            else:
                detail_outline = chapter_outline.detail_outline or ""
        else:
            detail_outline = chapter_outline.detail_outline or ""

        return {
            "terminologies": terminologies,
            "terms_text": terms_text,
            "prev_summaries_text": prev_summaries_text,
            "prev_content_snippet": prev_content_snippet,
            "characters_text": characters_text,
            "worldview_text": worldview_text,
            "foreshadowings_text": foreshadowings_text,
            "scenes_text": scenes_text,
            "story_bible_text": story_bible_text,
            "detail_outline": detail_outline,
            "series_predecessor_text": series_predecessor_text,
            "conflicts": conflicts[:10],
        }

    async def _deposit_story_bible_draft(
        self,
        project_id: uuid.UUID,
        chapter_outline: ChapterOutline,
        chapter_content: str,
        model_config: ModelConfig,
        adapter=None,
        chapter_id: uuid.UUID = None,
    ) -> None:
        if not chapter_content or len(chapter_content.strip()) < 200:
            return
        try:
            if adapter is None:
                adapter = await AdapterFactory.create(model_config)
            messages = [
                {
                    "role": "system",
                    "content": (
                        "你是小说编审助理。请从章节内容中提取 1-2 条适合写入故事圣经的新增设定。"
                        "仅返回 JSON 数组，每项字段：category,title,content,tags。"
                        "category 只能是 character/worldview/plot/timeline/custom。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"章节：第{chapter_outline.chapter_number}章 {chapter_outline.title or ''}\n"
                        f"概要：{chapter_outline.summary or ''}\n\n"
                        f"正文片段：\n{chapter_content[:3500]}"
                    ),
                },
            ]
            parts = []
            async for token in adapter.generate_stream(messages, max_tokens=700):
                parts.append(token)
            raw = "".join(parts).strip()
            items = extract_json(raw)
            if not isinstance(items, list):
                return

            created_any = False
            for item in items[:2]:
                category = str(item.get("category") or "custom")[:50]
                if category not in {"character", "worldview", "plot", "timeline", "custom"}:
                    category = "custom"
                title = str(item.get("title") or "")[:200].strip()
                content = str(item.get("content") or "")[:4000].strip()
                tags = str(item.get("tags") or f"chapter-{chapter_outline.chapter_number}")[:300]
                if not title or not content:
                    continue

                # 去重：检查是否已有近似条目（精确标题匹配或模糊内容匹配）
                existing_result = await self.db.execute(
                    select(StoryBible).where(StoryBible.project_id == project_id, StoryBible.title == title)
                )
                existing = existing_result.scalar_one_or_none()

                if not existing:
                    # 尝试模糊匹配：同一分类下内容相似的条目
                    similar_result = await self.db.execute(
                        select(StoryBible).where(
                            StoryBible.project_id == project_id,
                            StoryBible.category == category,
                        ).limit(20)
                    )
                    for sb in similar_result.scalars().all():
                        if self._is_near_duplicate(content, sb.content):
                            existing = sb
                            break

                if existing:
                    existing.content = content
                    existing.category = category
                    existing.tags = tags
                    if chapter_id:
                        existing.last_verified_chapter_id = chapter_id
                else:
                    self.db.add(
                        StoryBible(
                            project_id=project_id,
                            category=category,
                            title=title,
                            content=content,
                            tags=tags,
                            last_verified_chapter_id=chapter_id,
                        )
                    )
                created_any = True

            if created_any:
                await self.db.commit()
        except Exception as e:
            logger.warning(f"_deposit_story_bible_draft failed: {e}", exc_info=True)

    @staticmethod
    def _merge_revisions(draft: str, revision: str) -> str:
        """将增量修改合并到初稿中。如果 revision 不含段落标记则直接返回 revision（完整重写降级）。"""
        import re
        # 检测是否有 [段落N] 标记
        paragraph_markers = re.findall(r'^\[段落(\d+)\]', revision, re.MULTILINE)
        if not paragraph_markers:
            # 无标记 → AI 输出了完整章节，直接使用
            return revision

        # 按双换行拆分初稿段落
        draft_paragraphs = draft.split('\n\n')
        # 构建修改映射：段落编号 → 新内容
        changes: dict[int, str] = {}
        # 用正则逐段匹配 [段落N] 后面的内容（到下一个 [段落M] 或文末）
        pattern = re.compile(r'\[段落(\d+)\]\s*\n?(.*?)(?=\[段落\d+\]|$)', re.DOTALL)
        for match in pattern.finditer(revision):
            idx = int(match.group(1))
            content = match.group(2).strip()
            if idx >= 1:
                changes[idx] = content

        # 应用修改
        result_paragraphs = list(draft_paragraphs)
        for idx, new_content in changes.items():
            array_idx = idx - 1  # [段落1] → index 0
            if 0 <= array_idx < len(result_paragraphs):
                result_paragraphs[array_idx] = new_content
            else:
                # 超出范围则追加
                result_paragraphs.append(new_content)

        return '\n\n'.join(result_paragraphs)

    @staticmethod
    def _build_diff_snapshot(old_content: str, new_content: str) -> str:
        old_lines = (old_content or "").splitlines()
        new_lines = (new_content or "").splitlines()
        diff_lines = list(difflib.unified_diff(old_lines, new_lines, lineterm="", n=2))
        if not diff_lines:
            return ""
        diff_text = "\n".join(diff_lines)
        return diff_text[:12000]

    async def _build_chapter_prompt(
        self,
        chapter_outline: ChapterOutline,
        project: Project,
        outline: Outline,
        template: Optional[PromptTemplate] = None,
        chapter_id: Optional[uuid.UUID] = None,
        context_budget: Optional[int] = None,
        model_config: Optional[ModelConfig] = None,
    ) -> list[dict]:
        bundle = await self._build_context_bundle(
            chapter_outline=chapter_outline,
            project=project,
            outline=outline,
            chapter_id=chapter_id,
            context_budget=context_budget,
            model_config=model_config,
        )

        min_words = project.target_words_per_chapter_min or 3000
        max_words = project.target_words_per_chapter_max or 5000
        dialogue_pct = int(float(project.dialogue_ratio) * 100) if project.dialogue_ratio else 40

        template_vars = {
            "genre": project.genre or "",
            "chapter_number": str(chapter_outline.chapter_number),
            "chapter_title": chapter_outline.title or f"第{chapter_outline.chapter_number}章",
            "chapter_summary": chapter_outline.summary or "",
            "detail_outline": bundle["detail_outline"],
            "terminologies": bundle["terms_text"],
            "prev_summaries": bundle["prev_summaries_text"],
            "prev_content_snippet": bundle["prev_content_snippet"],
            "style_reference": project.style_reference or "",
            "min_words": str(min_words),
            "max_words": str(max_words),
            "language": project.language,
            "dialogue_ratio": str(dialogue_pct),
            "characters": bundle["characters_text"],
            "worldview": bundle["worldview_text"],
            "foreshadowings": bundle["foreshadowings_text"],
            "scenes": bundle["scenes_text"],
            "story_bible": bundle["story_bible_text"],
        }

        if template:
            prompt_content = template.content
            for key, value in template_vars.items():
                prompt_content = prompt_content.replace(f"{{{key}}}", value)
            return [
                {"role": "system", "content": prompt_content},
                {"role": "user", "content": ""},
            ]

        system_parts = [
            f"你是一位专业的{project.genre or ''}小说作家。",
            f"请根据以下大纲和要求，撰写小说的第{chapter_outline.chapter_number}章内容。",
        ]

        if project.style_reference:
            system_parts.append(f"\n参考风格：\n{project.style_reference}")
        if bundle["terms_text"]:
            system_parts.append(f"\n专有名词（请保持一致）：\n{bundle['terms_text']}")
        if bundle["prev_summaries_text"]:
            system_parts.append("\n前文摘要：\n" + bundle["prev_summaries_text"])
        if bundle["prev_content_snippet"]:
            system_parts.append(f"\n【前章末尾内容（请保持叙事衔接）】\n...{bundle['prev_content_snippet']}")
        if bundle["characters_text"]:
            system_parts.append(f"\n【主要角色】\n{bundle['characters_text']}")
        if bundle["worldview_text"]:
            system_parts.append(f"\n【世界观】\n{bundle['worldview_text']}")
        if bundle["foreshadowings_text"]:
            system_parts.append(f"\n【活跃伏笔（请注意呼应）】\n{bundle['foreshadowings_text']}")
        if bundle["story_bible_text"]:
            system_parts.append(f"\n【故事圣经】\n{bundle['story_bible_text']}")
        if bundle.get("series_predecessor_text"):
            system_parts.append(f"\n【系列前作上下文（本书是系列续作，请保持连贯）】\n{bundle['series_predecessor_text']}")

        system_parts.append("""
## 输入治理契约
- 章节摘要和详细大纲是本章的写作指令，必须严格遵循。
- 世界观设定和角色设定是硬护栏，不可违反。
- 系列前作上下文是已确立的系列事实，续作必须与前作保持一致，不可矛盾。
- 前章摘要和前章内容片段用于衔接参考，不要重复已有内容。
- 如果详细大纲与世界观设定冲突，以世界观设定为准。
- 伏笔动态用于保持连贯性，不要强行回收未到期的伏笔。
- 术语表中的专有名词必须使用指定翻译。""")

        user_parts = [
            f"章节标题：{chapter_outline.title or f'第{chapter_outline.chapter_number}章'}",
            f"\n章节概述：{chapter_outline.summary}",
        ]
        if bundle["detail_outline"]:
            user_parts.append(f"\n详细大纲：{bundle['detail_outline']}")
        if bundle["scenes_text"]:
            user_parts.append(f"\n场景设定：\n{bundle['scenes_text']}")

        user_parts.append("\n要求：")
        user_parts.append(f"- 字数：{min_words}-{max_words}字")
        user_parts.append(f"- 语言：{project.language}")
        if project.dialogue_ratio:
            user_parts.append(f"- 对话占比：约{dialogue_pct}%")
        if bundle["characters_text"]:
            user_parts.append("- 角色言行必须符合上述角色设定")
        if bundle["foreshadowings_text"]:
            user_parts.append("- 注意伏笔的呼应和推进")
        user_parts.append("- 直接输出正文内容，不要包含章节标题和作者注释")

        return [
            {"role": "system", "content": "\n".join(system_parts)},
            {"role": "user", "content": "\n".join(user_parts)},
        ]


    async def generate_chapter_stream(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
        max_tokens: Optional[int] = None,
        template_id: Optional[uuid.UUID] = None,
        auto_score: bool = False,
        score_threshold: float = 6.0,
        auto_revise: bool = False,
        preview: bool = False,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        adapter=None,
    ) -> AsyncGenerator[str, None]:
        """流式生成章节内容，yield SSE 事件，支持自动评分重试"""
        max_retries = 2 if auto_score else 0

        for retry_count in range(max_retries + 1):
            # 加载实体链
            try:
                chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
            except ValueError as e:
                yield json.dumps({"type": "error", "message": str(e)})
                return

            chapter = chain["chapter"]
            chapter_outline = chain["chapter_outline"]
            outline = chain["outline"]
            project = chain["project"]
            model_config = chain["model_config"]

            # 并发锁定：检查是否正在生成中
            if chapter.status == "generating":
                yield json.dumps({"type": "error", "message": "该章节正在生成中，请稍后再试"})
                return

            # 标记为生成中，记录原始状态用于 preview 模式恢复
            previous_status = chapter.status
            chapter.status = "generating"
            await self.db.flush()

            # 检查预算
            budget_service = CostBudgetService(self.db)
            budget_check = await budget_service.check_budget()
            if not budget_check["allowed"]:
                yield json.dumps({"type": "error", "message": "当月费用预算已用完，请在费用管理中调整预算"})
                return

            # 获取模板（如果指定）
            template = None
            if template_id:
                template_result = await self.db.execute(
                    select(PromptTemplate).where(PromptTemplate.id == template_id)
                )
                template = template_result.scalar_one_or_none()

            # 构建 prompt（根据模型上下文窗口计算预算）
            context_budget = self._calc_context_budget(model_config)
            bundle = await self._build_context_bundle(
                chapter_outline=chapter_outline,
                project=project,
                outline=outline,
                chapter_id=chapter_id,
                context_budget=context_budget,
                model_config=model_config,
            )
            if bundle["conflicts"]:
                yield json.dumps({"type": "conflicts", "conflicts": bundle["conflicts"]}, ensure_ascii=False)
            messages = await self._build_chapter_prompt(chapter_outline, project, outline, template, chapter_id, context_budget, model_config)

            # 创建或复用适配器
            if adapter is None:
                adapter = await AdapterFactory.create(model_config)

            # 重试通知
            if retry_count > 0:
                yield json.dumps({
                    "type": "retrying",
                    "retry_count": retry_count,
                    "max_retries": max_retries,
                }, ensure_ascii=False)

            previous_content = chapter.content or ""

            # 流式生成
            start_time = time.time()
            content_parts = []
            try:
                async for token in adapter.generate_stream(messages, max_tokens=max_tokens, temperature=temperature, top_p=top_p):
                    content_parts.append(token)
                    yield json.dumps({"type": "token", "content": token}, ensure_ascii=False)

                # 生成完成
                full_content = "".join(content_parts)
                word_count = len(full_content)

                if not full_content or len(full_content.strip()) < 50:
                    yield json.dumps({
                        "type": "error",
                        "message": "生成内容为空或过短，LLM 未返回有效内容，请检查模型配置和网络连接",
                    }, ensure_ascii=False)
                    return

                duration_ms = int((time.time() - start_time) * 1000)

                # 优先使用 API 返回的真实 token 数据
                usage = adapter.last_usage
                if usage and usage.completion_tokens > 0:
                    token_used = usage.completion_tokens
                    estimated_input_tokens = usage.prompt_tokens
                else:
                    token_used = adapter.count_tokens(full_content)
                    estimated_input_tokens = adapter.count_tokens(messages[0]["content"] + messages[1]["content"])

                # 计算费用
                input_rate, output_rate = self._get_effective_rates(model_config)
                cost = input_rate * estimated_input_tokens / 1000 + output_rate * token_used / 1000
                chapter.cost = round(cost, 6)

                if preview:
                    # 预览模式：只写入版本记录，不覆盖正文
                    chapter.status = previous_status or "empty"
                else:
                    # 正式模式：覆盖正文
                    chapter.content = full_content
                    chapter.word_count = word_count
                    chapter.model_id = model_id
                    chapter.token_used = token_used
                    chapter.status = "completed"

                # 自动评分
                quality_score_value = None
                if auto_score:
                    try:
                        quality_service = QualityService(self.db)
                        score_result = await quality_service.score_text(
                            content=full_content,
                            outline_summary=chapter_outline.summary or "",
                            genre=project.genre or "",
                            model_config=model_config,
                        )
                        quality_score_value = score_result["overall"]

                        yield json.dumps({
                            "type": "scored",
                            "score": quality_score_value,
                            "retry_count": retry_count,
                            "details": score_result,
                        }, ensure_ascii=False)

                        # 如果分数低于阈值且还有重试次数，继续重试
                        if quality_score_value < score_threshold and retry_count < max_retries:
                            yield json.dumps({
                                "type": "low_score",
                                "score": quality_score_value,
                                "threshold": score_threshold,
                            }, ensure_ascii=False)
                            continue  # 继续下一次重试

                    except Exception as e:
                        # 评分失败不影响生成结果
                        yield json.dumps({
                            "type": "score_error",
                            "message": str(e),
                        }, ensure_ascii=False)

                # 创建版本（带评分）
                version_count_result = await self.db.execute(
                    select(ChapterVersion).where(ChapterVersion.chapter_id == chapter_id)
                )
                versions = list(version_count_result.scalars().all())
                diff_snapshot = self._build_diff_snapshot(previous_content, full_content)
                version = ChapterVersion(
                    chapter_id=chapter_id,
                    version_number=len(versions) + 1,
                    content=full_content,
                    word_count=word_count,
                    model_id=model_id,
                    token_used=token_used,
                    quality_score=Decimal(str(quality_score_value)) if quality_score_value is not None else None,
                    change_type="preview" if preview else "ai_generate",
                    diff_snapshot=diff_snapshot,
                )
                self.db.add(version)

                # 记录费用
                await budget_service.record_cost(Decimal(str(chapter.cost)))

                # 写入生成日志
                log = GenerationLog(
                    chapter_id=chapter_id,
                    model_id=model_id,
                    status="completed",
                    token_input=estimated_input_tokens,
                    token_output=token_used,
                    cost=chapter.cost,
                    duration_ms=duration_ms,
                    quality_score=quality_score_value,
                    retry_count=retry_count,
                )
                self.db.add(log)

                await self.db.commit()

                # 字数不足提示：告知前端而非静默续写
                min_target = project.target_words_per_chapter_min or 3000
                if word_count < min_target * 0.7:
                    yield json.dumps({
                        "type": "short_content",
                        "word_count": word_count,
                        "target": min_target,
                    }, ensure_ascii=False)

                await self._deposit_story_bible_draft(
                    project_id=project.id,
                    chapter_outline=chapter_outline,
                    chapter_content=full_content,
                    model_config=model_config,
                    adapter=adapter,
                    chapter_id=chapter.id,
                )

                # 后写验证（零 LLM 成本）
                target = project.target_words_per_chapter_min or 0
                validation_issues = ValidationService.validate(full_content, target)
                if validation_issues:
                    yield json.dumps({
                        "type": "validation",
                        "issues": validation_issues,
                    }, ensure_ascii=False)

                # 审核-修改循环（auto_revise）
                if auto_revise and validation_issues:
                    critical = [i for i in validation_issues if i.get("severity") == "error"]
                    if critical:
                        for revise_attempt in range(2):  # 最多 2 轮修改
                            yield json.dumps({
                                "type": "status",
                                "message": f"发现 {len(critical)} 个质量问题，自动修改中（第 {revise_attempt + 1} 轮）...",
                            }, ensure_ascii=False)

                            revised_content = await self._revise_for_quality(
                                model_config, full_content, critical, project.genre or "",
                                adapter=adapter,
                            )
                            revised_issues = ValidationService.validate(revised_content, target)
                            revised_critical = [i for i in revised_issues if i.get("severity") == "error"]

                            if revised_content and len(revised_content) > 100:
                                full_content = revised_content
                                word_count = len(full_content)
                                # 更新数据库
                                chapter.content = full_content
                                chapter.word_count = word_count
                                if adapter.last_usage:
                                    token_used = adapter.last_usage.completion_tokens
                                else:
                                    token_used = adapter.count_tokens(full_content)
                                chapter.token_used = token_used
                                await self.db.commit()

                                yield json.dumps({
                                    "type": "validation",
                                    "issues": revised_issues,
                                }, ensure_ascii=False)

                            if not revised_critical:
                                break
                            critical = revised_critical

                        yield json.dumps({
                            "type": "status",
                            "message": "自动修改完成",
                        }, ensure_ascii=False)

                yield json.dumps({
                    "type": "done",
                    "word_count": word_count,
                    "token_used": token_used,
                    "cost": chapter.cost,
                    "duration_ms": duration_ms,
                    "score": quality_score_value,
                    "retry_count": retry_count,
                    "preview": preview,
                    "preview_version_id": str(version.id) if preview else None,
                }, ensure_ascii=False)

                # 生成结构化摘要（确保批量生成时下一章能看到前章摘要）
                if not preview:
                    await self._generate_content_summary(chapter, model_config, adapter=adapter)
                    # 本章正文落定后，后续章节的上下文摘要可能失效，交 worker 刷新
                    from app.services.summary_worker import mark_summaries_stale
                    try:
                        await mark_summaries_stale(self.db, chapter.id)
                    except Exception:  # noqa: BLE001
                        pass

                return  # 成功完成，退出重试循环

            except Exception as e:
                chapter.status = "error"
                log = GenerationLog(
                    chapter_id=chapter_id,
                    model_id=model_id,
                    status="failed",
                    error_message=str(e)[:500],
                    retry_count=retry_count,
                )
                self.db.add(log)
                await self.db.commit()
                yield json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)
                return

    async def continue_chapter_stream(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
        max_tokens: Optional[int] = None,
        auto_revise: bool = False,
        adapter=None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
    ) -> AsyncGenerator[str, None]:
        """续写章节内容，基于已有内容继续生成"""
        # 加载实体链
        try:
            chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
        except ValueError as e:
            yield json.dumps({"type": "error", "message": str(e)})
            return

        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        outline = chain["outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        # 并发锁定
        if chapter.status == "generating":
            yield json.dumps({"type": "error", "message": "该章节正在生成中，请稍后再试"})
            return
        chapter.status = "generating"
        await self.db.flush()

        if not chapter.content or len(chapter.content.strip()) < 50:
            yield json.dumps({"type": "error", "message": "章节内容过短，无法续写"})
            chapter.status = "completed"
            await self.db.flush()
            return

        # 检查预算
        budget_service = CostBudgetService(self.db)
        budget_check = await budget_service.check_budget()
        if not budget_check["allowed"]:
            yield json.dumps({"type": "error", "message": "当月费用预算已用完，请在费用管理中调整预算"})
            return

        # 构建续写 prompt（带完整上下文）
        existing_content = chapter.content
        previous_content = existing_content or ""
        context_tail = existing_content[-2000:] if len(existing_content) > 2000 else existing_content

        min_words = project.target_words_per_chapter_min or 3000
        max_words = project.target_words_per_chapter_max or 5000

        # 构建统一上下文（续写时减预算）
        context_budget = self._calc_context_budget(model_config, extra_chars=len(context_tail))
        bundle = await self._build_context_bundle(
            chapter_outline=chapter_outline,
            project=project,
            outline=outline,
            chapter_id=chapter_id,
            context_budget=context_budget,
            model_config=model_config,
        )
        if bundle["conflicts"]:
            yield json.dumps({"type": "conflicts", "conflicts": bundle["conflicts"]}, ensure_ascii=False)

        terms_text = bundle["terms_text"]
        prev_summaries_text = bundle["prev_summaries_text"]
        characters_text = bundle["characters_text"]
        worldview_text = bundle["worldview_text"]
        foreshadowings_text = bundle["foreshadowings_text"]
        story_bible_text = bundle["story_bible_text"]

        system_parts = [
            f"你是一位专业的{project.genre or ''}小说作家。",
            "请续写以下小说内容，保持风格、语气和情节的连贯性。直接输出续写内容，不要重复已有内容。",
        ]
        if project.style_reference:
            system_parts.append(f"\n参考风格：\n{project.style_reference}")
        if terms_text:
            system_parts.append(f"\n专有名词（请保持一致）：\n{terms_text}")
        if prev_summaries_text:
            system_parts.append(f"\n前文摘要：\n{prev_summaries_text}")
        if characters_text:
            system_parts.append(f"\n【主要角色】\n{characters_text}")
        if worldview_text:
            system_parts.append(f"\n【世界观】\n{worldview_text}")
        if foreshadowings_text:
            system_parts.append(f"\n【活跃伏笔】\n{foreshadowings_text}")
        if story_bible_text:
            system_parts.append(f"\n【故事圣经】\n{story_bible_text}")

        # 续写治理契约
        system_parts.append("""
## 续写契约
- 保持与已有内容的叙事连贯性，不要改变已确立的事实。
- 风格、语气、人称视角必须与已有内容一致。
- 不要重复已有内容，从断点处自然衔接。""")

        user_parts = [
            f"章节标题：{chapter_outline.title or f'第{chapter_outline.chapter_number}章'}",
            f"章节概述：{chapter_outline.summary}",
            f"\n已有内容（请从末尾继续）：\n{context_tail}",
            f"\n要求：",
            f"- 续写约{min_words // 2}-{max_words // 2}字",
            f"- 语言：{project.language}",
            "- 保持与已有内容的连贯性",
            "- 直接输出续写内容，不要重复已有内容",
        ]
        if characters_text:
            user_parts.append("- 角色言行必须符合上述角色设定")

        messages = [
            {"role": "system", "content": "\n".join(system_parts)},
            {"role": "user", "content": "\n".join(user_parts)},
        ]

        # 创建或复用适配器
        if adapter is None:
            adapter = await AdapterFactory.create(model_config)

        # 流式生成
        start_time = time.time()
        content_parts = []
        try:
            async for token in adapter.generate_stream(messages, max_tokens=max_tokens, temperature=temperature, top_p=top_p):
                content_parts.append(token)
                yield json.dumps({"type": "token", "content": token}, ensure_ascii=False)

            # 生成完成
            new_content = "".join(content_parts)

            if not new_content or len(new_content.strip()) < 50:
                yield json.dumps({
                    "type": "error",
                    "message": "续写内容为空或过短，LLM 未返回有效内容，请检查模型配置和网络连接",
                }, ensure_ascii=False)
                return

            full_content = existing_content + new_content
            word_count = len(full_content)
            duration_ms = int((time.time() - start_time) * 1000)

            # 保存到数据库
            chapter.content = full_content
            chapter.word_count = word_count
            chapter.model_id = model_id

            # 优先使用 API 返回的真实 token 数据
            usage = adapter.last_usage
            if usage and usage.completion_tokens > 0:
                new_token_used = usage.completion_tokens
                estimated_input_tokens = usage.prompt_tokens
            else:
                new_token_used = adapter.count_tokens(new_content)
                estimated_input_tokens = adapter.count_tokens(messages[0]["content"] + messages[1]["content"])
            chapter.token_used = (chapter.token_used or 0) + new_token_used
            chapter.status = "completed"

            # 计算费用
            input_rate, output_rate = self._get_effective_rates(model_config)
            cost = input_rate * estimated_input_tokens / 1000 + output_rate * new_token_used / 1000
            additional_cost = Decimal(str(round(cost, 6)))
            chapter.cost = (chapter.cost or Decimal("0")) + additional_cost

            # 创建版本
            version_count_result = await self.db.execute(
                select(ChapterVersion).where(ChapterVersion.chapter_id == chapter_id)
            )
            versions = list(version_count_result.scalars().all())
            diff_snapshot = self._build_diff_snapshot(previous_content, full_content)
            version = ChapterVersion(
                chapter_id=chapter_id,
                version_number=len(versions) + 1,
                content=full_content,
                word_count=word_count,
                model_id=model_id,
                token_used=chapter.token_used,
                change_type="ai_generate",
                diff_snapshot=diff_snapshot,
            )
            self.db.add(version)

            # 记录费用
            budget_service = CostBudgetService(self.db)
            await budget_service.record_cost(Decimal(str(chapter.cost)))

            # 写入生成日志
            log = GenerationLog(
                chapter_id=chapter_id,
                model_id=model_id,
                status="completed",
                token_input=estimated_input_tokens,
                token_output=new_token_used,
                cost=chapter.cost,
                duration_ms=duration_ms,
            )
            self.db.add(log)

            await self.db.commit()

            await self._deposit_story_bible_draft(
                project_id=project.id,
                chapter_outline=chapter_outline,
                chapter_content=full_content,
                model_config=model_config,
                adapter=adapter,
                chapter_id=chapter.id,
            )

            # 生成结构化摘要
            await self._generate_content_summary(chapter, model_config, adapter=adapter)
            # 本章正文落定后，后续章节上下文摘要可能失效，交 worker 刷新
            from app.services.summary_worker import mark_summaries_stale
            try:
                await mark_summaries_stale(self.db, chapter.id)
            except Exception:  # noqa: BLE001
                pass

            # 后写验证（零 LLM 成本）
            target = project.target_words_per_chapter_min or 0
            validation_issues = ValidationService.validate(full_content, target)
            if validation_issues:
                yield json.dumps({
                    "type": "validation",
                    "issues": validation_issues,
                }, ensure_ascii=False)

            # 审核-修改循环（auto_revise）
            if auto_revise and validation_issues:
                critical = [i for i in validation_issues if i.get("severity") == "error"]
                if critical:
                    for revise_attempt in range(2):
                        yield json.dumps({
                            "type": "status",
                            "message": f"发现 {len(critical)} 个质量问题，自动修改中（第 {revise_attempt + 1} 轮）...",
                        }, ensure_ascii=False)

                        revised_content = await self._revise_for_quality(
                            model_config, full_content, critical, project.genre or "",
                            adapter=adapter,
                        )
                        revised_issues = ValidationService.validate(revised_content, target)
                        revised_critical = [i for i in revised_issues if i.get("severity") == "error"]

                        if revised_content and len(revised_content) > 100:
                            full_content = revised_content
                            word_count = len(full_content)
                            chapter.content = full_content
                            chapter.word_count = word_count
                            if adapter.last_usage:
                                new_token_used = adapter.last_usage.completion_tokens
                            else:
                                new_token_used = adapter.count_tokens(full_content)
                            chapter.token_used = new_token_used
                            await self.db.commit()

                            yield json.dumps({
                                "type": "validation",
                                "issues": revised_issues,
                            }, ensure_ascii=False)

                        if not revised_critical:
                            break
                        critical = revised_critical

                    yield json.dumps({
                        "type": "status",
                        "message": "自动修改完成",
                    }, ensure_ascii=False)

            yield json.dumps({
                "type": "done",
                "word_count": word_count,
                "token_used": chapter.token_used,
                "cost": chapter.cost,
                "duration_ms": duration_ms,
            }, ensure_ascii=False)

        except Exception as e:
            chapter.status = "error"
            log = GenerationLog(
                chapter_id=chapter_id,
                model_id=model_id,
                status="failed",
                error_message=str(e)[:500],
            )
            self.db.add(log)
            await self.db.commit()
            yield json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)

    async def get_or_create_chapter(self, chapter_outline_id: uuid.UUID) -> Chapter:
        """获取或创建章节"""
        result = await self.db.execute(
            select(Chapter)
            .where(Chapter.chapter_outline_id == chapter_outline_id)
            .order_by(Chapter.updated_at.desc(), Chapter.created_at.desc())
        )
        chapter = result.scalars().first()
        if not chapter:
            chapter = Chapter(chapter_outline_id=chapter_outline_id, content="", status="empty")
            self.db.add(chapter)
            await self.db.flush()
            await self.db.refresh(chapter)
        return chapter

    async def _generate_content_summary(self, chapter: Chapter, model_config: ModelConfig, adapter=None) -> None:
        """生成结构化章节摘要，存入 ChapterSummary + 兼容的 content_summary"""
        if not chapter.content or len(chapter.content.strip()) < 100:
            return
        try:
            if adapter is None:
                adapter = await AdapterFactory.create(model_config)
            # 用摘要替代正文，节省 token
            content_input = chapter.content[:4000]

            structured_prompt = (
                "请分析以下小说章节内容，输出 JSON 对象（不要输出其他内容）：\n"
                "{\n"
                '  "events": [{"event": "事件描述", "characters": ["角色名"], "location": "地点"}],\n'
                '  "character_states": {"角色名": {"status": "当前状态", "emotion": "情感", "location": "位置"}},\n'
                '  "unresolved_hooks": ["未解悬念1", "未解悬念2"],\n'
                '  "resolved_hooks": ["已回收的伏笔1"],\n'
                '  "timeline": "时间描述，如 Day 3 下午",\n'
                '  "locations": ["出现的地点1", "出现的地点2"],\n'
                '  "narrative_threads": ["推进的主线/支线"],\n'
                '  "plain_summary": "200字以内的自然语言摘要"\n'
                "}\n\n"
                f"章节内容：\n{content_input}"
            )
            messages = [
                {"role": "system", "content": "你是一个小说编辑，擅长提炼章节要点和追踪叙事状态。只输出 JSON。"},
                {"role": "user", "content": structured_prompt},
            ]
            summary_parts = []
            async for token in adapter.generate_stream(messages, max_tokens=800):
                summary_parts.append(token)
            raw = "".join(summary_parts).strip()

            data = extract_json(raw)

            # 获取或创建 ChapterSummary
            summary_result = await self.db.execute(
                select(ChapterSummary).where(ChapterSummary.chapter_id == chapter.id)
            )
            cs = summary_result.scalar_one_or_none()
            if not cs:
                cs = ChapterSummary(chapter_id=chapter.id)
                self.db.add(cs)

            cs.events = json.dumps(data.get("events", []), ensure_ascii=False)
            cs.character_states = json.dumps(data.get("character_states", {}), ensure_ascii=False)
            cs.unresolved_hooks = json.dumps(data.get("unresolved_hooks", []), ensure_ascii=False)
            cs.resolved_hooks = json.dumps(data.get("resolved_hooks", []), ensure_ascii=False)
            cs.timeline = data.get("timeline", "")
            cs.locations = json.dumps(data.get("locations", []), ensure_ascii=False)
            cs.narrative_threads = json.dumps(data.get("narrative_threads", []), ensure_ascii=False)
            cs.word_count_at_summary = len(chapter.content)
            cs.is_stale = False

            # 兼容：同时更新自由文本摘要
            plain = data.get("plain_summary", "")
            if plain:
                chapter.content_summary = plain[:500]

            await self.db.commit()

            # 自动追踪角色出场：解析 character_states，匹配角色名并创建/更新出场记录
            await self._sync_character_appearances(chapter, data.get("character_states", {}))

        except Exception as e:
            logger.warning(f"摘要生成失败 (chapter_id={chapter.id}): {e}")

    async def regenerate_summary(self, chapter_outline_id: uuid.UUID, model_id: uuid.UUID) -> dict:
        """手动重生章节摘要(结构化 ChapterSummary + content_summary)。

        覆盖 _generate_content_summary 接入前生成的老章,或摘要当年被 try 静默吞掉的遗漏章。
        复用 _generate_content_summary 的全部逻辑,只在外层做前置校验(抛 ValueError 给用户明确反馈)
        并在调用后重查落库结果供前端刷新展示。

        传章大纲 id(chapter_outline_id):前端 OutlineManager 上下文里拿到的就是大纲 id,
        统一按大纲 id 找对应 chapter(无 chapter 或正文为空时抛错)。
        """
        result = await self.db.execute(
            select(Chapter).where(Chapter.chapter_outline_id == chapter_outline_id)
        )
        chapter = result.scalars().first()
        if not chapter:
            raise ValueError("章节不存在")
        if not chapter.content or len(chapter.content.strip()) < 100:
            raise ValueError("章节正文过短，无法生成摘要")

        model_result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
        model_config = model_result.scalar_one_or_none()
        if not model_config:
            raise ValueError("模型不存在")

        await self._generate_content_summary(chapter, model_config)

        # _generate_content_summary 失败会被自身 try 静默吞掉;此处重查结果如实反映成败
        await self.db.refresh(chapter)
        from app.models.chapter_summary import ChapterSummary

        cs_result = await self.db.execute(
            select(ChapterSummary).where(ChapterSummary.chapter_id == chapter.id)
        )
        cs = cs_result.scalar_one_or_none()
        has_summary = cs is not None and bool(
            cs.events or cs.character_states or cs.unresolved_hooks or cs.timeline
        )
        return {
            "success": has_summary or bool(chapter.content_summary),
            "has_summary": has_summary,
            "content_summary": chapter.content_summary,
            "generated_at": cs.generated_at.isoformat() if cs and cs.generated_at else None,
        }

    async def _sync_character_appearances(self, chapter: Chapter, character_states: dict) -> None:
        """从 ChapterSummary.character_states 自动同步角色出场记录"""
        if not character_states or not isinstance(character_states, dict):
            return
        from app.models.character_appearance import CharacterAppearance

        # 获取 chapter -> chapter_outline
        co_result = await self.db.execute(
            select(ChapterOutline).where(ChapterOutline.id == chapter.chapter_outline_id)
        )
        chapter_outline = co_result.scalar_one_or_none()
        if not chapter_outline:
            return

        # 获取项目下所有角色（通过 worldview 关联）
        from app.models.worldview import worldview_characters
        outline_result = await self.db.execute(
            select(Outline).where(Outline.id == chapter_outline.outline_id)
        )
        outline = outline_result.scalar_one_or_none()
        if not outline:
            return
        project_result = await self.db.execute(
            select(Project).where(Project.id == outline.project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            return

        char_result = await self.db.execute(select(Character))
        all_characters = list(char_result.scalars().all())
        # 按名匹配
        name_to_char = {c.name: c for c in all_characters}

        # 删除该章节旧的自动生成出场记录
        await self.db.execute(
            CharacterAppearance.__table__.delete()
            .where(CharacterAppearance.chapter_outline_id == chapter_outline.id)
        )

        for name, state in character_states.items():
            char = name_to_char.get(name)
            if not char:
                continue
            # 推断角色在该章的重要程度
            role = "minor"
            if isinstance(state, dict):
                status = state.get("status", "")
                if status and "主" in status:
                    role = "major"
                elif status and "提及" in status:
                    role = "mentioned"
            notes = ""
            if isinstance(state, dict):
                parts = []
                if state.get("emotion"):
                    parts.append(f"情感: {state['emotion']}")
                if state.get("location"):
                    parts.append(f"位置: {state['location']}")
                notes = "; ".join(parts)

            appearance = CharacterAppearance(
                character_id=char.id,
                chapter_outline_id=chapter_outline.id,
                role_in_chapter=role,
                notes=notes,
            )
            self.db.add(appearance)

        await self.db.flush()

    async def _revise_for_quality(
        self,
        model_config: ModelConfig,
        content: str,
        issues: list,
        genre: str = "",
        adapter=None,
    ) -> str:
        """调用 LLM 修复 error 级别的验证问题，返回修订后的内容"""
        issue_descriptions = []
        for i, issue in enumerate(issues, 1):
            desc = issue.get("description", "")
            suggestion = issue.get("suggestion", "")
            issue_descriptions.append(f"{i}. [{issue.get('rule', '')}] {desc}")
            if suggestion:
                issue_descriptions.append(f"   建议：{suggestion}")

        issues_text = "\n".join(issue_descriptions)

        messages = [
            {
                "role": "system",
                "content": (
                    f"你是一位专业的{genre}小说编辑。请根据以下质量问题修改小说章节内容。\n"
                    "要求：\n"
                    "- 只修复指出的问题，不要大幅改动原文\n"
                    "- 保持原文的风格、情节和人物设定\n"
                    "- 直接输出修改后的完整章节内容，不要包含任何注释或说明"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"以下是需要修改的章节内容：\n\n{content}\n\n"
                    f"发现以下质量问题：\n{issues_text}\n\n"
                    "请输出修改后的完整章节内容。"
                ),
            },
        ]

        if adapter is None:
            adapter = await AdapterFactory.create(model_config)
        revised_parts = []
        async for token in adapter.generate_stream(messages, max_tokens=len(content) + 1000):
            revised_parts.append(token)
        return "".join(revised_parts)

    async def get_context_usage(self, chapter_id: uuid.UUID, model_id: uuid.UUID) -> dict:
        """返回上下文使用量明细（用于前端可视化）"""
        chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        outline = chain["outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        # 使用当前上下文构建逻辑估算各模块 token
        terminologies_result = await self.db.execute(select(Terminology).where(Terminology.project_id == project.id))
        terminologies = list(terminologies_result.scalars().all())
        terms_text = "\n".join([f"- {t.term}: {t.description or ''}" for t in terminologies]) if terminologies else ""

        prev_summaries_text = ""
        prev_content_snippet = ""
        if chapter_outline.chapter_number > 1:
            prev_result = await self.db.execute(
                select(ChapterOutline, Chapter.content_summary, Chapter.content)
                .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
                .where(
                    ChapterOutline.outline_id == outline.id,
                    ChapterOutline.chapter_number < chapter_outline.chapter_number,
                )
                .order_by(ChapterOutline.chapter_number.desc())
                .limit(5)
            )
            prev_rows = list(prev_result.all())
            prev_lines = []
            for co, content_summary, content in reversed(prev_rows):
                summary = content_summary or co.summary
                prev_lines.append(f"第{co.chapter_number}章 {co.title or ''}: {summary}")
            prev_summaries_text = "\n".join(prev_lines)
            if prev_rows:
                _, _, nearest_content = prev_rows[0]
                if nearest_content:
                    prev_content_snippet = nearest_content[-500:]

        outline_text = f"{chapter_outline.title or ''} {chapter_outline.summary or ''} {chapter_outline.detail_outline or ''}"
        characters_text = await self._get_characters_context(project, outline_text)
        worldview_text = await self._get_worldview_context(project, outline_text)
        foreshadowings_text = await self._get_foreshadowings_context(project, chapter_outline.chapter_number)
        scenes_text = await self._get_scenes_context(chapter.id)
        story_bible_text, _ = await self._get_story_bible_context(project, outline_text)

        adapter = await AdapterFactory.create(model_config)
        modules = [
            ("detail_outline", chapter_outline.detail_outline or ""),
            ("prev_summaries", prev_summaries_text),
            ("prev_content_snippet", prev_content_snippet),
            ("terminologies", terms_text),
            ("story_bible", story_bible_text),
            ("characters", characters_text),
            ("worldview", worldview_text),
            ("foreshadowings", foreshadowings_text),
            ("scenes", scenes_text),
        ]

        module_stats = []
        total_used = 0
        for name, content in modules:
            tokens = adapter.count_tokens(content) if content else 0
            module_stats.append({"name": name, "tokens": tokens})
            total_used += tokens

        max_context = int(model_config.max_context_tokens) if getattr(model_config, "max_context_tokens", None) else 8000
        usage_percent = round((total_used / max_context) * 100, 1) if max_context > 0 else 0.0

        return {
            "max_context_tokens": max_context,
            "total_used_tokens": total_used,
            "usage_percent": usage_percent,
            "modules": module_stats,
        }

    async def refine_chapter_stream(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
        draft_text: str,
        max_suggestions: int = 10,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
    ) -> AsyncGenerator[str, None]:
        """对粗稿给出逐段精修建议（SSE）"""
        try:
            chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
        except ValueError as e:
            yield json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)
            return

        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        outline = chain["outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        paragraphs = [p.strip() for p in draft_text.split("\n") if p.strip()]
        if len(paragraphs) == 0:
            yield json.dumps({"type": "error", "message": "草稿内容为空"}, ensure_ascii=False)
            return

        yield json.dumps({"type": "refine_start", "total": min(len(paragraphs), max_suggestions)}, ensure_ascii=False)

        adapter = await AdapterFactory.create(model_config)
        suggestions_count = 0

        for i, para in enumerate(paragraphs):
            if suggestions_count >= max_suggestions:
                break
            if len(para) < 40:
                continue

            messages = [
                {
                    "role": "system",
                    "content": (
                        f"你是一位资深{project.genre or ''}小说编辑。"
                        "请仅返回 JSON，结构为"
                        '{"revised":"...","reason":"...","confidence":0.0}。'
                        "revised 为改写后的同段落文本；reason 简短说明修改原因；"
                        "confidence 为 0-1 小数。不要输出任何额外文字。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"章节标题：{chapter_outline.title or ''}\n"
                        f"章节概述：{chapter_outline.summary or ''}\n\n"
                        f"原段落：\n{para}"
                    ),
                },
            ]

            revised_text = ""
            try:
                parts = []
                async for token in adapter.generate_stream(messages, max_tokens=800, temperature=temperature, top_p=top_p):
                    parts.append(token)
                raw = "".join(parts).strip()
                parsed = extract_json(raw)
                revised_text = (parsed.get("revised") or "").strip()
                reason = (parsed.get("reason") or "建议优化表达和节奏").strip()
                confidence = float(parsed.get("confidence") or 0.65)
            except Exception:
                # JSON 解析失败则跳过该段，避免污染流
                continue

            if not revised_text or revised_text == para:
                continue

            yield json.dumps({
                "type": "refine_suggestion",
                "index": suggestions_count,
                "paragraph_index": i,
                "original": para,
                "revised": revised_text,
                "reason": reason,
                "confidence": max(0.0, min(1.0, confidence)),
            }, ensure_ascii=False)
            suggestions_count += 1

        yield json.dumps({"type": "done", "suggestions_count": suggestions_count}, ensure_ascii=False)

    async def generate_multi_round_stream(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
        max_tokens: Optional[int] = None,
        template_id: Optional[uuid.UUID] = None,
        adapter=None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
    ) -> AsyncGenerator[str, None]:
        """多轮生成：初稿 → 审校 → 定稿"""
        # 加载实体链
        try:
            chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
        except ValueError as e:
            yield json.dumps({"type": "error", "message": str(e)})
            return

        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        outline = chain["outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        # 并发锁定
        if chapter.status == "generating":
            yield json.dumps({"type": "error", "message": "该章节正在生成中，请稍后再试"})
            return
        chapter.status = "generating"
        await self.db.flush()

        # 检查预算
        budget_service = CostBudgetService(self.db)
        budget_check = await budget_service.check_budget()
        if not budget_check["allowed"]:
            yield json.dumps({"type": "error", "message": "当月费用预算已用完，请在费用管理中调整预算"})
            return

        # 获取模板
        template = None
        if template_id:
            template_result = await self.db.execute(
                select(PromptTemplate).where(PromptTemplate.id == template_id)
            )
            template = template_result.scalar_one_or_none()

        # 构建基础 prompt
        context_budget = self._calc_context_budget(model_config)
        bundle = await self._build_context_bundle(
            chapter_outline=chapter_outline,
            project=project,
            outline=outline,
            chapter_id=chapter_id,
            context_budget=context_budget,
            model_config=model_config,
        )
        if bundle["conflicts"]:
            yield json.dumps({"type": "conflicts", "conflicts": bundle["conflicts"]}, ensure_ascii=False)
        base_messages = await self._build_chapter_prompt(chapter_outline, project, outline, template, chapter_id, context_budget, model_config)
        if adapter is None:
            adapter = await AdapterFactory.create(model_config)

        rounds = [
            {"name": "draft", "label": "初稿"},
            {"name": "review", "label": "审校"},
            {"name": "final", "label": "定稿"},
        ]

        draft_content = ""
        review_content = ""
        total_cost = 0.0
        total_tokens = 0
        total_input_tokens = 0
        start_time = time.time()

        for round_idx, round_info in enumerate(rounds):
            yield json.dumps({
                "type": "round_start",
                "round": round_idx,
                "round_name": round_info["name"],
                "round_label": round_info["label"],
            }, ensure_ascii=False)

            # 根据轮次构建不同的 prompt
            if round_idx == 0:
                # 初稿：使用原始 prompt
                messages = base_messages
            elif round_idx == 1:
                # 审校：只输出审校意见，不重复原文（省 token）
                messages = [
                    {
                        "role": "system",
                        "content": (
                            "你是一位资深的文学编辑。请审阅以下小说章节，给出具体的修改意见。\n"
                            "要求：\n"
                            "- 逐条列出需要修改的地方，标明段落编号或引用原文片段\n"
                            "- 只输出修改建议，不要重复不需要修改的原文\n"
                            "- 每条建议格式：[位置] 问题 → 修改方向\n"
                            "- 涵盖：情节逻辑、文笔质量、角色一致性、节奏、细节"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"章节标题：{chapter_outline.title or f'第{chapter_outline.chapter_number}章'}\n"
                            f"章节概述：{chapter_outline.summary}\n\n"
                            f"初稿内容：\n{draft_content}"
                        ),
                    },
                ]
            else:
                # 定稿：增量模式 — 只输出需要修改的段落，省 token
                review_summary = review_content[:1500] if len(review_content) > 1500 else review_content
                messages = [
                    {
                        "role": "system",
                        "content": (
                            "你是一位专业的{genre}小说作家。请根据审校意见修改章节中需要改进的部分。\n"
                            "要求：\n"
                            "- 只输出需要修改的段落，未修改的段落不要输出\n"
                            "- 每个修改段落前加标记 [段落N]（N 为从 1 开始的段落编号）\n"
                            "- 段落按双换行符分隔，编号即第几个双换行分隔的段落\n"
                            "- 采纳审校意见中的合理建议\n"
                            "- 保持原文的整体风格和基调\n"
                            "- 如果需要大幅重写（超过一半段落），则直接输出完整章节，不加段落标记\n"
                            "- 不要包含注释或说明文字"
                        ).format(genre=project.genre or ""),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"章节标题：{chapter_outline.title or f'第{chapter_outline.chapter_number}章'}\n"
                            f"章节概述：{chapter_outline.summary}\n\n"
                            f"原稿：\n{draft_content}\n\n"
                            f"审校意见：\n{review_summary}\n\n"
                            "请输出修改后的段落（带 [段落N] 标记）或完整重写章节。"
                        ),
                    },
                ]


            # 流式生成当前轮次
            round_content_parts = []
            try:
                async for token in adapter.generate_stream(messages, max_tokens=max_tokens, temperature=temperature, top_p=top_p):
                    round_content_parts.append(token)
                    yield json.dumps({
                        "type": "round_token",
                        "round": round_idx,
                        "round_name": round_info["name"],
                        "content": token,
                    }, ensure_ascii=False)

                round_content = "".join(round_content_parts)

                if not round_content or len(round_content.strip()) < 50:
                    yield json.dumps({
                        "type": "error",
                        "message": f"{round_info['label']}生成内容为空或过短，LLM 未返回有效内容，请检查模型配置和网络连接",
                    }, ensure_ascii=False)
                    return

                # 优先使用 API 返回的真实 token 数据
                usage = adapter.last_usage
                if usage and usage.completion_tokens > 0:
                    round_tokens = usage.completion_tokens
                    input_tokens = usage.prompt_tokens
                else:
                    round_tokens = adapter.count_tokens(round_content)
                    input_tokens = adapter.count_tokens(messages[0]["content"] + messages[1]["content"])

                # 计算费用
                input_rate, output_rate = self._get_effective_rates(model_config)
                round_cost = (
                    input_rate * input_tokens / 1000
                    + output_rate * round_tokens / 1000
                )
                total_cost += round_cost
                total_tokens += round_tokens
                total_input_tokens += input_tokens

                # 保存轮次结果
                if round_idx == 0:
                    draft_content = round_content
                elif round_idx == 1:
                    review_content = round_content
                else:
                    # 定稿：尝试增量合并，降级为完整替换
                    final_content = self._merge_revisions(draft_content, round_content)
                    word_count = len(final_content)
                    previous_content = chapter.content or ""

                    chapter.content = final_content
                    chapter.word_count = word_count
                    chapter.model_id = model_id
                    chapter.token_used = total_tokens
                    chapter.status = "completed"
                    chapter.cost = round(total_cost, 6)

                    # 创建版本
                    version_count_result = await self.db.execute(
                        select(ChapterVersion).where(ChapterVersion.chapter_id == chapter_id)
                    )
                    versions = list(version_count_result.scalars().all())
                    version = ChapterVersion(
                        chapter_id=chapter_id,
                        version_number=len(versions) + 1,
                        content=final_content,
                        word_count=word_count,
                        model_id=model_id,
                        token_used=total_tokens,
                        change_type="ai_generate",
                        diff_snapshot=self._build_diff_snapshot(previous_content, final_content),
                    )
                    self.db.add(version)
                    await budget_service.record_cost(Decimal(str(chapter.cost)))

                    # 写入生成日志
                    duration_ms = int((time.time() - start_time) * 1000)
                    log = GenerationLog(
                        chapter_id=chapter_id,
                        model_id=model_id,
                        status="completed",
                        token_input=total_input_tokens,
                        token_output=total_tokens,
                        cost=chapter.cost,
                        duration_ms=duration_ms,
                    )
                    self.db.add(log)

                    await self.db.commit()

                    await self._deposit_story_bible_draft(
                        project_id=project.id,
                        chapter_outline=chapter_outline,
                        chapter_content=final_content,
                        model_config=model_config,
                        adapter=adapter,
                        chapter_id=chapter.id,
                    )

                yield json.dumps({
                    "type": "round_complete",
                    "round": round_idx,
                    "round_name": round_info["name"],
                    "round_label": round_info["label"],
                    "word_count": len(round_content),
                    "token_used": round_tokens,
                    "cost": round(round_cost, 6),
                }, ensure_ascii=False)

            except Exception as e:
                yield json.dumps({"type": "error", "message": f"{round_info['label']}生成失败: {e}"}, ensure_ascii=False)
                return

        # 全部完成
        duration_ms = int((time.time() - start_time) * 1000)

        # 生成结构化摘要
        await self._generate_content_summary(chapter, model_config, adapter=adapter)
        # 本章正文落定后，后续章节上下文摘要可能失效，交 worker 刷新
        from app.services.summary_worker import mark_summaries_stale
        try:
            await mark_summaries_stale(self.db, chapter.id)
        except Exception:  # noqa: BLE001
            pass

        yield json.dumps({
            "type": "done",
            "word_count": len(chapter.content),
            "token_used": total_tokens,
            "cost": round(total_cost, 6),
            "duration_ms": duration_ms,
            "rounds": 3,
        }, ensure_ascii=False)

    async def estimate_cost(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
        template_id: Optional[uuid.UUID] = None,
    ) -> dict:
        """预估生成费用"""
        chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        outline = chain["outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        # 获取模板
        template = None
        if template_id:
            template_result = await self.db.execute(
                select(PromptTemplate).where(PromptTemplate.id == template_id)
            )
            template = template_result.scalar_one_or_none()

        # 构建 prompt 计算 input tokens
        context_budget = self._calc_context_budget(model_config)
        messages = await self._build_chapter_prompt(chapter_outline, project, outline, template, context_budget=context_budget, model_config=model_config)
        prompt_text = messages[0]["content"] + messages[1]["content"]

        adapter = await AdapterFactory.create(model_config)
        estimated_input_tokens = adapter.count_tokens(prompt_text)

        # 估算 output tokens（基于目标字数）
        max_words = project.target_words_per_chapter_max or 5000
        estimated_output_tokens = int(max_words * 1.5)  # 中文约 1.5 tokens/字

        # 计算费用
        input_rate, output_rate = self._get_effective_rates(model_config)
        estimated_cost = (
            input_rate * estimated_input_tokens / 1000
            + output_rate * estimated_output_tokens / 1000
        )

        return {
            "estimated_input_tokens": estimated_input_tokens,
            "estimated_output_tokens": estimated_output_tokens,
            "estimated_cost": round(estimated_cost, 6),
        }

    async def rewrite_selection_stream(
        self,
        chapter_id: uuid.UUID,
        selected_text: str,
        instruction: str,
        model_id: uuid.UUID,
        context_before: str = "",
        context_after: str = "",
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
    ) -> AsyncGenerator[str, None]:
        """改写选中的文本片段，SSE 流式输出"""
        # 加载实体链
        try:
            chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
        except ValueError as e:
            yield json.dumps({"type": "error", "message": str(e)})
            return

        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        outline = chain["outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        # 注入术语表和角色，避免改写违反设定一致性
        terms_text = ""
        terms_result = await self.db.execute(
            select(Terminology).where(Terminology.project_id == project.id).limit(15)
        )
        terminologies = list(terms_result.scalars().all())
        if terminologies:
            terms_text = "\n".join([f"- {t.term}: {t.description or ''}" for t in terminologies])

        # 注入当前章节涉及的角色
        outline_text = f"{chapter_outline.title or ''} {chapter_outline.summary or ''}"
        characters_text = await self._get_characters_context(project, outline_text)

        # 构建改写 prompt
        system_parts = [
            f"你是一位专业的{project.genre or ''}小说编辑。",
            "请根据指令改写选中的文本片段。",
            "保持与上下文的连贯性，直接输出改写后的内容，不要添加任何解释或标记。",
        ]
        if terms_text:
            system_parts.append(f"\n专有名词（改写时必须保持一致）：\n{terms_text}")
        if characters_text:
            system_parts.append(f"\n涉及角色：\n{characters_text}")

        user_parts = []
        if context_before:
            user_parts.append(f"【前文】\n{context_before[-500:]}")
        user_parts.append(f"【待改写文本】\n{selected_text}")
        if context_after:
            user_parts.append(f"【后文】\n{context_after[:500]}")
        user_parts.append(f"\n【改写指令】\n{instruction}")

        messages = [
            {"role": "system", "content": "\n".join(system_parts)},
            {"role": "user", "content": "\n\n".join(user_parts)},
        ]


        adapter = await AdapterFactory.create(model_config)
        full_content = ""
        token_count = 0

        try:
            async for token in adapter.generate_stream(messages, max_tokens=2000, temperature=temperature, top_p=top_p):
                full_content += token
                token_count += 1
                yield json.dumps({"type": "token", "content": token}, ensure_ascii=False)
        except Exception as e:
            yield json.dumps({"type": "error", "message": f"改写失败: {str(e)}"})
            return

        real_tokens = adapter.last_usage.completion_tokens if adapter.last_usage else token_count * 2
        yield json.dumps({
            "type": "done",
            "content": full_content,
            "token_used": real_tokens,
        }, ensure_ascii=False)

    async def brainstorm_chapter_stream(
        self,
        chapter_id: uuid.UUID,
        model_id: uuid.UUID,
        selected_direction: Optional[str] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
    ) -> AsyncGenerator[str, None]:
        chain = await load_chapter_chain_with_model(self.db, chapter_id, model_id)
        chapter = chain["chapter"]
        chapter_outline = chain["chapter_outline"]
        outline = chain["outline"]
        project = chain["project"]
        model_config = chain["model_config"]

        context_budget = self._calc_context_budget(model_config)
        bundle = await self._build_context_bundle(
            chapter_outline=chapter_outline,
            project=project,
            outline=outline,
            chapter_id=chapter_id,
            context_budget=context_budget,
            model_config=model_config,
        )

        adapter = await AdapterFactory.create(model_config)
        chapter_tail = (chapter.content or "")[-1800:]

        yield json.dumps({"type": "brainstorm_start"}, ensure_ascii=False)

        brainstorm_messages = [
            {
                "role": "system",
                "content": (
                    "你是一位经验丰富的小说编辑。作者卡文了，请给出 3 个可执行的后续走向。"
                    "只输出 JSON 对象，格式："
                    "{\"directions\":[{\"title\":\"...\",\"summary\":\"...\",\"why_it_works\":\"...\"},...]}。"
                    "每个 summary 控制在 80 字以内，why_it_works 控制在 40 字以内。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"项目：{project.name}\n"
                    f"章节：第{chapter_outline.chapter_number}章 {chapter_outline.title or ''}\n"
                    f"章节概述：{chapter_outline.summary or ''}\n"
                    f"细纲：{bundle.get('detail_outline') or ''}\n"
                    f"前文摘要：{bundle.get('prev_summaries_text') or ''}\n"
                    f"当前正文末尾：\n{chapter_tail}\n"
                ),
            },
        ]

        brainstorm_result = await adapter.generate(brainstorm_messages, max_tokens=1200, temperature=temperature, top_p=top_p)
        brainstorm_raw = (brainstorm_result.get("content") or "").strip()

        directions: list[dict] = []
        try:
            parsed = extract_json(brainstorm_raw)
            items = parsed.get("directions") if isinstance(parsed, dict) else None
            if isinstance(items, list):
                for item in items[:3]:
                    title = str(item.get("title") or "走向方案").strip()
                    summary = str(item.get("summary") or "").strip()
                    why = str(item.get("why_it_works") or "").strip()
                    if summary:
                        directions.append({
                            "title": title[:30],
                            "summary": summary[:120],
                            "why_it_works": why[:80],
                        })
        except Exception:
            pass

        if not directions:
            lines = [line.strip("-• ") for line in brainstorm_raw.splitlines() if line.strip()]
            for idx, line in enumerate(lines[:3]):
                directions.append({
                    "title": f"走向 {idx + 1}",
                    "summary": line[:120],
                    "why_it_works": "贴合当前章节冲突，便于继续推进。",
                })

        for idx, direction in enumerate(directions[:3]):
            yield json.dumps({
                "type": "brainstorm_direction",
                "index": idx,
                "direction": direction,
            }, ensure_ascii=False)

        transition_text = None
        if selected_direction and directions:
            transition_messages = [
                {
                    "role": "system",
                    "content": (
                        "你是一位小说作者。请根据用户选定走向写一段过渡正文，"
                        "要求 150-220 字，紧接当前内容，直接输出正文，不要解释。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"选定走向：{selected_direction}\n"
                        f"章节设定：{chapter_outline.summary or ''}\n"
                        f"当前正文末尾：\n{chapter_tail}"
                    ),
                },
            ]

            parts = []
            async for token in adapter.generate_stream(transition_messages, max_tokens=500, temperature=temperature, top_p=top_p):
                parts.append(token)
                yield json.dumps({"type": "brainstorm_transition_token", "content": token}, ensure_ascii=False)
            transition_text = "".join(parts).strip()[:600]

        yield json.dumps({
            "type": "done",
            "directions": directions[:3],
            "transition_text": transition_text,
        }, ensure_ascii=False)

