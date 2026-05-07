from typing import Optional
import httpx
from app.adapters.image_adapter import BaseImageAdapter


class OpenAIImageAdapter(BaseImageAdapter):
    """OpenAI DALL-E 图片生成适配器"""

    def __init__(self, base_url: str, api_key: str, model_name: str = "dall-e-3"):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model_name = model_name

    async def generate_image(
        self,
        prompt: str,
        size: str = "1024x1024",
        quality: str = "standard",
        style: Optional[str] = None,
    ) -> dict:
        async with httpx.AsyncClient(timeout=120.0) as client:
            payload = {
                "model": self.model_name,
                "prompt": prompt,
                "size": size,
                "quality": quality,
                "n": 1,
            }
            if style:
                payload["style"] = style

            resp = await client.post(
                f"{self.base_url}/images/generations",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

            image_data = data["data"][0]
            return {
                "url": image_data.get("url", ""),
                "revised_prompt": image_data.get("revised_prompt", prompt),
            }

    async def test_connection(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return resp.status_code == 200
        except Exception:
            return False
