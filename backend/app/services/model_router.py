"""模型路由服务

根据任务类型、上下文长度、成本等因素智能选择模型。
不强制路由，尊重用户手动选择，仅提供推荐和降级逻辑。
"""
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from app.models.model_config import ModelConfig

logger = logging.getLogger(__name__)


class TaskType(str, Enum):
    """任务类型"""
    GENERATE = "generate"          # 新生成章节
    CONTINUE = "continue"          # 续写
    REWRITE = "rewrite"            # 改写
    REFINE = "refine"              # 精修
    BRAINSTORM = "brainstorm"      # 脑暴
    OUTLINE = "outline"            # 大纲
    CHAT = "chat"                  # 对话
    ANALYSIS = "analysis"          # 分析（质量评分、一致性检查等）


class ModelTier(str, Enum):
    """模型档位"""
    ECONOMY = "economy"      # 经济版（低价）
    STANDARD = "standard"    # 标准版
    PREMIUM = "premium"      # 优质版（高价）


@dataclass
class RoutingDecision:
    """路由决策结果"""
    recommended_model_id: Optional[str] = None
    recommended_model_name: Optional[str] = None
    tier: ModelTier = ModelTier.STANDARD
    reason: str = ""
    auto_downgraded: bool = False
    original_model_id: Optional[str] = None


