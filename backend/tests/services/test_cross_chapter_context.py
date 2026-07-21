"""tests.services.test_cross_chapter_context

跨章一致性检查 prompt 拼装(§4.3 P2)测试。

验证 _reference_text / _assemble_cross_chapter_prompt 注入了术语/角色/世界观/
待核验伏笔,且不再整体 json.dumps 双重编码(章节走 format_chapter_card 文本卡片)。
"""

from __future__ import annotations

from app.services.consistency_service import (
    _assemble_cross_chapter_prompt,
    _reference_text,
)


def _fake_term(term, category, desc):
    class T:
        pass

    t = T()
    t.term = term
    t.category = category
    t.description = desc
    return t


def _fake_char(name, role_type, desc):
    class C:
        pass

    c = C()
    c.name = name
    c.role_type = role_type
    c.description = desc
    return c


def _fake_project(genre="玄幻"):
    class P:
        pass

    p = P()
    p.genre = genre
    return p


# ---------- _reference_text ----------


def test_reference_text_contains_terms_chars_worldview():
    terms = [_fake_term("元婴", "境界", "修士内丹境界之一")]
    chars = [_fake_char("李明", "主角", "性格坚毅的剑修")]
    out = _reference_text(terms, chars, "世界观: 修真界\n描述: 灵气复苏")
    assert "元婴" in out and "境界" in out
    assert "李明" in out and "性格坚毅" in out
    assert "世界观" in out


def test_reference_text_empty_inputs():
    out = _reference_text([], [], "")
    assert "术语库：" in out
    assert "角色库：" in out
    assert "无" in out  # 无术语/角色时显示无


# ---------- _assemble_cross_chapter_prompt ----------


def test_assemble_injects_all_sections():
    project = _fake_project("武侠")
    ref = "世界观: 江湖\n术语库：\n- 绝学（招式）: 顶级武学\n角色库：\n- 张三（主角）: 少林弟子"
    cards = "- 第1章 拜师\n  角色: {张三: 初入少林} | 悬念: [深夜密函]\n- 第2章 下山"
    foreshadow_section = "- 神秘密函（埋设于第1章）\n- 断剑之谜（埋设于第2章）"
    messages = _assemble_cross_chapter_prompt(project, ref, cards, foreshadow_section)
    assert messages[0]["role"] == "system"
    user = messages[1]["content"]
    # 流派
    assert "武侠" in user
    # 参考上下文
    assert "术语库" in user and "绝学" in user
    assert "角色库" in user and "张三" in user
    assert "江湖" in user
    # 章节卡片(文本,非 json.dumps blob)
    assert "第1章" in user and "第2章" in user
    assert "悬念" in user  # format_chapter_card 的 unresolved_hooks 段
    # 待核验伏笔表
    assert "## 待核验伏笔" in user
    assert "神秘密函" in user and "断剑之谜" in user
    # system 维度含 foreshadowing 引导对"待核验伏笔"核验
    assert "待核验伏笔" in messages[0]["content"]


def test_assemble_supports_to_chapter_field_hint():
    messages = _assemble_cross_chapter_prompt(_fake_project(), "无", "卡片", "无")
    sys = messages[0]["content"]
    # 模板里给出 to_chapter 字段,让 issue 标注跨度
    assert "to_chapter" in sys


def test_assemble_empty_foreshadow_section_shows_wu():
    messages = _assemble_cross_chapter_prompt(_fake_project(), "无", "卡片", "无")
    assert "## 待核验伏笔\n无" in messages[1]["content"]
