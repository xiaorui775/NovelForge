from abc import ABC, abstractmethod
from typing import AsyncGenerator


class BaseModelAdapter(ABC):
    """所有模型适配器的基类"""

    @abstractmethod
    async def generate(self, messages: list[dict], **kwargs) -> dict:
        """一次性生成完整响应，返回 {"content": str, "token_input": int, "token_output": int}"""
        pass

    @abstractmethod
    async def generate_stream(
        self, messages: list[dict], **kwargs
    ) -> AsyncGenerator[str, None]:
        """流式生成响应，yield 每个 token"""
        pass

    @abstractmethod
    async def test_connection(self) -> bool:
        """测试模型连接"""
        pass

    def count_tokens(self, text: str) -> int:
        """估算 token 数量（简单按字符估算）"""
        # 粗略估算：中文约 1.5 token/字，英文约 0.75 token/word
        return int(len(text) * 1.5)
