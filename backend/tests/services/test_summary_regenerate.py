"""tests.services.test_summary_regenerate

章节摘要手动重生入口(GenerationService.regenerate_summary)的前置校验测试。

不连 DB:用 FakeSession 模拟查询,纯校验失败路径(章节不存在/正文过短/模型不存在)。
成功路径依赖 _generate_content_summary 与真实 adapter,留给手动冒烟。
"""

from __future__ import annotations

import uuid

from app.services.generation_service import GenerationService


class _FakeScalars:
    def __init__(self, items):
        self._items = items

    def first(self):
        return self._items[0] if self._items else None

    def all(self):
        return list(self._items)

    def scalars(self):
        return self

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None


class _FakeSession:
    """按 select 目标的模型名返回预置结果的极简 AsyncSession。

    results: {ModelClassName: [row, ...]}
    """

    def __init__(self, results: dict):
        self._results = results
        self.refreshed = None

    async def execute(self, stmt):
        # stmt 是 select(Model);取 column 0 的实体类名做分派键
        try:
            entity = stmt.column_descriptions[0]["entity"]
            key = entity.__name__
        except Exception:  # noqa: BLE001
            key = None
        return _FakeScalars(self._results.get(key, []))

    async def refresh(self, obj):
        self.refreshed = obj


def _mk_chapter(content: str):
    ch = type("Chapter", (), {})()
    ch.id = uuid.uuid4()
    ch.content = content
    ch.content_summary = None
    return ch


def _mk_model():
    mc = type("ModelConfig", (), {})()
    mc.id = uuid.uuid4()
    return mc


def test_chapter_not_found_raises():
    db = _FakeSession({"Chapter": []})  # 无章节
    db._results = {}
    svc = GenerationService(db)  # type: ignore[arg-type]
    try:
        import asyncio

        asyncio.run(svc.regenerate_summary(uuid.uuid4(), uuid.uuid4()))
    except ValueError as e:
        assert "不存在" in str(e)
        return
    raise AssertionError("应在章节不存在时抛 ValueError")


def test_chapter_too_short_raises():
    ch = _mk_chapter("短")  # <100 字
    mc = _mk_model()
    db = _FakeSession({"Chapter": [ch]}, )
    db._results = {"Chapter": [ch], "ModelConfig": [mc]}
    svc = GenerationService(db)  # type: ignore[arg-type]
    try:
        import asyncio

        asyncio.run(svc.regenerate_summary(ch.id, mc.id))
    except ValueError as e:
        assert "过短" in str(e)
        return
    raise AssertionError("应在正文过短时抛 ValueError")


def test_model_not_found_raises():
    ch = _mk_chapter("一" * 200)  # 够长
    db = _FakeSession({})
    db._results = {"Chapter": [ch], "ModelConfig": []}  # 无模型
    svc = GenerationService(db)  # type: ignore[arg-type]
    try:
        import asyncio

        asyncio.run(svc.regenerate_summary(ch.id, uuid.uuid4()))
    except ValueError as e:
        assert "模型" in str(e)
        return
    raise AssertionError("应在模型不存在时抛 ValueError")
