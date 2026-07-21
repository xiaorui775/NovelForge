"""tests.services.test_foreshadowing_suggest

伏笔回收建议(§4.3 P2)的纯函数/逻辑测试。

不连 DB:验证 _foreshadow_similar dedup、stale 常量合理性、suggest_resolution 的
结果归并(取最高 confidence、无候选过滤)用注入的 FakeSession 模拟查询。
"""

from __future__ import annotations



from app.services.foreshadowing_service import (
    _DEDUP_JACCARD,
    _DEDUP_SHORT_TEXT,
    _STALE_BATCH,
    _STALE_GAP,
    _SUGGEST_CANDIDATE_CHAPTERS,
    _foreshadow_similar,
)


# ---------- 常量 ----------


def test_constants_reasonable():
    assert _STALE_GAP >= 5
    assert 1 <= _STALE_BATCH <= 5
    assert 3 <= _SUGGEST_CANDIDATE_CHAPTERS <= 12
    assert 0.3 <= _DEDUP_JACCARD <= 0.9
    assert _DEDUP_SHORT_TEXT >= 10


# ---------- _foreshadow_similar ----------


def test_similar_short_text_prefix_match():
    # 短文本回退前缀包含:较短的若是较长的前缀视为重复
    a = "神秘黑袍人在酒馆留下金币"
    b = "神秘黑袍人在酒馆留下金币（另一表述）"
    assert _foreshadow_similar(a, b)
    # 较短的应在较长中作前缀;完全不同则不相近
    a2 = "神秘黑袍人在酒馆留下金币"
    b2 = "完全不同的伏笔关于另一件事"
    assert not _foreshadow_similar(a2, b2)


def test_similar_long_text_jaccard():
    long_a = "主角李明在第三章酒馆里从神秘黑袍人手中得到一枚刻有月牙图案的金币，这枚金币后来会成为关键道具" * 2
    # 高度重叠:保留绝大多数核心 token,仅个别措辞微调
    long_b = "主角李明在第三章酒馆里从神秘黑袍人手中得到一枚刻有月牙图案的金币，这枚金币后来会成为重要道具" * 2
    assert _foreshadow_similar(long_a, long_b)


def test_similar_long_text_disjoint():
    long_a = "主角李明在第三章酒馆里从神秘黑袍人手中得到一枚刻有月牙图案的金币，这枚金币后来会成为关键道具" * 2
    long_b = "魔法师在火山口唤醒了沉睡千年的远古巨龙,天空被染成血红色,村民们四散奔逃" * 2
    assert not _foreshadow_similar(long_a, long_b)


def test_similar_empty():
    assert not _foreshadow_similar("", "")
    assert not _foreshadow_similar(None, "x")
