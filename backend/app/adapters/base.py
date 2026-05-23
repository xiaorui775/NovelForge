from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional


class UsageInfo:
    """记录一次 AI 调用的 token 使用量"""
    __slots__ = ("prompt_tokens", "completion_tokens")

    def __init__(self, prompt_tokens: int = 0, completion_tokens: int = 0):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens


class BaseModelAdapter(ABC):
    """所有模型适配器的基类"""

    def __init__(self):
        self._last_usage: Optional[UsageInfo] = None

    @property
    def last_usage(self) -> Optional[UsageInfo]:
        """最近一次 generate/generate_stream 调用的真实 token 使用量（如果 provider 返回了）"""
        return self._last_usage

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
