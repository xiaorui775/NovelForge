"""tests.services.test_chat_history_compress

历史对话压缩（§4.2 P2）的纯函数测试。

不连 DB / 不连网络：直接验证聚类启发式、降级启发式与 _summarize_group 解析路径。
仿 test_chat_context.py 的 FakeMsg / 无 DB 风格。
"""

from __future__ import annotations

import asyncio
import uuid

from app.services.chat_service import (
    _COMPRESS_EARLY_MIN_MSGS,
    _COMPRESS_KEEP_RECENT_TURNS,
    _COMPRESS_MAX_GROUPS,
    _COMPRESS_SUMMARY_MAX_TOKENS,
    _COMPRESS_TARGET_GROUP_SIZE,
    _bigrams,
    _cluster_early_messages,
    _group_label,
    _heuristic_compress,
    _heuristic_compress_group,
    _summarize_group,
    _truncate,
    _user_turns_share_topic,
)


class FakeMsg:
    def __init__(self, role, content, referenced_chapter_id=None):
        self.role = role
        self.content = content
        self.referenced_chapter_id = referenced_chapter_id


class FakeAdapter:
    """记录调用 + 返回预设 payload；可选择抛异常。"""

    def __init__(self, payload=None, raise_exc=None):
        self.payload = payload
        self.raise_exc = raise_exc
        self.calls = 0

    async def generate(self, messages, **kw):  # noqa: D401
        self.calls += 1
        if self.raise_exc:
            raise self.raise_exc
        return self.payload


# ---------- 常量合理性 ----------


def test_constants_reasonable():
    assert 0 < _COMPRESS_EARLY_MIN_MSGS
    assert 0 < _COMPRESS_MAX_GROUPS <= 6
    assert _COMPRESS_SUMMARY_MAX_TOKENS <= 1000
    assert _COMPRESS_KEEP_RECENT_TURNS >= 1
    assert _COMPRESS_TARGET_GROUP_SIZE >= 2


# ---------- 辅助纯函数 ----------


def test_bigrams_and_truncate():
    assert _bigrams("") == set()
    assert _bigrams("a") == set()
    assert _bigrams("主角性格") == {"主角", "角性", "性格"}
    assert _truncate("abcdef", 3) == "abc…"
    assert _truncate("ab", 5) == "ab"
    assert _truncate(None, 5) == ""


def test_user_turns_share_topic_overlap():
    a = "主角李明的性格怎么写"
    b = "李明这个主角的性格"
    assert _user_turns_share_topic(a, b)  # 共享 2-gram（主角/李明/性格）≥2
    assert not _user_turns_share_topic(a, "完全是不同的世界观魔法设定")
    assert not _user_turns_share_topic("", "x")  # 空端必为 False


# ---------- 聚类 ----------


def _make_turns(pairs):
    """pairs: [(user_text, ch_or_None, assistant_text), ...] -> 交错消息列表"""
    msgs = []
    for u, ch, a in pairs:
        msgs.append(FakeMsg("user", u, referenced_chapter_id=ch))
        msgs.append(FakeMsg("assistant", a))
    return msgs


def test_below_threshold_returns_empty():
    # _make_turns 每对生成 2 条；要 early 总数 < _COMPRESS_EARLY_MIN_MSGS(14) → 用 5 对=10 条
    early = _make_turns([("问题" + str(i), None, "回答") for i in range(5)])
    assert len(early) == 10
    assert len(early) < _COMPRESS_EARLY_MIN_MSGS
    assert _cluster_early_messages(early) == []


def test_above_threshold_produces_groups_capped():
    early = _make_turns([("问题" + str(i), None, "回答") for i in range(20)])
    groups = _cluster_early_messages(early)
    assert groups  # 非空
    total_msgs = sum(len(g) for g in groups)
    assert total_msgs == len(early)
    assert len(groups) <= _COMPRESS_MAX_GROUPS


def test_same_referenced_chapter_clustered_together():
    aid = uuid.uuid4()
    bid = uuid.uuid4()
    early = [
        FakeMsg("user", "关于A1", referenced_chapter_id=aid),
        FakeMsg("assistant", "答A1"),
        FakeMsg("user", "关于A2", referenced_chapter_id=aid),
        FakeMsg("assistant", "答A2"),
        FakeMsg("user", "关于B1", referenced_chapter_id=bid),
        FakeMsg("assistant", "答B1"),
        FakeMsg("user", "关于B2", referenced_chapter_id=bid),
        FakeMsg("assistant", "答B2"),
        # 补足到阈值以上
        *[FakeMsg("user", "充数" + str(i), referenced_chapter_id=aid) for i in range(8)],
        *[
            m
            for i in range(8)
            for m in (FakeMsg("assistant", "充答"), FakeMsg("user", "充数X" + str(i), referenced_chapter_id=aid))
        ],
    ]
    groups = _cluster_early_messages(early)
    assert len(groups) >= 2
    # 至少存在一个组其消息全部引用 A
    a_only_groups = [g for g in groups if all(m.referenced_chapter_id == aid for m in g if m.referenced_chapter_id)]
    assert any(a_only_groups)


