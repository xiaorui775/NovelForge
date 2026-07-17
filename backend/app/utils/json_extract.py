"""统一 JSON 提取工具，处理 AI 返回的各种格式

加固点（第 §4.2 结构化输出解析）：
- 字符串感知的括号平衡，不再被字符串字面量内的 ``{``/``}`` 误导深度计数。
- 每条候选在 ``json.loads`` 失败后串一层 ``json_repair.repair_json`` 兜底，
  修复 LLM 常见的脏/截断 JSON（trailing comma、单引号、半截、注释、NaN）。
- 旁路调用方可直接用 ``extract_json_or_default`` 拿到统一降级，避免各自吞错返回默认。
"""

from __future__ import annotations

import json
import logging
import re
from typing import TypeVar

from json_repair import repair_json

logger = logging.getLogger(__name__)

T = TypeVar("T")


def _try_load(candidate: str) -> dict | list | None:
    """先严格 json.loads，失败再用 json_repair 兜底。返回 None 表示彻底无法解析。"""
    if not candidate or not candidate.strip():
        return None
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    repaired = repair_json(candidate, return_objects=True)
    if isinstance(repaired, (dict, list)):
        return repaired
    # repair_json 在某些版本下可能返回 str，再尝试解析一次
    if isinstance(repaired, str):
        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            return None
    return None


def _balanced_span(text: str, open_ch: str, close_ch: str) -> str | None:
    """在 text 中找到第一个括号配平的 span（字符串感知）。

    遇到字符串字面量（单/双引号）内的括号不计入深度，避免被
    叙述文本里出现的 ``{``/``}`` 误导。返回配平的最小候选子串。
    """
    depth = 0
    start = -1
    in_str = False
    str_quote = ""
    escaped = False
    for i, ch in enumerate(text):
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == str_quote:
                in_str = False
            continue
        if ch in ('"', "'"):
            in_str = True
            str_quote = ch
            continue
        if ch == open_ch:
            if depth == 0:
                start = i
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0 and start >= 0:
                return text[start : i + 1]
    return None


def extract_json(raw: str) -> dict | list:
    """从 AI 返回的文本中提取 JSON。

    依次尝试：markdown code fence → 字符串感知的括号平衡 span → 整体解析。
    每步都先 ``json.loads``，失败再 ``json_repair`` 兜底。

    Raises:
        ValueError: 无法提取有效 JSON
    """
    if not raw or not raw.strip():
        raise ValueError("AI 返回内容为空")

    text = raw.strip()

    # 策略 1：markdown code block（数组 / 对象）
    for pattern in (
        r"```(?:json)?\s*(\[[\s\S]*?\])\s*```",
        r"```(?:json)?\s*(\{[\s\S]*?\})\s*```",
    ):
        m = re.search(pattern, text)
        if m:
            parsed = _try_load(m.group(1))
            if parsed is not None:
                return parsed

    # 策略 2：以文本中第一个出现的顶层开括号为准，决定先解析对象还是数组。
    # 否则固定"对象优先"会让 ``[ {...}, {...} ]`` 这种外层数组被内层第一个对象截走。
    first_obj = text.find("{")
    first_arr = text.find("[")
    if first_obj != -1 and (first_arr == -1 or first_obj < first_arr):
        span = _balanced_span(text, "{", "}")
    elif first_arr != -1:
        span = _balanced_span(text, "[", "]")
    else:
        span = None
    if span is not None:
        parsed = _try_load(span)
        if parsed is not None:
            return parsed
        # 若该根失败，补试另一种括号（罕见，_MODEL 偶尔把对象写在数组后）
        other = _balanced_span(text, "[" if first_obj < first_arr else "{",
                               "]" if first_obj < first_arr else "}")
        if other is not None:
            parsed = _try_load(other)
            if parsed is not None:
                return parsed

    # 策略 3：整体解析 + repair
    parsed = _try_load(text)
    if parsed is not None:
        return parsed

    raise ValueError("AI 返回格式异常，无法提取 JSON")


def extract_json_or_default(raw: str, default: T) -> dict | list | T:
    """与 ``extract_json`` 相同，但解析失败时返回 ``default`` 而非抛错。

    供原本各自吞错返回默认值的静默路径（pacing / foreshadowing /
    反向大纲 / 章节上下文）统一调用，降低"静默且无法区分兜底"的风险——
    调用方拿到 default 即明确知道这一次没有可靠结构化结果。
    """
    try:
        return extract_json(raw)
    except ValueError:
        logger.warning("extract_json 失败，使用降级默认值")
        return default
