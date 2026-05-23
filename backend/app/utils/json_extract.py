"""统一 JSON 提取工具，处理 AI 返回的各种格式"""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)


def extract_json(raw: str) -> dict | list:
    """从 AI 返回的文本中提取 JSON，处理 markdown code fence、前后多余文字等

    Args:
        raw: AI 返回的原始文本

    Returns:
        解析后的 dict 或 list

    Raises:
        ValueError: 无法提取有效 JSON
    """
    if not raw or not raw.strip():
        raise ValueError("AI 返回内容为空")

    text = raw.strip()

    # 策略 1：提取 markdown code block 中的 JSON
    code_block_match = re.search(r'```(?:json)?\s*(\[[\s\S]*?\])\s*```', text)
    if code_block_match:
        try:
            return json.loads(code_block_match.group(1))
        except json.JSONDecodeError:
            pass

    code_block_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text)
    if code_block_match:
        try:
            return json.loads(code_block_match.group(1))
        except json.JSONDecodeError:
            pass

    # 策略 2：提取最外层的 JSON 对象或数组
    # 先尝试 JSON 对象
    brace_depth = 0
    obj_start = -1
    for i, ch in enumerate(text):
        if ch == '{':
            if brace_depth == 0:
                obj_start = i
            brace_depth += 1
        elif ch == '}':
            brace_depth -= 1
            if brace_depth == 0 and obj_start >= 0:
                candidate = text[obj_start:i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    obj_start = -1

    # 尝试 JSON 数组
    bracket_depth = 0
    arr_start = -1
    for i, ch in enumerate(text):
        if ch == '[':
            if bracket_depth == 0:
                arr_start = i
            bracket_depth += 1
        elif ch == ']':
            bracket_depth -= 1
            if bracket_depth == 0 and arr_start >= 0:
                candidate = text[arr_start:i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    arr_start = -1

    # 策略 3：直接尝试解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    raise ValueError(f"AI 返回格式异常，无法提取 JSON")
