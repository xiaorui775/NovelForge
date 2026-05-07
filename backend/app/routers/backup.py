import json
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.backup_service import BackupService

router = APIRouter(prefix="/backup", tags=["backup"])


def get_service(db: AsyncSession = Depends(get_db)) -> BackupService:
    return BackupService(db)


@router.get("/export/{project_id}")
async def export_project(
    project_id: uuid.UUID,
    service: BackupService = Depends(get_service),
):
    try:
        data = await service.export_project(project_id)
        return JSONResponse(content=data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@router.post("/import")
async def import_project(
    file: UploadFile = File(...),
    service: BackupService = Depends(get_service),
):
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
        project = await service.import_project(data)
        return {"id": str(project.id), "name": project.name}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="无效的 JSON 文件")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")
