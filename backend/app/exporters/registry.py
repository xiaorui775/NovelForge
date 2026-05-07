from typing import Optional
from app.exporters.base import BaseExporter
from app.exporters.txt_exporter import TxtExporter
from app.exporters.epub_exporter import EpubExporter
from app.exporters.docx_exporter import DocxExporter
from app.exporters.pdf_exporter import PdfExporter


class ExporterRegistry:
    """导出器注册中心"""

    _exporters: dict[str, BaseExporter] = {}

    @classmethod
    def register(cls, exporter: BaseExporter) -> None:
        cls._exporters[exporter.format_name] = exporter

    @classmethod
    def get(cls, format_name: str) -> Optional[BaseExporter]:
        return cls._exporters.get(format_name)

    @classmethod
    def list_formats(cls) -> list[dict]:
        return [
            {
                "format": e.format_name,
                "display_name": e.display_name,
                "extension": e.file_extension,
            }
            for e in cls._exporters.values()
        ]


# Register built-in exporters
ExporterRegistry.register(TxtExporter())
ExporterRegistry.register(EpubExporter())
ExporterRegistry.register(DocxExporter())
ExporterRegistry.register(PdfExporter())
