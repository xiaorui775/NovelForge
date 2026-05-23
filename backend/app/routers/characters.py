import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.schemas.character import (
    CharacterCreate,
    CharacterRelationCreate,
    CharacterRelationResponse,
    CharacterResponse,
    CharacterUpdate,
)
from app.services.character_service import CharacterService

router = APIRouter(prefix="/characters", tags=["characters"])


def get_service(db: AsyncSession = Depends(get_db)) -> CharacterService:
    return CharacterService(db)


@router.get("", response_model=list[CharacterResponse])
async def list_characters(service: CharacterService = Depends(get_service)):
    return await service.list_characters()


@router.post("", response_model=CharacterResponse, status_code=201)
async def create_character(data: CharacterCreate, service: CharacterService = Depends(get_service)):
    return await service.create_character(data)


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(character_id: uuid.UUID, service: CharacterService = Depends(get_service)):
    character = await service.get_character(character_id)
    if not character:
        raise HTTPException(status_code=404, detail="角色不存在")
    return character


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: uuid.UUID,
    data: CharacterUpdate,
    service: CharacterService = Depends(get_service),
):
    character = await service.update_character(character_id, data)
    if not character:
        raise HTTPException(status_code=404, detail="角色不存在")
    return character


@router.delete("/{character_id}", status_code=204)
async def delete_character(character_id: uuid.UUID, service: CharacterService = Depends(get_service)):
    if not await service.delete_character(character_id):
        raise HTTPException(status_code=404, detail="角色不存在")


# Relations
@router.get("/relations/all", response_model=list[CharacterRelationResponse])
async def list_all_relations(service: CharacterService = Depends(get_service)):
    return await service.list_all_relations()


@router.get("/{character_id}/relations", response_model=list[CharacterRelationResponse])
async def list_relations(character_id: uuid.UUID, service: CharacterService = Depends(get_service)):
    return await service.list_relations(character_id)


@router.post("/relations", response_model=CharacterRelationResponse, status_code=201)
async def create_relation(data: CharacterRelationCreate, service: CharacterService = Depends(get_service)):
    return await service.create_relation(data)


@router.delete("/relations/{relation_id}", status_code=204)
async def delete_relation(relation_id: uuid.UUID, service: CharacterService = Depends(get_service)):
    if not await service.delete_relation(relation_id):
        raise HTTPException(status_code=404, detail="关系不存在")


@router.get("/project/{project_id}/appearance-stats")
async def character_appearance_stats(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """基于 ChapterSummary 统计角色出场"""
    import json
    from sqlalchemy import select
    from app.models.chapter_summary import ChapterSummary
    from app.models.chapter import Chapter
    from app.models.outline import ChapterOutline, Outline
    from app.models.character import Character
    from app.models.worldview import worldview_characters, Worldview

    # 获取项目角色
    characters = []
    wv_result = await db.execute(
        select(Worldview).where(Worldview.id == (
            select(Project.worldview_id).where(Project.id == project_id)
        ))
    )
    wv = wv_result.scalar_one_or_none()
    if wv:
        char_result = await db.execute(
            select(Character)
            .join(worldview_characters, worldview_characters.c.character_id == Character.id)
            .where(worldview_characters.c.worldview_id == wv.id)
        )
        characters = list(char_result.scalars().all())

    # 加载所有 ChapterSummary 的 character_states
    from app.models.project import Project
    outline_result = await db.execute(select(Outline).where(Outline.project_id == project_id))
    outline = outline_result.scalar_one_or_none()

    chapter_appearances = {}  # chapter_number -> set of character names
    total_chapters = 0

    if outline:
        cs_result = await db.execute(
            select(ChapterOutline, ChapterSummary)
            .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
            .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
            .where(ChapterOutline.outline_id == outline.id)
            .order_by(ChapterOutline.chapter_number)
        )
        for co, cs in cs_result.all():
            total_chapters += 1
            names_in_chapter = set()
            if cs and cs.character_states:
                try:
                    states = json.loads(cs.character_states) if isinstance(cs.character_states, str) else cs.character_states
                    if isinstance(states, dict):
                        names_in_chapter.update(states.keys())
                except (json.JSONDecodeError, TypeError):
                    pass
            if cs and cs.events:
                try:
                    events = json.loads(cs.events) if isinstance(cs.events, str) else cs.events
                    if isinstance(events, list):
                        for ev in events:
                            if isinstance(ev, dict):
                                for name in ev.get("characters", []):
                                    names_in_chapter.add(name)
                except (json.JSONDecodeError, TypeError):
                    pass
            chapter_appearances[co.chapter_number] = names_in_chapter

    # 统计每个角色
    stats = []
    for char in characters:
        appeared_chapters = []
        for ch_num, names in chapter_appearances.items():
            if char.name in names:
                appeared_chapters.append(ch_num)

        last_appeared = max(appeared_chapters) if appeared_chapters else None
        chapters_since = (total_chapters - last_appeared) if last_appeared and total_chapters else None

        stats.append({
            "character_id": str(char.id),
            "name": char.name,
            "role_type": char.role_type,
            "appeared_chapters": appeared_chapters,
            "appearance_count": len(appeared_chapters),
            "chapters_since_last": chapters_since,
        })

    return {"characters": stats, "total_chapters": total_chapters}


@router.get("/project/{project_id}/absence-report")
async def character_absence_report(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """角色未出场报告：哪些角色已连续 N 章未出场"""
    from sqlalchemy import select
    from app.models.outline import Outline
    from app.services.character_arc_service import CharacterArcService

    outline_result = await db.execute(select(Outline).where(Outline.project_id == project_id))
    outline = outline_result.scalar_one_or_none()
    if not outline:
        return []

    service = CharacterArcService(db)
    return await service.get_absence_report(outline.id)
