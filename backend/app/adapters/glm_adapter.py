"""智谱 GLM 适配器

GLM API 与 OpenAI 兼容。
文档: https://open.bigmodel.cn/dev/api#http_auth
"""
from app.adapters.openai_adapter import OpenAIAdapter


class GLMAdapter(OpenAIAdapter):
    """智谱 GLM 模型适配器（OpenAI 兼容）"""

    def __init__(self, base_url: str, api_key: str, model_name: str, max_tokens: int = 4096):
        # 如果用户未指定 base_url，使用智谱默认地址
        if not base_url or base_url.strip() == "":
            base_url = "https://open.bigmodel.cn/api/paas/v4"
        super().__init__(base_url=base_url, api_key=api_key, model_name=model_name, max_tokens=max_tokens)
