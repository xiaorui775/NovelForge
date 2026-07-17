from typing import Optional
import time
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.model_config import ModelConfig
from app.schemas.model_config import ModelConfigCreate, ModelConfigUpdate
from app.utils.encryption import decrypt_api_key_async, encrypt_api_key, clear_decrypt_cache


class ModelService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_models(self) -> list[ModelConfig]:
        result = await self.db.execute(select(ModelConfig).order_by(ModelConfig.created_at.desc()))
        return list(result.scalars().all())

    async def get_model(self, model_id: uuid.UUID) -> Optional[ModelConfig]:
        result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
        return result.scalar_one_or_none()

    async def create_model(self, data: ModelConfigCreate) -> ModelConfig:
        model = ModelConfig(
            name=data.name,
            provider=data.provider,
            base_url=data.base_url,
            api_key_encrypted=encrypt_api_key(data.api_key),
            model_name=data.model_name,
            model_type=data.model_type,
            input_cost_per_1k=data.input_cost_per_1k,
            output_cost_per_1k=data.output_cost_per_1k,
            max_tokens=data.max_tokens,
            max_context_tokens=data.max_context_tokens,
        )
        self.db.add(model)
        await self.db.flush()
        await self.db.refresh(model)
        clear_decrypt_cache()
        return model

    async def update_model(self, model_id: uuid.UUID, data: ModelConfigUpdate) -> Optional[ModelConfig]:
        model = await self.get_model(model_id)
        if not model:
            return None

        update_data = data.model_dump(exclude_unset=True)
        if "api_key" in update_data:
            update_data["api_key_encrypted"] = encrypt_api_key(update_data.pop("api_key"))

        for field, value in update_data.items():
            setattr(model, field, value)

        await self.db.flush()
        await self.db.refresh(model)
        clear_decrypt_cache()
        return model

    async def delete_model(self, model_id: uuid.UUID) -> bool:
        model = await self.get_model(model_id)
        if not model:
            return False
        await self.db.delete(model)
        clear_decrypt_cache()
        return True

    async def test_model(self, model_id: uuid.UUID) -> dict:
        model = await self.get_model(model_id)
        if not model:
            return {"success": False, "message": "模型不存在", "latency_ms": None}

        api_key = await decrypt_api_key_async(model.api_key_encrypted)
        start = time.time()

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{model.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model.model_name,
                        "messages": [{"role": "user", "content": "Hello"}],
                        "max_tokens": 10,
                    },
                )
                latency = int((time.time() - start) * 1000)

                if response.status_code == 200:
                    return {"success": True, "message": "连接成功", "latency_ms": latency}
                else:
                    return {
                        "success": False,
                        "message": f"API 返回错误: {response.status_code}",
                        "latency_ms": latency,
                    }
        except httpx.TimeoutException:
            return {"success": False, "message": "连接超时", "latency_ms": None}
        except Exception as e:
            return {"success": False, "message": f"连接失败: {str(e)}", "latency_ms": None}
