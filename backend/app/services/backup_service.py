import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chapter import Chapter
from app.models.character import Character, CharacterRelation
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.models.terminology import Terminology
from app.models.worldview import Worldview


class BackupService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def export_project(self, project_id: uuid.UUID) -> dict:
        """导出项目数据为 JSON"""
        project_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError("项目不存在")

        data = {
            "version": "1.1",
            "exported_at": datetime.utcnow().isoformat(),
            "project": {
                "name": project.name,
                "genre": project.genre,
                "description": project.description,
                "language": project.language,
                "target_words_per_chapter_min": project.target_words_per_chapter_min,
                "target_words_per_chapter_max": project.target_words_per_chapter_max,
                "style_reference": project.style_reference,
                "dialogue_ratio": float(project.dialogue_ratio) if project.dialogue_ratio else None,
            },
            "outline": None,
            "chapters": [],
            "terminologies": [],
            "worldviews": [],
            "characters": [],
            "character_relations": [],
        }

        # Outline
        outline_result = await self.db.execute(
            select(Outline)
            .where(Outline.project_id == project_id)
            .order_by(Outline.updated_at.desc(), Outline.created_at.desc())
        )
        outline = outline_result.scalars().first()
        if outline:
            data["outline"] = {
                "total_chapters": outline.total_chapters,
                "synopsis": outline.synopsis,
            }

            # Chapter outlines + chapters
            co_result = await self.db.execute(
                select(ChapterOutline)
                .where(ChapterOutline.outline_id == outline.id)
                .order_by(ChapterOutline.sort_order)
            )
            for co in co_result.scalars().all():
                chapter_data = {
                    "chapter_number": co.chapter_number,
                    "title": co.title,
                    "summary": co.summary,
                    "detail_outline": co.detail_outline,
                    "sort_order": co.sort_order,
                    "content": None,
                }
                chapter_result = await self.db.execute(
                    select(Chapter)
                    .where(Chapter.chapter_outline_id == co.id)
                    .order_by(Chapter.updated_at.desc(), Chapter.created_at.desc())
                )
                chapter = chapter_result.scalars().first()
                if chapter and chapter.content:
                    chapter_data["content"] = chapter.content
                    chapter_data["word_count"] = chapter.word_count
                data["chapters"].append(chapter_data)

        # Terminologies
        term_result = await self.db.execute(
            select(Terminology).where(Terminology.project_id == project_id)
        )
        for term in term_result.scalars().all():
            data["terminologies"].append({
                "term": term.term,
                "category": term.category,
                "description": term.description,
            })

        # Worldviews (linked to project)
        if project.worldview_id:
            wv_result = await self.db.execute(
                select(Worldview).where(Worldview.id == project.worldview_id)
            )
            wv = wv_result.scalar_one_or_none()
            if wv:
                data["worldviews"].append({
                    "name": wv.name,
                    "description": wv.description,
                    "rules": wv.rules,
                })

        # Characters (linked via worldview)
        if project.worldview_id:
            from sqlalchemy.orm import selectinload
            wv_chars_result = await self.db.execute(
                select(Worldview)
                .where(Worldview.id == project.worldview_id)
                .options(selectinload(Worldview.characters))
            )
            wv_with_chars = wv_chars_result.scalar_one_or_none()
            if wv_with_chars:
                for char in wv_with_chars.characters:
                    data["characters"].append({
                        "name": char.name,
                        "role_type": char.role_type,
                        "personality": char.personality,
                        "background": char.background,
                        "description": char.description,
                    })

        # Character relations (export by name for portability)
        char_names = {c["name"] for c in data["characters"]}
        if char_names:
            from sqlalchemy.orm import selectinload as _so
            all_chars_result = await self.db.execute(
                select(Character).options(_so(Character.relations_from))
            )
            for char in all_chars_result.scalars().all():
                if char.name in char_names:
                    for rel in char.relations_from:
                        # Look up target character name
                        target_result = await self.db.execute(
                            select(Character.name).where(Character.id == rel.to_character_id)
                        )
                        target_name = target_result.scalar()
                        if target_name:
                            data["character_relations"].append({
                                "from_name": char.name,
                                "to_name": target_name,
                                "relation_type": rel.relation_type,
                                "description": rel.description,
                            })

        return data

    async def import_project(self, data: dict) -> Project:
        """从 JSON 导入项目"""
        project_data = data.get("project", {})
        project = Project(
            name=project_data.get("name", "导入的项目"),
            genre=project_data.get("genre"),
            description=project_data.get("description"),
            language=project_data.get("language", "zh-CN"),
            target_words_per_chapter_min=project_data.get("target_words_per_chapter_min", 3000),
            target_words_per_chapter_max=project_data.get("target_words_per_chapter_max", 5000),
            style_reference=project_data.get("style_reference"),
            dialogue_ratio=project_data.get("dialogue_ratio"),
        )
        self.db.add(project)
        await self.db.flush()

        # Outline
        outline_data = data.get("outline")
        if outline_data:
            outline = Outline(
                project_id=project.id,
                total_chapters=outline_data.get("total_chapters", 0),
                synopsis=outline_data.get("synopsis"),
            )
            self.db.add(outline)
            await self.db.flush()

            # Chapters
            for ch_data in data.get("chapters", []):
                co = ChapterOutline(
                    outline_id=outline.id,
                    chapter_number=ch_data.get("chapter_number", 0),
                    title=ch_data.get("title"),
                    summary=ch_data.get("summary", ""),
                    detail_outline=ch_data.get("detail_outline"),
                    sort_order=ch_data.get("sort_order", 0),
                )
                self.db.add(co)
                await self.db.flush()

                content = ch_data.get("content")
                if content:
                    chapter = Chapter(
                        chapter_outline_id=co.id,
                        content=content,
                        word_count=ch_data.get("word_count", len(content)),
                        status="completed",
                    )
                    self.db.add(chapter)

        # Terminologies
        for term_data in data.get("terminologies", []):
            term = Terminology(
                project_id=project.id,
                term=term_data.get("term", ""),
                category=term_data.get("category"),
                description=term_data.get("description"),
            )
            self.db.add(term)

        # Worldviews
        worldview = None
        for wv_data in data.get("worldviews", []):
            worldview = Worldview(
                name=wv_data.get("name", "世界观"),
                description=wv_data.get("description"),
                rules=wv_data.get("rules"),
            )
            self.db.add(worldview)
            await self.db.flush()
            project.worldview_id = worldview.id
            break  # Only import first worldview

        # Characters
        char_name_map = {}  # name -> Character object
        for char_data in data.get("characters", []):
            char = Character(
                name=char_data.get("name", ""),
                role_type=char_data.get("role_type"),
                personality=char_data.get("personality"),
                background=char_data.get("background"),
                description=char_data.get("description"),
            )
            self.db.add(char)
            await self.db.flush()
            char_name_map[char.name] = char
            # Link to worldview
            if worldview:
                worldview.characters.append(char)

        # Character relations
        for rel_data in data.get("character_relations", []):
            from_name = rel_data.get("from_name")
            to_name = rel_data.get("to_name")
            from_char = char_name_map.get(from_name)
            to_char = char_name_map.get(to_name)
            if from_char and to_char:
                rel = CharacterRelation(
                    from_character_id=from_char.id,
                    to_character_id=to_char.id,
                    relation_type=rel_data.get("relation_type", "related"),
                    description=rel_data.get("description"),
                )
                self.db.add(rel)

        await self.db.flush()
        await self.db.refresh(project)
        return project
