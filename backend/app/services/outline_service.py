from typing import Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.model_config import ModelConfig
from app.models.outline import Outline, ChapterOutline
from app.models.project import Project
from app.schemas.outline import (
    ChapterOutlineCreate,
    ChapterOutlineReorder,
    ChapterOutlineUpdate,
    OutlineCreate,
    OutlineUpdate,
)


class OutlineService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- Outline ---

    async def get_outline(self, project_id: uuid.UUID) -> Optional[Outline]:
        result = await self.db.execute(
            select(Outline)
            .where(Outline.project_id == project_id)
            .order_by(Outline.updated_at.desc(), Outline.created_at.desc())
        )
        return result.scalars().first()

    async def create_outline(self, project_id: uuid.UUID, data: OutlineCreate) -> Outline:
        outline = Outline(project_id=project_id, **data.model_dump())
        self.db.add(outline)
        await self.db.flush()
        await self.db.refresh(outline)
        return outline

    async def update_outline(self, outline_id: uuid.UUID, data: OutlineUpdate) -> Optional[Outline]:
        result = await self.db.execute(select(Outline).where(Outline.id == outline_id))
        outline = result.scalar_one_or_none()
        if not outline:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(outline, field, value)

        await self.db.flush()
        await self.db.refresh(outline)
        return outline

    # --- Chapter Outlines ---

    async def list_chapter_outlines(self, outline_id: uuid.UUID) -> list[dict]:
        """返回章节概述列表，附带章节内容摘要"""
        co_result = await self.db.execute(
            select(ChapterOutline)
            .where(ChapterOutline.outline_id == outline_id)
            .order_by(ChapterOutline.sort_order)
        )
        chapter_outlines = list(co_result.scalars().all())
        if not chapter_outlines:
            return []

        co_ids = [co.id for co in chapter_outlines]
        chapter_result = await self.db.execute(
            select(Chapter)
            .where(Chapter.chapter_outline_id.in_(co_ids))
            .order_by(Chapter.updated_at.desc(), Chapter.created_at.desc())
        )
        latest_summary_by_outline: dict[uuid.UUID, str | None] = {}
        for ch in chapter_result.scalars().all():
            if ch.chapter_outline_id not in latest_summary_by_outline:
                latest_summary_by_outline[ch.chapter_outline_id] = ch.content_summary

        items = []
        for co in chapter_outlines:
            item = {
                "id": co.id,
                "outline_id": co.outline_id,
                "chapter_number": co.chapter_number,
                "title": co.title,
                "summary": co.summary,
                "detail_outline": co.detail_outline,
                "content_summary": latest_summary_by_outline.get(co.id),
                "sort_order": co.sort_order,
                "status": co.status,
                "created_at": co.created_at,
                "updated_at": co.updated_at,
            }
            items.append(item)
        return items

    async def _get_chapter_outline_orm(self, chapter_outline_id: uuid.UUID) -> Optional[ChapterOutline]:
        """获取章节概述 ORM 对象（内部使用）"""
        result = await self.db.execute(
            select(ChapterOutline).where(ChapterOutline.id == chapter_outline_id)
        )
        return result.scalar_one_or_none()

    async def get_chapter_outline(self, chapter_outline_id: uuid.UUID) -> Optional[dict]:
        """返回章节概述，附带章节内容摘要"""
        co_result = await self.db.execute(
            select(ChapterOutline).where(ChapterOutline.id == chapter_outline_id)
        )
        co = co_result.scalar_one_or_none()
        if not co:
            return None

        chapter_result = await self.db.execute(
            select(Chapter.content_summary)
            .where(Chapter.chapter_outline_id == chapter_outline_id)
            .order_by(Chapter.updated_at.desc(), Chapter.created_at.desc())
        )
        content_summary = chapter_result.scalars().first()

        return {
            "id": co.id,
            "outline_id": co.outline_id,
            "chapter_number": co.chapter_number,
            "title": co.title,
            "summary": co.summary,
            "detail_outline": co.detail_outline,
            "content_summary": content_summary,
            "sort_order": co.sort_order,
            "status": co.status,
            "created_at": co.created_at,
            "updated_at": co.updated_at,
        }

    async def create_chapter_outline(
        self, outline_id: uuid.UUID, data: ChapterOutlineCreate
    ) -> ChapterOutline:
        chapter_outline = ChapterOutline(outline_id=outline_id, **data.model_dump())
        self.db.add(chapter_outline)
        await self.db.flush()
        await self.db.refresh(chapter_outline)
        return chapter_outline

    async def update_chapter_outline(
        self, chapter_outline_id: uuid.UUID, data: ChapterOutlineUpdate
    ) -> Optional[dict]:
        chapter_outline = await self._get_chapter_outline_orm(chapter_outline_id)
        if not chapter_outline:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(chapter_outline, field, value)

        await self.db.flush()
        await self.db.refresh(chapter_outline)
        return await self.get_chapter_outline(chapter_outline_id)

    async def delete_chapter_outline(self, chapter_outline_id: uuid.UUID) -> bool:
        chapter_outline = await self._get_chapter_outline_orm(chapter_outline_id)
        if not chapter_outline:
            return False
        await self.db.delete(chapter_outline)
        return True

    async def reorder_chapter_outlines(
        self, outline_id: uuid.UUID, items: list[ChapterOutlineReorder]
    ) -> list[dict]:
        for item in items:
            result = await self.db.execute(
                select(ChapterOutline).where(
                    ChapterOutline.id == item.id,
                    ChapterOutline.outline_id == outline_id,
                )
            )
            chapter_outline = result.scalar_one_or_none()
            if chapter_outline:
                chapter_outline.sort_order = item.sort_order

        await self.db.flush()
        return await self.list_chapter_outlines(outline_id)

    # --- AI Generation ---

    async def _get_model_adapter(self, model_id: uuid.UUID):
        result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
        model_config = result.scalar_one_or_none()
        if not model_config:
            raise ValueError("模型不存在")
        return AdapterFactory.create(model_config)

    async def expand_detail_outline(
        self, chapter_outline_id: uuid.UUID, model_id: uuid.UUID
    ) -> dict:
        """AI 生成章节细纲"""
        chapter_outline = await self._get_chapter_outline_orm(chapter_outline_id)
        if not chapter_outline:
            raise ValueError("章节概述不存在")

        # Get project info for context
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

        adapter = await self._get_model_adapter(model_id)

        genre = project.genre if project else ""
        prompt = f"""你是一位资深小说策划编辑。请根据以下章节概述，生成一份详细的章节细纲。

{"小说类型：" + genre if genre else ""}
章节编号：第{chapter_outline.chapter_number}章
章节标题：{chapter_outline.title or '未定'}
章节概述：{chapter_outline.summary}

请生成详细的章节细纲，包括：
1. 场景设定（时间、地点、氛围）
2. 出场角色及其状态
3. 情节要点（3-5个关键情节点）
4. 对话要点（关键对话的方向）
5. 情感节奏（起伏变化）
6. 伏笔或悬念（如有）

请直接输出细纲内容，不要包含标题。"""

        messages = [{"role": "user", "content": prompt}]
        result = await adapter.generate(messages)
        content = result.get("content", "")

        chapter_outline.detail_outline = content.strip()
        await self.db.flush()
        await self.db.refresh(chapter_outline)
        return await self.get_chapter_outline(chapter_outline_id)

    async def generate_full_outline(
        self, project_id: uuid.UUID, model_id: uuid.UUID, synopsis: str = "", force: bool = False
    ) -> Outline:
        """AI 生成全书大纲"""
        project_result = await self.db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError("项目不存在")

        adapter = await self._get_model_adapter(model_id)

        genre = project.genre or ""
        description = project.description or ""
        context = synopsis or description

        prompt = f"""你是一位资深小说策划编辑。请为以下小说生成一份完整的章节大纲。

{"小说类型：" + genre if genre else ""}
{"小说简介：" + context if context else ""}
小说名称：{project.name}

请生成一份包含 20 个章节的大纲，每个章节包含：
- 章节编号
- 章节标题（简短有力）
- 章节概述（2-3句话描述本章主要内容）

请以 JSON 数组格式输出，格式如下：
[
  {{"chapter_number": 1, "title": "章节标题", "summary": "章节概述"}},
  ...
]

只输出 JSON，不要其他内容。"""

        messages = [{"role": "user", "content": prompt}]
        result = await adapter.generate(messages)
        content = result.get("content", "")

        # Parse JSON from response - try multiple extraction strategies
        import json
        import re
        chapters_data = None

        # Strategy 1: Extract from markdown code block
        code_block_match = re.search(r'```(?:json)?\s*(\[[\s\S]*?\])\s*```', content)
        if code_block_match:
            try:
                chapters_data = json.loads(code_block_match.group(1))
            except json.JSONDecodeError:
                pass

        # Strategy 2: Find the outermost JSON array
        if chapters_data is None:
            array_match = re.search(r'\[[\s\S]*\]', content)
            if array_match:
                try:
                    chapters_data = json.loads(array_match.group(0))
                except json.JSONDecodeError:
                    pass

        # Strategy 3: Try parsing the whole content
        if chapters_data is None:
            try:
                chapters_data = json.loads(content)
            except json.JSONDecodeError:
                pass

        if chapters_data is None or not isinstance(chapters_data, list):
            raise ValueError(f"AI 返回的内容无法解析为章节列表。原始内容：{content[:200]}...")

        # Create or update outline
        existing = await self.get_outline(project_id)
        if existing:
            outline = existing
            outline.synopsis = synopsis or description
        else:
            outline = Outline(project_id=project_id, synopsis=synopsis or description)
            self.db.add(outline)

        await self.db.flush()
        await self.db.refresh(outline)

        # Check if existing content would be lost
        from app.models.chapter import Chapter, ChapterVersion
        if existing and not force:
            existing_co_result = await self.db.execute(
                select(ChapterOutline).where(ChapterOutline.outline_id == existing.id)
            )
            existing_cos = list(existing_co_result.scalars().all())
            if existing_cos:
                # Check if any chapters have content
                for co in existing_cos:
                    ch_result = await self.db.execute(
                        select(Chapter).where(Chapter.chapter_outline_id == co.id, Chapter.status == "completed")
                    )
                    if ch_result.scalars().first():
                        raise ValueError("大纲已有生成内容，请使用 force=true 参数确认重新生成")

        # Delete existing chapter outlines and their chapters (with cascade)
        existing_chapter_outlines_result = await self.db.execute(
            select(ChapterOutline).where(ChapterOutline.outline_id == outline.id)
        )
        for co in existing_chapter_outlines_result.scalars().all():
            # Delete chapters linked to this outline
            chapter_result = await self.db.execute(
                select(Chapter).where(Chapter.chapter_outline_id == co.id)
            )
            for chapter in chapter_result.scalars().all():
                # Delete versions (cascade handles this, but be explicit)
                await self.db.delete(chapter)
            await self.db.delete(co)

        # Create chapter outlines
        for i, ch_data in enumerate(chapters_data):
            chapter_outline = ChapterOutline(
                outline_id=outline.id,
                chapter_number=ch_data.get("chapter_number", i + 1),
                title=ch_data.get("title", ""),
                summary=ch_data.get("summary", ""),
                sort_order=i,
            )
            self.db.add(chapter_outline)

        await self.db.flush()
        await self.db.refresh(outline)
        return outline

    async def generate_reverse_outline(
        self, outline_id: uuid.UUID, model_id: uuid.UUID
    ) -> dict:
        """生成反向大纲：对比计划大纲与实际内容"""
        from app.schemas.outline import ReverseOutlineItem

        # Get outline and project
        outline_result = await self.db.execute(select(Outline).where(Outline.id == outline_id))
        outline = outline_result.scalar_one_or_none()
        if not outline:
            raise ValueError("大纲不存在")

        # Get all chapter outlines
        co_result = await self.db.execute(
            select(ChapterOutline)
            .where(ChapterOutline.outline_id == outline_id)
            .order_by(ChapterOutline.chapter_number)
        )
        chapter_outlines = list(co_result.scalars().all())

        # Get all chapters
        co_ids = [co.id for co in chapter_outlines]
        ch_result = await self.db.execute(
            select(Chapter).where(Chapter.chapter_outline_id.in_(co_ids))
        )
        chapters_by_outline = {str(ch.chapter_outline_id): ch for ch in ch_result.scalars().all()}

        # Build items: collect chapters that have content for AI summarization
        items = []
        chapters_to_summarize = []  # (index, title, planned_summary, content, word_count)

        for i, co in enumerate(chapter_outlines):
            ch = chapters_by_outline.get(str(co.id))
            if ch and ch.content and ch.status == "completed":
                chapters_to_summarize.append((i, co.title or f"第{co.chapter_number}章", co.summary, ch.content, ch.word_count))
            elif ch and ch.content:
                chapters_to_summarize.append((i, co.title or f"第{co.chapter_number}章", co.summary, ch.content, ch.word_count))
            else:
                items.append(ReverseOutlineItem(
                    chapter_number=co.chapter_number,
                    title=co.title or f"第{co.chapter_number}章",
                    planned_summary=co.summary,
                    actual_summary=None,
                    word_count=0,
                    status="missing",
                    notes="章节尚未生成",
                ))

        if not chapters_to_summarize:
            return {
                "items": [item.model_dump() for item in items],
                "overall_assessment": "所有章节均未生成内容，无法进行反向大纲分析。",
                "match_rate": 0.0,
            }

        # Use AI to generate actual summaries in batches of 3
        adapter = await self._get_model_adapter(model_id)
        actual_summaries = {}

        for batch_start in range(0, len(chapters_to_summarize), 3):
            batch = chapters_to_summarize[batch_start:batch_start + 3]
            batch_prompt_parts = []
            for idx, title, _planned, content, _wc in batch:
                truncated = content[:1500] + ("..." if len(content) > 1500 else "")
                batch_prompt_parts.append(f"【第{idx + 1}部分 - {title}】\n{truncated}")

            prompt = f"""你是一位资深小说编辑。请为以下{len(batch)}个已写完的章节各生成一句话实际内容摘要（30字以内），并判断是否偏离了原定大纲。

{chr(10).join(batch_prompt_parts)}

原定大纲：
{chr(10).join(f"第{idx + 1}部分（{title}）：{_planned}" for idx, title, _planned, _, _ in batch)}

请以 JSON 数组格式输出，每个元素包含：
- index: 对应的序号（从0开始）
- actual_summary: 实际内容的一句话摘要
- status: "matched"（基本符合大纲）、"drifted"（有偏移但可接受）、"extra"（出现了大纲中没有的重要内容）
- notes: 简要说明偏移原因（如果status不是matched）

只输出 JSON 数组，不要其他内容。"""

            messages = [{"role": "user", "content": prompt}]
            try:
                result = await adapter.generate(messages)
                content_str = result.get("content", "")

                import json
                import re
                parsed = None
                code_block = re.search(r'```(?:json)?\s*(\[[\s\S]*?\])\s*```', content_str)
                if code_block:
                    try:
                        parsed = json.loads(code_block.group(1))
                    except json.JSONDecodeError:
                        pass
                if parsed is None:
                    array_match = re.search(r'\[[\s\S]*\]', content_str)
                    if array_match:
                        try:
                            parsed = json.loads(array_match.group(0))
                        except json.JSONDecodeError:
                            pass

                if parsed and isinstance(parsed, list):
                    for item in parsed:
                        idx = item.get("index", 0)
                        actual_summaries[idx] = item
            except Exception:
                for idx, _, _, _, _ in batch:
                    actual_summaries[idx] = {
                        "index": idx,
                        "actual_summary": "AI分析失败",
                        "status": "matched",
                        "notes": "无法获取AI评估",
                    }

        # Build final items
        matched_count = 0
        for idx, title, planned, _content, wc in chapters_to_summarize:
            ai_result = actual_summaries.get(idx, {})
            status = ai_result.get("status", "matched")
            if status == "matched":
                matched_count += 1
            items.append(ReverseOutlineItem(
                chapter_number=chapter_outlines[idx].chapter_number,
                title=title,
                planned_summary=planned,
                actual_summary=ai_result.get("actual_summary", ""),
                word_count=wc,
                status=status,
                notes=ai_result.get("notes"),
            ))

        items.sort(key=lambda x: x.chapter_number)
        total = len(items)
        match_rate = (matched_count / total * 100) if total > 0 else 0

        assessment_parts = []
        if match_rate >= 80:
            assessment_parts.append("整体执行度很高，实际写作与大纲高度一致。")
        elif match_rate >= 50:
            assessment_parts.append("整体执行度中等，部分章节存在偏移。")
        else:
            assessment_parts.append("整体执行度较低，实际写作与大纲差异较大。")

        drifted = sum(1 for it in items if it.status == "drifted")
        extra = sum(1 for it in items if it.status == "extra")
        missing = sum(1 for it in items if it.status == "missing")

        if drifted > 0:
            assessment_parts.append(f"{drifted}个章节存在方向偏移。")
        if extra > 0:
            assessment_parts.append(f"{extra}个章节有新增的意外元素。")
        if missing > 0:
            assessment_parts.append(f"{missing}个章节尚未生成。")

        return {
            "items": [item.model_dump() for item in items],
            "overall_assessment": " ".join(assessment_parts),
            "match_rate": round(match_rate, 1),
        }
