"""后写验证服务 — 纯规则检查，零 LLM 成本。

借鉴 inkos 的 post-write-validator.ts 和 ai-tells.ts，
检测 AI 生成文本中的常见问题：禁句、AI味道词、段落等长、句式重复等。
"""

import re
from typing import List, Dict


class ValidationService:
    # 硬性禁句（error 级别）
    PROHIBITED_PATTERNS = [
        (r"不是[^，。！？\n]{0,30}[，,]?\s*而是", "禁止句式", "AI高频「不是…而是…」句式"),
        (r"到这里[，,]?算是", "元叙事", "不应出现叙述者旁白"),
        (r"接下来[，,]?(?:就是|将会|即将)", "元叙事", "不应出现叙述者旁白"),
        (r"(?:故事|剧情)(?:发展)?到了", "元叙事", "不应出现叙述者旁白"),
        (r"读者[，,]?(?:可能|应该|也许)", "元叙事", "不应出现叙述者旁白"),
        (r"我们[，,]?(?:可以|不妨|来看)", "元叙事", "不应出现叙述者旁白"),
    ]

    # 分析报告术语（不应出现在正文中）
    REPORT_TERMS = [
        "核心动机", "信息边界", "信息落差", "核心风险", "利益最大化",
        "当前处境", "行为约束", "性格过滤", "情绪外化", "锚定效应",
        "沉没成本", "认知共鸣", "行为驱动", "叙事张力",
    ]

    # AI味道词及每千字阈值
    AI_WORDS = {
        "仿佛": 3, "宛如": 3, "不禁": 4, "竟然": 4, "猛然": 3,
        "然而": 3, "不过": 3, "与此同时": 2, "尽管如此": 2,
        "显然": 2, "毋庸置疑": 1, "众所周知": 1, "不言而喻": 1,
        "不难看出": 1,
    }

    # 集体震惊模式
    COLLECTIVE_SHOCK = [
        r"(?:全场|众人|所有人|在场的人)[，,]?(?:都|全|齐齐|纷纷)?(?:震惊|惊呆|倒吸凉气|目瞪口呆|哗然|惊呼)",
        r"(?:全场|一片)[，,]?(?:寂静|哗然|沸腾|震动)",
    ]

    @staticmethod
    def validate(content: str, target_words: int = 0) -> List[Dict]:
        """运行所有验证规则，返回问题列表。"""
        if not content or len(content) < 50:
            return []
        issues = []
        issues.extend(ValidationService._check_prohibitions(content))
        issues.extend(ValidationService._check_ai_tells(content))
        issues.extend(ValidationService._check_structure(content, target_words))
        return issues

    @staticmethod
    def _check_prohibitions(content: str) -> List[Dict]:
        issues = []
        for pattern, rule, desc in ValidationService.PROHIBITED_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "severity": "error",
                    "rule": rule,
                    "description": f"{desc}，出现 {len(matches)} 次",
                    "suggestion": "改用具体动作或对话替代",
                })
        for term in ValidationService.REPORT_TERMS:
            count = content.count(term)
            if count > 0:
                issues.append({
                    "severity": "error",
                    "rule": "报告术语",
                    "description": f"正文中出现分析报告术语「{term}」({count}次)",
                    "suggestion": "删除或用叙事语言替换",
                })
        for pattern in ValidationService.COLLECTIVE_SHOCK:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "severity": "warning",
                    "rule": "集体震惊",
                    "description": f"出现「全场震惊」类描写 ({len(matches)}次)",
                    "suggestion": "改为具体个体反应",
                })
        return issues

    @staticmethod
    def _check_ai_tells(content: str) -> List[Dict]:
        issues = []
        char_count = len(content)

        # AI味道词密度
        for word, threshold in ValidationService.AI_WORDS.items():
            count = content.count(word)
            if count > 0:
                density = count / (char_count / 1000)
                if density > threshold:
                    issues.append({
                        "severity": "warning",
                        "rule": "AI味道",
                        "description": f"「{word}」出现 {count} 次（{density:.1f}/千字），超过阈值 {threshold}",
                        "suggestion": f"减少「{word}」的使用，替换为具体描写",
                    })

        # 段落等长检测
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip() and len(p.strip()) > 10]
        if len(paragraphs) >= 4:
            lengths = [len(p) for p in paragraphs]
            mean = sum(lengths) / len(lengths)
            if mean > 0:
                variance = sum((l - mean) ** 2 for l in lengths) / len(lengths)
                cv = (variance ** 0.5) / mean
                if cv < 0.15:
                    issues.append({
                        "severity": "warning",
                        "rule": "段落等长",
                        "description": f"段落长度变异系数 {cv:.3f}（阈值<0.15），段落过于均匀",
                        "suggestion": "增加段落长度差异，短段用于冲击，长段用于沉浸",
                    })

        # 连续相同开头检测
        sentences = re.split(r"[。！？\n]", content)
        sentences = [s.strip() for s in sentences if s.strip() and len(s) >= 4]
        if len(sentences) >= 4:
            openings = [s[:2] for s in sentences]
            for i in range(len(openings) - 3):
                if len(set(openings[i : i + 4])) == 1:
                    issues.append({
                        "severity": "warning",
                        "rule": "句式重复",
                        "description": f"连续 4 句以「{openings[i]}」开头",
                        "suggestion": "变换句式和开头",
                    })
                    break

        # "了"字密度检测
        le_count = content.count("了")
        le_density = le_count / (char_count / 1000) if char_count > 0 else 0
        if le_density > 30:
            issues.append({
                "severity": "warning",
                "rule": "了字过多",
                "description": f"「了」出现 {le_count} 次（{le_density:.0f}/千字），密度偏高",
                "suggestion": "减少「了」字，改用更具体的动词时态表达",
            })

        return issues

    @staticmethod
    def _check_structure(content: str, target_words: int) -> List[Dict]:
        issues = []
        actual = len(content)
        if target_words > 0:
            deviation = abs(actual - target_words) / target_words
            if deviation > 0.3:
                issues.append({
                    "severity": "warning",
                    "rule": "字数偏差",
                    "description": f"实际 {actual} 字 vs 目标 {target_words} 字，偏差 {deviation:.0%}",
                    "suggestion": "调整内容密度",
                })

        # 空段落检测
        empty_paras = content.count("\n\n\n")
        if empty_paras > 2:
            issues.append({
                "severity": "info",
                "rule": "空段落",
                "description": f"出现 {empty_paras} 处连续空行",
                "suggestion": "清理多余空行",
            })

        return issues
