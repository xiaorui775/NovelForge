import json
import logging
from typing import AsyncGenerator, Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.adapters.base import BaseModelAdapter

logger = logging.getLogger(__name__)


class OpenAIAdapter(BaseModelAdapter):
    """兼容 OpenAI API 的适配器"""

    _client: Optional[httpx.AsyncClient] = None
    _stream_client: Optional[httpx.AsyncClient] = None

    def __init__(self, base_url: str, api_key: str, model_name: str, max_tokens: int = 4096):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model_name = model_name
        self.max_tokens = max_tokens

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=120)
        return self._client

    def _get_stream_client(self) -> httpx.AsyncClient:
        if self._stream_client is None or self._stream_client.is_closed:
            self._stream_client = httpx.AsyncClient(timeout=300)
        return self._stream_client

    def _should_retry(self, exc: BaseException) -> bool:
        """Only retry on timeout, network errors, 429, and 5xx."""
        if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)):
            return True
        if isinstance(exc, httpx.HTTPStatusError):
            return exc.response.status_code == 429 or exc.response.status_code >= 500
        return False

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        before_sleep=lambda retry_state: logger.warning(
            f"生成请求失败，第 {retry_state.attempt_number} 次重试: {retry_state.outcome.exception()}"
        ),
    )
    async def generate(self, messages: list[dict], **kwargs) -> dict:
        max_tokens = kwargs.get("max_tokens", self.max_tokens)

        client = self._get_client()
        response = await client.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json={
                "model": self.model_name,
                "messages": messages,
                "max_tokens": max_tokens,
                "stream": False,
            },
        )

        # Only retry on 429 and 5xx, raise for other errors
        if response.status_code == 429 or response.status_code >= 500:
            response.raise_for_status()

        # For 4xx (non-429), return error without retrying
        if response.status_code >= 400:
            try:
                error_data = response.json()
                error_msg = error_data.get("error", {}).get("message", f"HTTP {response.status_code}")
            except Exception:
                error_msg = f"HTTP {response.status_code}"
            return {
                "content": "",
                "error": f"API 错误 ({response.status_code}): {error_msg}",
            }

        try:
            data = response.json()
        except Exception:
            raise ValueError(f"AI 模型返回了无效的响应（非 JSON）。状态码: {response.status_code}，内容: {response.text[:200]}")

        if "choices" not in data or not data["choices"]:
            raise ValueError(f"AI 模型响应格式异常: {str(data)[:200]}")

        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})

        return {
            "content": content,
            "token_input": usage.get("prompt_tokens", 0),
            "token_output": usage.get("completion_tokens", 0),
        }

    async def generate_stream(
        self, messages: list[dict], **kwargs
    ) -> AsyncGenerator[str, None]:
        max_tokens = kwargs.get("max_tokens", self.max_tokens)
        max_retries = 3

        for attempt in range(max_retries):
            try:
                client = self._get_stream_client()
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json={
                        "model": self.model_name,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "stream": True,
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
                return  # 成功完成，退出重试循环
            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as e:
                if not self._should_retry(e) if isinstance(e, httpx.HTTPStatusError) else attempt < max_retries - 1:
                    raise
                if attempt < max_retries - 1:
                    wait_time = 2 ** (attempt + 1)
                    logger.warning(f"流式生成失败，第 {attempt + 1} 次重试，等待 {wait_time}s: {e}")
                    import asyncio
                    await asyncio.sleep(wait_time)
                else:
                    raise

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    )
    async def test_connection(self) -> bool:
        try:
            client = self._get_client()
            response = await client.get(
                f"{self.base_url}/models",
                headers=self._headers(),
            )
            return response.status_code == 200
        except httpx.HTTPStatusError:
            return False

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        if self._stream_client and not self._stream_client.is_closed:
            await self._stream_client.aclose()
