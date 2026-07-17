"""tests.utils.test_json_extract

加固后的 extract_json 纯函数测试。不依赖 DB / 网络，只验证 LLM 文本解析鲁棒性。
"""

from __future__ import annotations

import json

import pytest

from app.utils.json_extract import extract_json, extract_json_or_default


def test_plain_object():
    assert extract_json('{"a": 1, "b": 2}') == {"a": 1, "b": 2}


def test_plain_array():
    assert extract_json("[1, 2, 3]") == [1, 2, 3]


def test_surrounding_text():
    raw = "好的，结果如下：\n```json\n{\"score\": 7}\n```\n以上是评分。"
    assert extract_json(raw) == {"score": 7}


def test_fence_without_lang_tag():
    raw = "```\n[1, 2, 3]\n```"
    assert extract_json(raw) == [1, 2, 3]


def test_trailing_comma_repaired():
    # 严格 json.loads 会拒绝，repair 兜底应解析成功
    assert extract_json('{"x": 1, "y": [2, 3,], }') == {"x": 1, "y": [2, 3]}


def test_single_quotes_repaired():
    # LLM 常用单引号；repair 应能恢复
    r = extract_json("{'name': '张三', 'ok': true}")
    assert r == {"name": "张三", "ok": True}


def test_unquoted_keys_repaired():
    r = extract_json('{a: 1, b: "x"}')
    assert r == {"a": 1, "b": "x"}


def test_string_literal_contains_braces():
    # 反例：旧版 brace 配平会被字符串内的花括号误导，截断在错误位置
    raw = '分析 {"desc": "他说{啥}都不算数", "ok": true}'
    r = extract_json(raw)
    assert r == {"desc": "他说{啥}都不算数", "ok": True}


def test_string_literal_contains_brackets():
    raw = '结果 {"list": "见 [附录]", "ok": true}'
    r = extract_json(raw)
    assert isinstance(r, dict)
    assert r["ok"] is True


def test_truncated_array_repaired():
    # 流式中断的半截数组，repair 应补全为可解析结构
    raw = "```json\n[{\"id\":1},{\"id\":2  "
    r = extract_json(raw)
    assert isinstance(r, (list, dict))
    # 至少应保留第一条完整数据
    s = json.dumps(r, ensure_ascii=False)
    assert '"id": 1' in s or '"id":1' in s


def test_truncated_object_repaired():
    raw = '回复 {"a": 1, "b": {"c":'
    r = extract_json(raw)
    assert r == {"a": 1, "b": {"c": ""}}


def test_nested_array_in_text():
    raw = 'list如下 [{"k": [1, {"m": 2}]}, {"k": [3]}] ok'
    r = extract_json(raw)
    assert r == [{"k": [1, {"m": 2}]}, {"k": [3]}]


def test_empty_raises():
    with pytest.raises(ValueError):
        extract_json("")


def test_whitespace_only_raises():
    with pytest.raises(ValueError):
        extract_json("   \n  ")


def test_pure_text_raises():
    with pytest.raises(ValueError):
        extract_json("这是一段完全没有 JSON 的文字")


def test_or_default_returns_default_on_failure():
    assert extract_json_or_default("nope", {"fallback": True}) == {"fallback": True}


def test_or_default_returns_parsed_on_success():
    assert extract_json_or_default('{"a": 1}', None) == {"a": 1}


def test_or_default_returns_list():
    assert extract_json_or_default("[1,2]", None) == [1, 2]
