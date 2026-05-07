import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.outline import Outline, ChapterOutline
from app.schemas.story_template import StoryTemplateResponse, StoryTemplateCreate, StoryTemplateApply
from app.services.story_template_service import list_templates, get_template, create_template, delete_template

router = APIRouter(prefix="/story-templates", tags=["story-templates"])


@router.get("", response_model=list[StoryTemplateResponse])
async def list_all(db: AsyncSession = Depends(get_db)):
    return await list_templates(db)


@router.get("/{template_id}", response_model=StoryTemplateResponse)
async def get_one(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tpl = await get_template(db, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")
    return tpl


@router.post("", response_model=StoryTemplateResponse)
async def create(data: StoryTemplateCreate, db: AsyncSession = Depends(get_db)):
    return await create_template(db, data)


@router.delete("/{template_id}")
async def delete(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    if not await delete_template(db, template_id):
        raise HTTPException(status_code=400, detail="无法删除内置模板")
    return {"ok": True}


@router.post("/apply")
async def apply_template(data: StoryTemplateApply, db: AsyncSession = Depends(get_db)):
    """Apply a story template to a project, creating outline and chapter outlines."""
    from sqlalchemy import select

    # Get project
    result = await db.execute(select(Project).where(Project.id == data.project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # Get template
    tpl = await get_template(db, data.template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")

    total_chapters = data.total_chapters or 20
    phases = tpl.structure.get("phases", [])

    # Check if outline already exists
    result = await db.execute(select(Outline).where(Outline.project_id == project.id))
    existing = result.scalars().first()
    if existing:
        # Delete existing chapter outlines
        result = await db.execute(select(ChapterOutline).where(ChapterOutline.outline_id == existing.id))
        for co in result.scalars().all():
            await db.delete(co)
        outline = existing
        outline.total_chapters = total_chapters
        outline.synopsis = f"基于「{tpl.name}」模板生成的大纲"
    else:
        outline = Outline(
            project_id=project.id,
            total_chapters=total_chapters,
            synopsis=f"基于「{tpl.name}」模板生成的大纲",
        )
        db.add(outline)

    await db.flush()

    # Generate chapter outlines based on template phases
    chapter_num = 1
    for phase in phases:
        ratio = phase.get("ratio", 0)
        phase_name = phase.get("name", "")
        description = phase.get("description", "")
        guides = phase.get("guides", [])

        if ratio > 0:
            chapter_count = max(1, round(total_chapters * ratio))
        else:
            # For phases with ratio 0 (like snowflake core), create 1 chapter
            chapter_count = 1

        for i in range(chapter_count):
            guide_text = guides[i % len(guides)] if guides else ""
            summary = f"【{phase_name}】{description}"
            if guide_text:
                summary += f"\n引导问题：{guide_text}"

            co = ChapterOutline(
                outline_id=outline.id,
                chapter_number=chapter_num,
                title=f"第{chapter_num}章",
                summary=summary,
                sort_order=chapter_num,
            )
            db.add(co)
            chapter_num += 1
            if chapter_num > total_chapters:
                break
        if chapter_num > total_chapters:
            break

    await db.commit()

    return {"outline_id": str(outline.id), "chapter_count": chapter_num - 1}
