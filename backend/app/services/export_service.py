import uuid
from dataclasses import asdict

from sqlalchemy.ext.asyncio import AsyncSession

from app.exporters.registry import ExporterRegistry
from app.exporters.data_loader import ExportOptions, load_project_export_data


class ExportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def export(self, project_id: uuid.UUID, format_name: str, options: ExportOptions = None):
        """通用导出方法"""
        exporter = ExporterRegistry.get(format_name)
        if not exporter:
            raise ValueError(f"不支持的导出格式: {format_name}")

        project_data = await load_project_export_data(self.db, project_id, options)
        data_dict = asdict(project_data)
        return await exporter.export(data_dict)

    def list_formats(self) -> list[dict]:
        """列出所有支持的导出格式"""
        return ExporterRegistry.list_formats()
