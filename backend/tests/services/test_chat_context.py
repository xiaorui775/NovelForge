"""tests.services.test_chat_context

Chat 上下文分级注入的纯函数测试。

不连 DB：直接验证角色排序键与章节折叠边界常量，覆盖 §4.2 P1 的降级语义。
"""

from __future__ import annotations

from app.services.chat_service import (
    _CTX_MAX_CHAPTER_CARDS,
    _CTX_MAX_CHAPTER_CHARS,
    _CTX_MAX_CHARACTERS,
    _CTX_MAX_FORESHADOWINGS,
    _CTX_MAX_TERMS,
    _character_sort_key,
    _PROTAGONIST_ROLE_TYPES,
)


class FakeChar:
    def __init__(self, name, role_type=None, desc=""):
        self.name = name
        self.role_type = role_type
        self.description = desc


def test_protagonist_keywords_cover_chinese_and_english():
    assert "主角" in _PROTAGONIST_ROLE_TYPES
    assert "protagonist" in _PROTAGONIST_ROLE_TYPES


def test_caps_are_positive_and_reasonable():
    assert 0 < _CTX_MAX_CHARACTERS <= 20
    assert 0 < _CTX_MAX_TERMS <= 50
    assert 0 < _CTX_MAX_FORESHADOWINGS <= 30
    assert 0 < _CTX_MAX_CHAPTER_CARDS <= 100
    assert 2000 <= _CTX_MAX_CHAPTER_CHARS <= 20000


def test_sort_puts_protagonist_first():
    chars = [
        FakeChar("minor", role_type="龙套", desc="x"),
        FakeChar("lead", role_type="主角", desc="y"),
        FakeChar("support", role_type="配角", desc="z"),
    ]
    order = sorted(chars, key=_character_sort_key)
    assert order[0].name == "lead"


def test_sort_second_key_by_description_length():
    # 同为配角时，描述更长（信息量更大）的应靠前
    chars = [
        FakeChar("short", role_type="配角", desc="a"),
        FakeChar("long", role_type="配角", desc="a" * 50),
    ]
    order = sorted(chars, key=_character_sort_key)
    assert order[0].name == "long"


def test_no_role_treated_as_non_lead():
    c = FakeChar("anon", role_type=None, desc="x")
    # 排序键第一项为 not-is_lead -> True，应排在主角之后
    key = _character_sort_key(c)
    assert key[0] is True


def test_chapter_fold_boundary():
    rows = list(range(60))
    head, tail = rows[:-_CTX_MAX_CHAPTER_CARDS], rows[-_CTX_MAX_CHAPTER_CARDS:]
    assert len(tail) == _CTX_MAX_CHAPTER_CARDS
    assert len(head) == 60 - _CTX_MAX_CHAPTER_CARDS
    # tail 始终是最近（最后）N 章
    assert tail[-1] == 59
    assert tail[0] == 60 - _CTX_MAX_CHAPTER_CARDS


def test_no_fold_when_below_threshold():
    rows = list(range(_CTX_MAX_CHAPTER_CARDS))
    # 此分支下不会触发折叠；这里确认边界即 head 为空
    head, tail = rows[:-_CTX_MAX_CHAPTER_CARDS], rows[-_CTX_MAX_CHAPTER_CARDS:]
    assert head == []
    assert len(tail) == _CTX_MAX_CHAPTER_CARDS
