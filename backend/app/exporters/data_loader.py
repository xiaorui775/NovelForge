import uuid
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chapter import Chapter
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project


@dataclass
class ChapterData:
    title: str
    chapter_number: int
    content: Optional[str]
    word_count: int


@dataclass
class ExportOptions:
    include_toc: bool = True
    include_cover: bool = True
    chapter_start: Optional[int] = None
    chapter_end: Optional[int] = None
    paper_size: str = "a4"  # a4, letter


@dataclass
class ExportProjectData:
    project_name: str
    project_description: Optional[str]
    language: str
    chapters: list[ChapterData]
    total_words: int
    options: ExportOptions = field(default_factory=ExportOptions)


async def load_project_export_data(
    db: AsyncSession, project_id: uuid.UUID, options: Optional[ExportOptions] = None
) -> ExportProjectData:
    """加载项目导出所需的共享数据"""

    if options is None:
        options = ExportOptions()

    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        raise ValueError("项目不存在")

    outline_result = await db.execute(select(Outline).where(Outline.project_id == project_id))
    outline = outline_result.scalar_one_or_none()
    if not outline:
        raise ValueError("大纲不存在")

    query = (
        select(ChapterOutline)
        .where(ChapterOutline.outline_id == outline.id)
        .order_by(ChapterOutline.sort_order)
    )
    if options.chapter_start is not None:
        query = query.where(ChapterOutline.chapter_number >= options.chapter_start)
    if options.chapter_end is not None:
        query = query.where(ChapterOutline.chapter_number <= options.chapter_end)

    chapter_outlines_result = await db.execute(query)
    chapter_outlines = list(chapter_outlines_result.scalars().all())

    chapters = []
    total_words = 0
    for co in chapter_outlines:
        chapter_result = await db.execute(
            select(Chapter).where(Chapter.chapter_outline_id == co.id)
        )
        chapter = chapter_result.scalar_one_or_none()

        title = co.title or f"第{co.chapter_number}章"
        content = chapter.content if chapter and chapter.content else None
        word_count = chapter.word_count if chapter and chapter.word_count else 0

        chapters.append(ChapterData(
            title=title,
            chapter_number=co.chapter_number,
            content=content,
            word_count=word_count,
        ))
        total_words += word_count

    return ExportProjectData(
        project_name=project.name,
        project_description=project.description,
        language=project.language or "zh-CN",
        chapters=chapters,
        total_words=total_words,
        options=options,
    )