def test_keyword_overlap_merges_adjacent_user_turns():
    a = "主角李明的性格怎么写比较立体"
    b = "李明这个主角的性格再细化一下"
    early = _make_turns(
        [
            (a, None, "好建议"),
            (b, None, "继续"),
            ("完全不同的魔法世界观设定", None, "另一话题"),
        ]
    )
    # 补足到阈值
    early += _make_turns([("补足" + str(i), None, "补答") for i in range(8)])
    groups = _cluster_early_messages(early)
    assert len(groups) >= 2  # 至少把第三个不同话题拆开
    # 第一组应含 a/b 两轮（共享主角/李明/性格）
    first = groups[0]
    user_texts = [m.content for m in first if m.role == "user"]
    assert a in user_texts and b in user_texts


def test_group_size_hard_cap():
    aid = uuid.uuid4()
    # 16 对同章节消息,用户轮内容共享关键词(模拟同一话题延续),
    # 聚类只会因消息数达上限切分 → 每组 ≤ _COMPRESS_TARGET_GROUP_SIZE
    early = [
        m
        for i in range(16)
        for m in (FakeMsg("user", f"章节讨论点{i}", referenced_chapter_id=aid), FakeMsg("assistant", f"a{i}"))
    ]
    groups = _cluster_early_messages(early)
    assert all(len(g) <= _COMPRESS_TARGET_GROUP_SIZE for g in groups)


def test_merge_to_max_groups():
    # 构造天然多组:每个用户轮话题完全不同 + 章节交替,易超 _COMPRESS_MAX_GROUPS
    aid, bid, cid, did, eid, fid = (uuid.uuid4() for _ in range(6))
    pairs = [(f"top{i}", ch, f"ans{i}") for i, ch in enumerate([aid, bid, cid, did, eid, fid], start=1)]
    early = _make_turns(pairs)
    # 扩到明显超过阈值且组数天然 > MAX
    early += _make_turns([(f"延续{i}", eid, f"x{i}") for i in range(8)])
    groups = _cluster_early_messages(early)
    assert len(groups) == _COMPRESS_MAX_GROUPS  # 合并到恰好上限


# ---------- group label ----------


def test_group_label_shared_chapter():
    aid = uuid.uuid4()
    g = [FakeMsg("user", "x", referenced_chapter_id=aid), FakeMsg("assistant", "y", referenced_chapter_id=aid)]
    assert _group_label(g) == f"关于章节（id={aid}）"


def test_group_label_fallback_first_user():
    g = [FakeMsg("assistant", "y"), FakeMsg("user", "讨论一下主角的背景设定和动机")]
    label = _group_label(g)
    assert label.startswith("讨论一下主角")


# ---------- 启发式降级 / 字节兼容 ----------


def test_heuristic_compress_group_one_line_per_message():
    g = [FakeMsg("user", "这是用户问题"), FakeMsg("assistant", "这是助手回答。后句忽略。")]
    out = _heuristic_compress_group(g)
    assert "用户问了：这是用户问题" in out
    assert "助手建议：这是助手回答" in out
    assert "后句忽略" not in out  # 只取第一句


def test_heuristic_compress_byte_compatible():
    history = _make_turns([(f"问题{i}", None, f"回答{i}。补充。") for i in range(20)])
    # keep_recent=3 → split_point = 40 - 6 = 34 条 early
    out = _heuristic_compress(history, keep_recent=_COMPRESS_KEEP_RECENT_TURNS)
    assert out[0].role == "user"
    assert "[历史概要]" in out[0].content
    assert "[以上是之前的对话概要，以下是最新对话]" in out[0].content
    # 最近 6 条原文保留;split_point = 40 - 6 = 34,即保留第 17..19 对(index 34..39)
    assert len(out) == 1 + 6
    assert out[1].content == "问题17"
    assert out[-1].content == "回答19。补充。"


def test_heuristic_compress_short_history_passes_through():
    history = _make_turns([(f"q{i}", None, f"a{i}") for i in range(2)])
    out = _heuristic_compress(history, keep_recent=3)
    assert out == list(history)  # 不压缩,原样返回


# ---------- _summarize_group 解析路径 ----------


def test_summarize_group_json_parse():
    payload = {"content": '{"summary": "关于章节X\n要点1；要点2"}'}
    adapter = FakeAdapter(payload=payload)
    result = asyncio.run(_summarize_group(adapter, 0, 1, [FakeMsg("user", "x"), FakeMsg("assistant", "y")]))
    assert result == "关于章节X\n要点1；要点2"


def test_summarize_group_error_returns_none():
    adapter = FakeAdapter(payload={"content": "", "error": "rate limited"})
    result = asyncio.run(_summarize_group(adapter, 0, 1, [FakeMsg("user", "x")]))
    assert result is None


def test_summarize_group_plain_text_fallback():
    # 模型未给 JSON 但给出可用纯文本(>8 字)
    adapter = FakeAdapter(payload={"content": "这是一段没有 JSON 包裹的可用中文摘要"})
    result = asyncio.run(_summarize_group(adapter, 0, 1, [FakeMsg("user", "x")]))
    assert result == "这是一段没有 JSON 包裹的可用中文摘要"


def test_summarize_group_exception_returns_none():
    adapter = FakeAdapter(raise_exc=RuntimeError("boom"))
    result = asyncio.run(_summarize_group(adapter, 0, 1, [FakeMsg("user", "x")]))
    assert result is None


def test_summarize_group_too_short_plain_text_returns_none():
    adapter = FakeAdapter(payload={"content": "短"})
    result = asyncio.run(_summarize_group(adapter, 0, 1, [FakeMsg("user", "x")]))
    assert result is None  # len<=8 视为不可用
