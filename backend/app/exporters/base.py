from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Union


@dataclass
class ExportResult:
    filename: str
    content: Union[str, bytes]
    media_type: str


class BaseExporter(ABC):
    """导出器基类"""

    @property
    @abstractmethod
    def format_name(self) -> str:
        """格式名称，如 'txt', 'epub'"""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """显示名称，如 'TXT 文本', 'EPUB 电子书'"""
        pass

    @property
    @abstractmethod
    def file_extension(self) -> str:
        """文件扩展名，如 '.txt', '.epub'"""
        pass

    @property
    @abstractmethod
    def media_type(self) -> str:
        """MIME 类型"""
        pass

    @abstractmethod
    async def export(self, project_data: dict) -> ExportResult:
        """执行导出，返回 ExportResult"""
        pass
