from app.adapters.base import BaseModelAdapter
from app.adapters.image_adapter import BaseImageAdapter
from app.adapters.openai_adapter import OpenAIAdapter
from app.adapters.openai_image_adapter import OpenAIImageAdapter
from app.adapters.deepseek_adapter import DeepSeekAdapter
from app.adapters.qwen_adapter import QwenAdapter
from app.adapters.glm_adapter import GLMAdapter
from app.adapters.moonshot_adapter import MoonshotAdapter
from app.models.model_config import ModelConfig
from app.utils.encryption import decrypt_api_key_async


class AdapterFactory:
    """根据配置创建对应的模型适配器"""

    @staticmethod
    async def create(config: ModelConfig) -> BaseModelAdapter:
        api_key = await decrypt_api_key_async(config.api_key_encrypted)
        provider = (config.provider or "openai").lower()

        # 按 provider 选择适配器
        if provider == "deepseek":
            return DeepSeekAdapter(
                base_url=config.base_url,
                api_key=api_key,
                model_name=config.model_name,
                max_tokens=config.max_tokens,
            )
        elif provider == "qwen":
            return QwenAdapter(
                base_url=config.base_url,
                api_key=api_key,
                model_name=config.model_name,
                max_tokens=config.max_tokens,
            )
        elif provider in ("zhipu", "glm"):
            return GLMAdapter(
                base_url=config.base_url,
                api_key=api_key,
                model_name=config.model_name,
                max_tokens=config.max_tokens,
            )
        elif provider == "moonshot":
            return MoonshotAdapter(
                base_url=config.base_url,
                api_key=api_key,
                model_name=config.model_name,
                max_tokens=config.max_tokens,
            )
        else:
            # 默认使用 OpenAI 兼容适配器（openai / other）
            return OpenAIAdapter(
                base_url=config.base_url,
                api_key=api_key,
                model_name=config.model_name,
                max_tokens=config.max_tokens,
            )

    @staticmethod
    async def create_image_adapter(config: ModelConfig) -> BaseImageAdapter:
        api_key = await decrypt_api_key_async(config.api_key_encrypted)
        return OpenAIImageAdapter(
            base_url=config.base_url,
            api_key=api_key,
            model_name=config.model_name,
        )
