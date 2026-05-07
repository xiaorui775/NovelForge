from typing import Optional
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chapter import Chapter
from app.models.outline import ChapterOutline, Outline
from app.models.terminology import Terminology
from app.schemas.terminology import TerminologyCreate, TerminologyUpdate


class TerminologyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_terminologies(self, project_id: uuid.UUID) -> list[Terminology]:
        result = await self.db.execute(
            select(Terminology)
            .where(Terminology.project_id == project_id)
            .order_by(Terminology.category, Terminology.term)
        )
        return list(result.scalars().all())

    async def get_terminology(self, terminology_id: uuid.UUID) -> Optional[Terminology]:
        result = await self.db.execute(
            select(Terminology).where(Terminology.id == terminology_id)
        )
        return result.scalar_one_or_none()

    async def create_terminology(self, project_id: uuid.UUID, data: TerminologyCreate) -> Terminology:
        terminology = Terminology(project_id=project_id, **data.model_dump())
        self.db.add(terminology)
        await self.db.flush()
        await self.db.refresh(terminology)
        return terminology

    async def update_terminology(self, terminology_id: uuid.UUID, data: TerminologyUpdate) -> Optional[Terminology]:
        terminology = await self.get_terminology(terminology_id)
        if not terminology:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(terminology, field, value)
        await self.db.flush()
        await self.db.refresh(terminology)
        return terminology

    async def delete_terminology(self, terminology_id: uuid.UUID) -> bool:
        terminology = await self.get_terminology(terminology_id)
        if not terminology:
            return False
        await self.db.delete(terminology)
        return True

    async def check_consistency(self, project_id: uuid.UUID) -> dict:
        """检查项目中所有章节的术语一致性"""
        # 获取术语列表
        terms_result = await self.db.execute(
            select(Terminology).where(Terminology.project_id == project_id)
        )
        terms = list(terms_result.scalars().all())
        if not terms:
            return {"issues": [], "total_terms": 0, "checked_chapters": 0}

        # 获取大纲
        outline_result = await self.db.execute(
            select(Outline)
            .where(Outline.project_id == project_id)
            .order_by(Outline.updated_at.desc(), Outline.created_at.desc())
        )
        outline = outline_result.scalars().first()
        if not outline:
            return {"issues": [], "total_terms": len(terms), "checked_chapters": 0}

        # 获取所有章节
        co_result = await self.db.execute(
            select(ChapterOutline).where(ChapterOutline.outline_id == outline.id)
        )
        chapter_outlines = list(co_result.scalars().all())

        issues = []
        checked = 0

        for co in chapter_outlines:
            chapter_result = await self.db.execute(
                select(Chapter)
                .where(Chapter.chapter_outline_id == co.id)
                .order_by(Chapter.updated_at.desc(), Chapter.created_at.desc())
            )
            chapter = chapter_result.scalars().first()
            if not chapter or not chapter.content:
                continue

            checked += 1
            content = chapter.content

            # 检查每个术语是否在章节中出现，如果出现则检查写法是否一致
            for term in terms:
                # 使用模糊匹配查找可能的变体
                term_text = term.term
                if len(term_text) < 2:
                    continue

                # 精确匹配
                exact_count = content.count(term_text)

                # 检查常见变体（如繁简、同音字等）
                # 这里简单检查：如果术语出现过但频率很低，可能是变体写法
                if exact_count > 0:
                    continue

                # 检查是否有可能的近似变体（简单实现：检查术语的每个字是否都出现）
                chars = list(term_text)
                if len(chars) >= 2:
                    all_chars_present = all(c in content for c in chars)
                    if all_chars_present:
                        # 所有字符都出现但没有完整匹配，可能是变体
                        # 查找可能的上下文
                        for i in range(len(content) - 1):
                            if content[i] == chars[0]:
                                snippet = content[max(0, i - 5):i + len(term_text) + 5]
                                if any(c in snippet for c in chars[1:]):
                                    issues.append({
                                        "chapter_number": co.chapter_number,
                                        "chapter_title": co.title or f"第{co.chapter_number}章",
                                        "term": term_text,
                                        "issue": "可能存在变体写法",
                                        "context": snippet[:50],
                                    })
                                    break

        return {
            "issues": issues[:50],  # 限制返回数量
            "total_terms": len(terms),
            "checked_chapters": checked,
        }
