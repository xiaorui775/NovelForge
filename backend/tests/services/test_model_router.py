"""tests.services.test_model_router

模型路由器纯函数测试。覆盖 TaskType、ModelTier、路由决策、降级逻辑等核心功能。
不依赖 DB/网络：使用内存 Mock ModelConfig。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.services.model_router import (
    ModelRouter,
    ModelTier,
    TaskType,
)


# 轻量 Fake ModelConfig，模拟真实字段
@dataclass
class FakeModel:
    id: str
    model_name: str
    input_cost_per_1k: float = 0.0
    output_cost_per_1k: float = 0.0
    is_active: bool = True
    max_context_tokens: Optional[int] = 8000


def _mk_models():
    """构造三档位模型集合"""
    return [
        FakeModel("m1", "deepseek-chat", 0.00014, 0.00028),  # economy
        FakeModel("m2", "doubao-seed", 0.0005, 0.0015),  # standard
        FakeModel("m3", "gpt-4o", 0.005, 0.015),  # premium
    ]


def test_task_tier_map_defaults():
    """默认任务-档位映射合理"""
    assert ModelRouter.TASK_TIER_MAP[TaskType.GENERATE] == ModelTier.STANDARD
    assert ModelRouter.TASK_TIER_MAP[TaskType.CONTINUE] == ModelTier.ECONOMY
    assert ModelRouter.TASK_TIER_MAP[TaskType.OUTLINE] == ModelTier.PREMIUM
    assert ModelRouter.TASK_TIER_MAP[TaskType.ANALYSIS] == ModelTier.ECONOMY


def test_classify_model_tier_by_price():
    router = ModelRouter(_mk_models())
    econ = router.get_model("m1")
    std = router.get_model("m2")
    prem = router.get_model("m3")
    assert router.classify_model_tier(econ) == ModelTier.ECONOMY
    assert router.classify_model_tier(std) == ModelTier.STANDARD
    assert router.classify_model_tier(prem) == ModelTier.PREMIUM


def test_recommend_for_task_respects_user_preferred():
    router = ModelRouter(_mk_models())
    dec = router.recommend_for_task(
        task=TaskType.GENERATE,
        user_preferred_model_id="m3",
    )
    assert dec.recommended_model_id == "m3"
    assert dec.tier == ModelTier.PREMIUM
    assert dec.auto_downgraded is False
    assert "用户选择的模型" in dec.reason


def test_recommend_for_task_auto_by_tier():
    router = ModelRouter(_mk_models())
    dec = router.recommend_for_task(task=TaskType.CONTINUE)  # ECONOMY
    assert dec.recommended_model_id == "m1"
    assert dec.tier == ModelTier.ECONOMY


def test_recommend_for_task_fallback_when_no_tier_match():
    # 只有 economy，请求 OUTLINE(PREMIUM) 应回退到 economy
    only_econ = [FakeModel("e1", "deepseek-chat", 0.00014, 0.00028)]
    router = ModelRouter(only_econ)
    dec = router.recommend_for_task(task=TaskType.OUTLINE)
    assert dec.recommended_model_id == "e1"
    assert dec.tier == ModelTier.ECONOMY


def test_context_length_upgrade_for_economy_user_choice():
    router = ModelRouter(_mk_models())
    # 用户选了 economy，但上下文超长 → 建议升级到 standard/premium
    dec = router.recommend_for_task(
        task=TaskType.GENERATE,
        context_tokens=10000,  # > CONTEXT_LONG(8000)
        user_preferred_model_id="m1",
    )
    assert dec.original_model_id == "m1"
    assert dec.recommended_model_id in ("m2", "m3")
    assert "建议使用更强模型" in dec.reason


def test_find_cheaper_alternative():
    router = ModelRouter(_mk_models())
    # premium 应能找到更便宜的
    cheaper = router.find_cheaper_alternative("m3")
    assert cheaper is not None
    assert cheaper.id in ("m1", "m2")


def test_find_cheaper_alternative_already_cheap():
    router = ModelRouter(_mk_models())
    # economy 本身已很便宜，阈值内应返回 None
    cheaper = router.find_cheaper_alternative("m1", threshold_cost_per_1k_output=0.01)
    assert cheaper is None


def test_get_fallback_model_same_tier_then_economy():
    router = ModelRouter(_mk_models())
    # 优先同档位
    fb = router.get_fallback_model("m2")  # standard 只有这一个，退到 economy
    assert fb is not None
    # 只有一个 standard，fallback 应落到 economy
    assert fb.id == "m1"


def test_get_fallback_model_any_different():
    only_one = [FakeModel("only", "x", 0.001, 0.002)]
    router = ModelRouter(only_one)
    fb = router.get_fallback_model("only")
    # 没有其他模型时返回 None
    assert fb is None


def test_empty_models_returns_sensible_decision():
    router = ModelRouter([])
    dec = router.recommend_for_task(task=TaskType.GENERATE)
    assert dec.recommended_model_id is None
    assert dec.reason == "无可用的模型"


def test_find_by_name_partial_match():
    router = ModelRouter(_mk_models())
    m = router.find_by_name("deepseek")
    assert m is not None and m.id == "m1"
    m2 = router.find_by_name("DOUBAO")
    assert m2 is not None and m2.id == "m2"
