from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.chapter import Chapter
from app.models.character import Character
from app.models.terminology import Terminology
from app.models.outline import ChapterOutline, Outline


async def search_all(db: AsyncSession, query: str, limit: int = 5) -> dict:
    """Full-text search across projects, chapters, characters, and terminology."""
    pattern = f"%{query}%"

    # Projects
    result = await db.execute(
        select(Project)
        .where(or_(Project.name.ilike(pattern), Project.description.ilike(pattern)))
        .limit(limit)
    )
    projects = [
        {"id": str(p.id), "name": p.name, "description": p.description or "", "type": "project"}
        for p in result.scalars().all()
    ]

    # Chapters (search in content)
    result = await db.execute(
        select(Chapter, ChapterOutline, Outline)
        .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
        .join(Outline, ChapterOutline.outline_id == Outline.id)
        .where(Chapter.content.ilike(pattern))
        .limit(limit)
    )
    chapters = []
    for ch, co, outline in result.all():
        content = ch.content or ""
        idx = content.lower().find(query.lower())
        if idx == -1:
            snippet = content[:80] + "..." if len(content) > 80 else content
        else:
            start = max(0, idx - 40)
            end = min(len(content), idx + len(query) + 40)
            snippet = content[start:end]
            if start > 0:
                snippet = "..." + snippet
            if end < len(content):
                snippet = snippet + "..."
        chapters.append({
            "id": str(co.id),
            "project_id": str(outline.project_id),
            "snippet": snippet,
            "type": "chapter",
        })

    # Characters
    result = await db.execute(
        select(Character)
        .where(or_(Character.name.ilike(pattern), Character.description.ilike(pattern)))
        .limit(limit)
    )
    characters = [
        {"id": str(c.id), "name": c.name, "description": c.description or "", "type": "character"}
        for c in result.scalars().all()
    ]

    # Terminology
    result = await db.execute(
        select(Terminology)
        .where(or_(Terminology.term.ilike(pattern), Terminology.description.ilike(pattern)))
        .limit(limit)
    )
    terminology = [
        {"id": str(t.id), "term": t.term, "description": t.description or "", "project_id": str(t.project_id), "type": "terminology"}
        for t in result.scalars().all()
    ]

    return {
        "projects": projects,
        "chapters": chapters,
        "characters": characters,
        "terminology": terminology,
    }
