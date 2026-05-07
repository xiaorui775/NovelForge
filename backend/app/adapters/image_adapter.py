from abc import ABC, abstractmethod
from typing import Optional


class BaseImageAdapter(ABC):
    """图片生成适配器基类"""

    @abstractmethod
    async def generate_image(
        self,
        prompt: str,
        size: str = "1024x1024",
        quality: str = "standard",
        style: Optional[str] = None,
    ) -> dict:
        """生成图片，返回 {"url": str, "revised_prompt": str}"""
        pass

    @abstractmethod
    async def test_connection(self) -> bool:
        """测试图片生成连接"""
        pass
