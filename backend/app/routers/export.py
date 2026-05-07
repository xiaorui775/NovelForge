import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exporters.data_loader import ExportOptions
from app.services.export_service import ExportService

router = APIRouter(prefix="/projects/{project_id}/export", tags=["export"])


def get_service(db: AsyncSession = Depends(get_db)) -> ExportService:
    return ExportService(db)


@router.get("/formats")
async def list_formats():
    from app.exporters.registry import ExporterRegistry
    return ExporterRegistry.list_formats()


@router.get("/{format_name}")
async def export_project(
    project_id: uuid.UUID,
    format_name: str,
    include_toc: bool = Query(default=True),
    include_cover: bool = Query(default=True),
    chapter_start: Optional[int] = Query(default=None, ge=1),
    chapter_end: Optional[int] = Query(default=None, ge=1),
    paper_size: str = Query(default="a4"),
    service: ExportService = Depends(get_service),
):
    try:
        options = ExportOptions(
            include_toc=include_toc,
            include_cover=include_cover,
            chapter_start=chapter_start,
            chapter_end=chapter_end,
            paper_size=paper_size,
        )
        result = await service.export(project_id, format_name, options)
        return Response(
            content=result.content if isinstance(result.content, bytes) else result.content.encode("utf-8"),
            media_type=result.media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{result.filename}"',
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")
