from app.adapters.base import BaseModelAdapter
from app.adapters.image_adapter import BaseImageAdapter
from app.adapters.openai_adapter import OpenAIAdapter
from app.adapters.openai_image_adapter import OpenAIImageAdapter
from app.models.model_config import ModelConfig
from app.utils.encryption import decrypt_api_key


class AdapterFactory:
    """根据配置创建对应的模型适配器"""

    @staticmethod
    def create(config: ModelConfig) -> BaseModelAdapter:
        api_key = decrypt_api_key(config.api_key_encrypted)

        if config.provider == "openai":
            return OpenAIAdapter(
                base_url=config.base_url,
                api_key=api_key,
                model_name=config.model_name,
                max_tokens=config.max_tokens,
            )
        # 默认使用 OpenAI 兼容适配器
        return OpenAIAdapter(
            base_url=config.base_url,
            api_key=api_key,
            model_name=config.model_name,
            max_tokens=config.max_tokens,
        )

    @staticmethod
    def create_image_adapter(config: ModelConfig) -> BaseImageAdapter:
        api_key = decrypt_api_key(config.api_key_encrypted)
        return OpenAIImageAdapter(
            base_url=config.base_url,
            api_key=api_key,
            model_name=config.model_name,
        )