class ModelRouter:
    """模型路由器

    提供模型推荐和智能降级，不强制替换用户选择。
    """

    # 任务类型到推荐档位的映射
    TASK_TIER_MAP = {
        TaskType.GENERATE: ModelTier.STANDARD,
        TaskType.CONTINUE: ModelTier.ECONOMY,      # 续写通常简单，用便宜模型
        TaskType.REWRITE: ModelTier.ECONOMY,       # 改写通常简单
        TaskType.REFINE: ModelTier.ECONOMY,        # 精修通常简单
        TaskType.BRAINSTORM: ModelTier.STANDARD,
        TaskType.OUTLINE: ModelTier.PREMIUM,       # 大纲质量重要
        TaskType.CHAT: ModelTier.STANDARD,
        TaskType.ANALYSIS: ModelTier.ECONOMY,      # 分析类用便宜模型
    }

    # 上下文长度阈值（token）
    CONTEXT_SHORT = 4000
    CONTEXT_LONG = 8000

    def __init__(self, models: list[ModelConfig]):
        """
        Args:
            models: 可用模型列表（已加载的 ModelConfig）
        """
        self.models = [m for m in models if m.is_active]
        self._by_id = {str(m.id): m for m in self.models}
        self._by_name = {m.model_name.lower(): m for m in self.models}

    def get_model(self, model_id: str) -> Optional[ModelConfig]:
        """按 ID 获取模型"""
        return self._by_id.get(str(model_id))

    def find_by_name(self, name: str) -> Optional[ModelConfig]:
        """按模型名称（部分匹配）查找"""
        name_lower = name.lower()
        for key, model in self._by_name.items():
            if name_lower in key or key in name_lower:
                return model
        return None

    def classify_model_tier(self, model: ModelConfig) -> ModelTier:
        """根据价格将模型分类到档位

        简单启发式：
        - output < 0.001 USD/1k → economy
        - output < 0.01 USD/1k  → standard
        - 否则 → premium
        """
        _, output_rate = self._get_effective_rates(model)
        if output_rate < 0.001:
            return ModelTier.ECONOMY
        elif output_rate < 0.01:
            return ModelTier.STANDARD
        else:
            return ModelTier.PREMIUM

    @staticmethod
    def _get_effective_rates(model: ModelConfig) -> tuple[float, float]:
        """获取有效价格，参考 cost_budget_service 的逻辑"""
        input_rate = float(model.input_cost_per_1k or 0)
        output_rate = float(model.output_cost_per_1k or 0)

        # 如果价格为 0，尝试从默认定价推断（简化版）
        if input_rate == 0 or output_rate == 0:
            name = (model.model_name or "").lower()
            # 常见低价模型
            if "deepseek" in name:
                return 0.00014, 0.00028
            if "qwen-turbo" in name or "turbo" in name:
                return 0.0003, 0.0006
            # 默认回退
            return input_rate or 0.002, output_rate or 0.006

        return input_rate, output_rate

    def recommend_for_task(
        self,
        task: TaskType,
        context_tokens: Optional[int] = None,
        user_preferred_model_id: Optional[str] = None,
    ) -> RoutingDecision:
        """为任务推荐模型

        Args:
            task: 任务类型
            context_tokens: 预估上下文长度（token）
            user_preferred_model_id: 用户手动选择的模型 ID（优先尊重）

        Returns:
            RoutingDecision
        """
        target_tier = self.TASK_TIER_MAP.get(task, ModelTier.STANDARD)

        # 如果用户指定了模型，优先使用（除非上下文过长需要降级）
        if user_preferred_model_id:
            preferred = self.get_model(user_preferred_model_id)
            if preferred:
                # 检查是否需要因上下文长度降级
                if context_tokens and context_tokens > self.CONTEXT_LONG:
                    # 长上下文：如果用户选的是 economy 模型，建议升级
                    tier = self.classify_model_tier(preferred)
                    if tier == ModelTier.ECONOMY:
                        # 找一个 standard 或 premium 作为推荐
                        upgrade = self._find_model_by_tier(ModelTier.STANDARD) or \
                                  self._find_model_by_tier(ModelTier.PREMIUM)
                        if upgrade and str(upgrade.id) != user_preferred_model_id:
                            return RoutingDecision(
                                recommended_model_id=str(upgrade.id),
                                recommended_model_name=upgrade.model_name,
                                tier=self.classify_model_tier(upgrade),
                                reason=f"上下文较长（~{context_tokens} tokens），建议使用更强模型",
                                auto_downgraded=False,
                                original_model_id=user_preferred_model_id,
                            )
                # 用户选择有效，直接返回
                return RoutingDecision(
                    recommended_model_id=user_preferred_model_id,
                    recommended_model_name=preferred.model_name,
                    tier=self.classify_model_tier(preferred),
                    reason="使用用户选择的模型",
                    auto_downgraded=False,
                    original_model_id=user_preferred_model_id,
                )

        # 自动推荐：按目标档位找模型
        recommended = self._find_model_by_tier(target_tier)
        if not recommended:
            # 降级查找
            for fallback_tier in (ModelTier.STANDARD, ModelTier.ECONOMY, ModelTier.PREMIUM):
                recommended = self._find_model_by_tier(fallback_tier)
                if recommended:
                    break

        if not recommended and self.models:
            recommended = self.models[0]

        if recommended:
            return RoutingDecision(
                recommended_model_id=str(recommended.id),
                recommended_model_name=recommended.model_name,
                tier=self.classify_model_tier(recommended),
                reason=f"任务 {task.value} 推荐 {target_tier.value} 档位模型",
                auto_downgraded=False,
            )

        return RoutingDecision(reason="无可用的模型")

    def _find_model_by_tier(self, tier: ModelTier) -> Optional[ModelConfig]:
        """按档位查找模型（返回第一个匹配的）"""
        for m in self.models:
            if self.classify_model_tier(m) == tier:
                return m
        return None

    def find_cheaper_alternative(
        self,
        current_model_id: str,
        threshold_cost_per_1k_output: float = 0.01,
    ) -> Optional[ModelConfig]:
        """寻找比当前模型更便宜的替代品"""
        current = self.get_model(current_model_id)
        if not current:
            return None

        _, current_output = self._get_effective_rates(current)
        if current_output <= threshold_cost_per_1k_output:
            # 当前已经够便宜了
            return None

        # 找更便宜的
        candidates = []
        for m in self.models:
            if str(m.id) == current_model_id:
                continue
            _, out_rate = self._get_effective_rates(m)
            if out_rate < current_output:
                candidates.append((m, out_rate))

        if not candidates:
            return None

        # 返回最便宜的
        candidates.sort(key=lambda x: x[1])
        return candidates[0][0]

    def get_fallback_model(self, failed_model_id: str) -> Optional[ModelConfig]:
        """主模型失败时，找一个降级备选

        策略：
        1. 优先同档位的其他模型
        2. 其次找 economy 模型
        3. 最后随便找一个不同的
        """
        current = self.get_model(failed_model_id)
        if not current:
            return self.models[0] if self.models else None

        current_tier = self.classify_model_tier(current)

        # 同档位其他模型
        for m in self.models:
            if str(m.id) != failed_model_id and self.classify_model_tier(m) == current_tier:
                return m

        # economy 模型
        if current_tier != ModelTier.ECONOMY:
            econ = self._find_model_by_tier(ModelTier.ECONOMY)
            if econ and str(econ.id) != failed_model_id:
                return econ

        # 随便找一个不同的
        for m in self.models:
            if str(m.id) != failed_model_id:
                return m

        return None
