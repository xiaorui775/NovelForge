"""通义千问 (Qwen) 适配器

DashScope 兼容模式与 OpenAI 兼容。
文档: https://help.aliyun.com/zh/dashscope/developer-reference/compatibility-mode
"""
from app.adapters.openai_adapter import OpenAIAdapter


class QwenAdapter(OpenAIAdapter):
    """通义千问模型适配器（OpenAI 兼容）"""

    def __init__(self, base_url: str, api_key: str, model_name: str, max_tokens: int = 4096):
        # 如果用户未指定 base_url，使用 DashScope 兼容模式默认地址
        if not base_url or base_url.strip() == "":
            base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
        super().__init__(base_url=base_url, api_key=api_key, model_name=model_name, max_tokens=max_tokens)
