import uuid
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.character import Character
from app.models.character_appearance import CharacterAppearance
from app.models.outline import ChapterOutline


class CharacterArcService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def add_appearance(
        self, character_id: uuid.UUID, chapter_outline_id: uuid.UUID,
        role_in_chapter: str = "minor", notes: str = ""
    ) -> CharacterAppearance:
        appearance = CharacterAppearance(
            character_id=character_id,
            chapter_outline_id=chapter_outline_id,
            role_in_chapter=role_in_chapter,
            notes=notes,
        )
        self.db.add(appearance)
        await self.db.flush()
        await self.db.refresh(appearance)
        return appearance

    async def update_appearance(
        self, appearance_id: uuid.UUID, role_in_chapter: Optional[str] = None, notes: Optional[str] = None
    ) -> Optional[CharacterAppearance]:
        result = await self.db.execute(
            select(CharacterAppearance).where(CharacterAppearance.id == appearance_id)
        )
        appearance = result.scalar_one_or_none()
        if not appearance:
            return None
        if role_in_chapter is not None:
            appearance.role_in_chapter = role_in_chapter
        if notes is not None:
            appearance.notes = notes
        await self.db.flush()
        await self.db.refresh(appearance)
        return appearance

    async def remove_appearance(self, appearance_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(CharacterAppearance).where(CharacterAppearance.id == appearance_id)
        )
        appearance = result.scalar_one_or_none()
        if not appearance:
            return False
        await self.db.delete(appearance)
        await self.db.flush()
        return True

    async def get_character_arc(self, character_id: uuid.UUID) -> Optional[dict]:
        char_result = await self.db.execute(
            select(Character).where(Character.id == character_id)
        )
        character = char_result.scalar_one_or_none()
        if not character:
            return None

        result = await self.db.execute(
            select(CharacterAppearance, ChapterOutline)
            .join(ChapterOutline, CharacterAppearance.chapter_outline_id == ChapterOutline.id)
            .where(CharacterAppearance.character_id == character_id)
            .order_by(ChapterOutline.chapter_number)
        )
        rows = result.all()

        appearances = []
        for app, co in rows:
            appearances.append({
                "appearance_id": str(app.id),
                "chapter_outline_id": str(co.id),
                "chapter_number": co.chapter_number,
                "title": co.title,
                "role_in_chapter": app.role_in_chapter,
                "notes": app.notes,
            })

        major_count = sum(1 for a in appearances if a["role_in_chapter"] == "major")

        return {
            "character_id": str(character.id),
            "character_name": character.name,
            "appearances": appearances,
            "total_chapters": len(appearances),
            "major_chapters": major_count,
        }

    async def get_outline_arc(self, outline_id: uuid.UUID) -> list[dict]:
        """Get all character appearances for an outline, grouped by chapter."""
        result = await self.db.execute(
            select(CharacterAppearance, ChapterOutline, Character)
            .join(ChapterOutline, CharacterAppearance.chapter_outline_id == ChapterOutline.id)
            .join(Character, CharacterAppearance.character_id == Character.id)
            .where(ChapterOutline.outline_id == outline_id)
            .order_by(ChapterOutline.chapter_number)
        )
        rows = result.all()

        chapters: dict[int, dict] = {}
        for app, co, char in rows:
            if co.chapter_number not in chapters:
                chapters[co.chapter_number] = {
                    "chapter_number": co.chapter_number,
                    "title": co.title,
                    "characters": [],
                }
            chapters[co.chapter_number]["characters"].append({
                "character_id": str(char.id),
                "name": char.name,
                "role_in_chapter": app.role_in_chapter,
            })

        return list(chapters.values())

    async def get_absence_report(self, outline_id: uuid.UUID) -> list[dict]:
        """报告每个角色连续 N 章未出场"""
        # 获取大纲下所有章节号
        co_result = await self.db.execute(
            select(ChapterOutline.chapter_number)
            .where(ChapterOutline.outline_id == outline_id)
            .order_by(ChapterOutline.chapter_number)
        )
        all_chapter_numbers = [row[0] for row in co_result.all()]
        if not all_chapter_numbers:
            return []
        max_chapter = max(all_chapter_numbers)

        # 获取大纲关联的所有角色
        from app.models.worldview import worldview_characters, Worldview
        from app.models.outline import Outline
        ol_result = await self.db.execute(select(Outline).where(Outline.id == outline_id))
        outline = ol_result.scalar_one_or_none()
        if not outline or not outline.project_id:
            return []

        from app.models.project import Project
        proj_result = await self.db.execute(select(Project).where(Project.id == outline.project_id))
        project = proj_result.scalar_one_or_none()
        if not project or not project.worldview_id:
            return []

        char_result = await self.db.execute(
            select(Character)
            .join(worldview_characters, worldview_characters.c.character_id == Character.id)
            .where(worldview_characters.c.worldview_id == project.worldview_id)
        )
        characters = list(char_result.scalars().all())

        # 获取所有出场记录
        app_result = await self.db.execute(
            select(CharacterAppearance.character_id, ChapterOutline.chapter_number)
            .join(ChapterOutline, CharacterAppearance.chapter_outline_id == ChapterOutline.id)
            .where(ChapterOutline.outline_id == outline_id)
        )
        char_last_chapter: dict[uuid.UUID, int] = {}
        for char_id, ch_num in app_result.all():
            if ch_num > char_last_chapter.get(char_id, 0):
                char_last_chapter[char_id] = ch_num

        report = []
        for char in characters:
            last = char_last_chapter.get(char.id, 0)
            absent = max_chapter - last
            if absent > 0 and last > 0:
                report.append({
                    "character_id": str(char.id),
                    "name": char.name,
                    "last_chapter": last,
                    "absent_chapters": absent,
                })
            elif last == 0:
                report.append({
                    "character_id": str(char.id),
                    "name": char.name,
                    "last_chapter": 0,
                    "absent_chapters": max_chapter,
                })
        report.sort(key=lambda x: x["absent_chapters"], reverse=True)
        return report
