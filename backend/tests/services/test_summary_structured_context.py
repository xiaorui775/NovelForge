"""tests.services.test_summary_structured_context

结构化 ChapterSummary 接入生成上下文：覆盖 `_format_structured_summary` 的纯解析逻辑。

本轮仅 `_format_structured_summary` / `_parse_cs_field` 是新增的纯函数逻辑（不连 DB），
装配链路（_build_context_bundle）强依赖真实查询返回元组行，留给手动冒烟，不在此用 FakeSession 短测。
"""

from __future__ import annotations

import json

from app.services.generation_service import GenerationService


class _FakeCS:
    """内存版 ChapterSummary，只填充用到的字段。"""

    def __init__(self, events=None, character_states=None, unresolved_hooks=None, resolved_hooks=None):
        self.events = json.dumps(events, ensure_ascii=False) if events is not None else None
        self.character_states = json.dumps(character_states, ensure_ascii=False) if character_states is not None else None
        self.unresolved_hooks = json.dumps(unresolved_hooks, ensure_ascii=False) if unresolved_hooks is not None else None
        self.resolved_hooks = json.dumps(resolved_hooks, ensure_ascii=False) if resolved_hooks is not None else None


def test_parse_cs_field_handles_none_and_bad_json():
    assert GenerationService._parse_cs_field(None) is None
    assert GenerationService._parse_cs_field("") is None
    assert GenerationService._parse_cs_field("not json") is None
    assert GenerationService._parse_cs_field("[1, 2]") == [1, 2]
    assert GenerationService._parse_cs_field('{"a": 1}') == {"a": 1}


def test_full_mode_renders_all_sections():
    cs = _FakeCS(
        events=[{"event": "刺杀"}, {"event": "逃离"}],
        character_states={"主角": {"status": "重伤", "emotion": "悲愤", "location": "客栈"}},
        unresolved_hooks=["黑衣人身份", "信物下落"],
        resolved_hooks=["旧仇了结"],
    )
    out = GenerationService._format_structured_summary(cs, compact=False)
    assert "事件:" in out and "刺杀" in out and "逃离" in out
    assert "状态:" in out and "主角:" in out and "重伤" in out
    assert "未解悬念:" in out and "黑衣人身份" in out
    assert "已回收:" in out and "旧仇了结" in out


def test_full_mode_skips_missing_sections():
    cs = _FakeCS(events=[{"event": "登山"}])  # 其余字段为 None
    out = GenerationService._format_structured_summary(cs, compact=False)
    assert "事件:" in out and "登山" in out
    assert "状态:" not in out
    assert "未解悬念:" not in out


def test_compact_mode_short_and_no_section_headers():
    cs = _FakeCS(
        events=[{"event": "对峙"}, {"event": "撤退"}, {"event": "被裁掉"}],
        unresolved_hooks=["A", "B", "C", "D"],  # compact 只取前 3
    )
    out = GenerationService._format_structured_summary(cs, compact=True)
    # 单行紧凑，分隔符 ｜
    assert "｜" in out
    assert "对峙" in out and "撤退" in out
    assert "被裁掉" not in out  # 第 3 条被裁
    assert "悬念:A" in out and "悬念:C" in out
    assert "悬念:D" not in out  # 第 4 条被裁
    assert "事件:" not in out and "状态:" not in out  # compact 无分节标题


def test_none_cs_returns_empty():
    assert GenerationService._format_structured_summary(None, compact=False) == ""
    assert GenerationService._format_structured_summary(None, compact=True) == ""


def test_corrupt_json_fields_silently_skipped():
    # 直接塞坏 JSON 字符串（不经 _FakeCS 的 json.dumps）
    cs = _FakeCS()
    cs.events = "{bad"
    cs.unresolved_hooks = "not a list"
    out = GenerationService._format_structured_summary(cs, compact=False)
    assert out == ""


def test_empty_collections_produce_no_sections():
    cs = _FakeCS(events=[], character_states={}, unresolved_hooks=[], resolved_hooks=[])
    out = GenerationService._format_structured_summary(cs, compact=False)
    assert out == ""
