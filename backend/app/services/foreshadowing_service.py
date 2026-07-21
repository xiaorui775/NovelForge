import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.foreshadowing import Foreshadowing
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.utils.json_extract import extract_json, extract_json_or_default

logger = logging.getLogger(__name__)

# 伏笔回收建议(§4.3 P2)分级——仅 stale open 伏笔触发,批处理封顶 LLM 调用。
_STALE_GAP = 10          # 埋设章距今 ≥ N 章仍 open 视为 stale(与 FE 阈值对齐)
_STALE_BATCH = 3         # 每批把 N 个 stale open 伏笔的候选章合并成一次 LLM
_SUGGEST_CANDIDATE_CHAPTERS = 6  # 每个伏笔取埋设章后最近 N 章做候选,控制 token
_SUGGEST_MAX_TOKENS = 2000
_SCAN_TAIL_CHARS = 1500  # 扫描时每章附上的章末原文长度(伏笔常埋于章末)
# dedup:2-gram Jaccard ≥ 此阈值视为重复;描述过短(<此字符数)回退精确前缀避免误并
_DEDUP_JACCARD = 0.6
_DEDUP_SHORT_TEXT = 40


def _bigrams_set(text: str) -> set[str]:
    s = re.sub(r"\s+", "", text or "")
    if len(s) <= 1:
        return set()
    return {s[i : i + 2] for i in range(len(s) - 1)}


def _foreshadow_similar(a: str, b: str) -> bool:
    """两段伏笔描述是否视为重复。

    长文本用 CJK 2-gram Jaccard(≥ _DEDUP_JACCARD);描述过短(< _DEDUP_SHORT_TEXT)
    回退前缀包含判定(较短的若是较长的前缀视为重复),避免短文本下 bigram 偶然高度
    重叠导致误并、又能识别"加上后缀注释"这类重述。
    """
    a = (a or "").strip()
    b = (b or "").strip()
    if not a or not b:
        return False
    if len(a) < _DEDUP_SHORT_TEXT or len(b) < _DEDUP_SHORT_TEXT:
        short, long_ = (a, b) if len(a) <= len(b) else (b, a)
        return long_.startswith(short)
    pa, pb = _bigrams_set(a), _bigrams_set(b)
    if not pa or not pb:
        return False
    inter = len(pa & pb)
    union = len(pa | pb)
    return union > 0 and inter / union >= _DEDUP_JACCARD


class ForeshadowingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_project(self, project_id: uuid.UUID) -> list[Foreshadowing]:
        result = await self.db.execute(
            select(Foreshadowing)
            .where(Foreshadowing.project_id == project_id)
            .order_by(Foreshadowing.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, project_id: uuid.UUID, data) -> Foreshadowing:
        item = Foreshadowing(project_id=project_id, **data.model_dump(exclude_unset=True))
        self.db.add(item)
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def update(self, foreshadowing_id: uuid.UUID, data) -> Foreshadowing:
        result = await self.db.execute(
            select(Foreshadowing).where(Foreshadowing.id == foreshadowing_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("伏笔不存在")

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(item, field, value)

        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def delete(self, foreshadowing_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(Foreshadowing).where(Foreshadowing.id == foreshadowing_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            raise ValueError("伏笔不存在")
        await self.db.delete(item)
        await self.db.flush()

    async def scan_chapters(self, project_id: uuid.UUID, model_id: uuid.UUID) -> list[dict]:
        """AI 扫描章节，识别伏笔（分批处理，避免撑爆上下文）"""
        # 获取模型配置
        model_result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
        model_config = model_result.scalar_one_or_none()
        if not model_config:
            raise ValueError("模型不存在")

        # 获取项目
        project_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError("项目不存在")

        # 获取所有已完成章节（含摘要）
        from app.models.chapter_summary import ChapterSummary

        chapters_result = await self.db.execute(
            select(Chapter, ChapterOutline, ChapterSummary)
            .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
            .join(Outline, ChapterOutline.outline_id == Outline.id)
            .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
            .where(Outline.project_id == project_id, Chapter.status == "completed")
            .order_by(ChapterOutline.chapter_number)
        )
        chapters = chapters_result.all()

        if not chapters:
            raise ValueError("没有已完成的章节可供扫描")

        adapter = await AdapterFactory.create(model_config)

        # 分批扫描，每批 3 章以控制 token 消耗
        batch_size = 3
        all_results = []
        seen_descriptions: list[str] = []  # 改为列表,用 _foreshadow_similar 判重

        for batch_start in range(0, len(chapters), batch_size):
            batch = chapters[batch_start:batch_start + batch_size]

            chapter_texts = []
            for chapter, chapter_outline, cs in batch:
                from app.services.common import format_chapter_card
                head = f"第{chapter_outline.chapter_number}章「{chapter_outline.title or '无标题'}」"
                # 卡片:有结构化摘要时提供紧凑概览(时间线/角色/悬念)
                card = ""
                if cs and (cs.events or cs.character_states or cs.unresolved_hooks):
                    card = format_chapter_card(chapter_outline, cs, chapter.content_summary)
                # 尾部原文:伏笔常埋于章末,摘要压缩易丢;始终附上尾部 N 字保证覆盖
                content = chapter.content or ""
                tail = content[-_SCAN_TAIL_CHARS:] if len(content) > _SCAN_TAIL_CHARS else content
                # 组合:卡片(若有)+ 尾部原文。既给结构化概览又保住章末伏笔线索
                parts = [head]
                if card:
                    parts.append(card)
                parts.append(f"[章末原文]\n{tail}")
                chapter_texts.append("\n".join(parts))

            messages = [
                {
                    "role": "system",
                    "content": (
                        "你是一位资深的文学编辑，擅长识别小说中的伏笔和悬念。\n\n"
                        "请仔细阅读以下小说章节内容，识别其中埋设的伏笔。\n"
                        "伏笔是指作者有意安排的细节、暗示或悬念，预期在后续章节中得到解答或回收。\n\n"
                        "请严格以 JSON 数组格式输出，不要包含其他内容：\n"
                        '[{"description": "伏笔描述", "plant_chapter_number": 1, "confidence": 0.8}]\n\n'
                        "description: 伏笔的简要描述\n"
                        "plant_chapter_number: 埋设伏笔的章节号\n"
                        "confidence: 置信度 0-1，越高越确定是有意的伏笔"
                    ),
                },
                {
                    "role": "user",
                    "content": f"小说类型：{project.genre or '未知'}\n\n" + "\n---\n".join(chapter_texts),
                },
            ]

            try:
                result = await adapter.generate(messages, max_tokens=2000)
            except Exception as e:
                logger.error(f"AI 模型调用失败: {e}")
                raise ValueError(f"AI 模型调用失败: {type(e).__name__}: {str(e)}")

            raw = result["content"].strip()
            if not raw:
                continue

            # 提取 JSON
            try:
                data = extract_json(result["content"])
            except ValueError as e:
                logger.warning(f"伏笔扫描 JSON 解析失败: {e}")
                continue

            if not isinstance(data, list):
                continue

            # 建立当前批次的章节号 -> chapter_outline_id 映射
            chapter_map = {}
            for _, co, _ in batch:
                chapter_map[co.chapter_number] = co.id
            # 也加入全局映射（伏笔可能引用更早章节号）
            for _, co, _ in chapters:
                chapter_map[co.chapter_number] = co.id

            for item in data:
                if not isinstance(item, dict):
                    continue
                desc = item.get("description", "")
                # 去重:2-gram 相似度(短文本回退精确前缀)避免近义重复收录
                if any(_foreshadow_similar(desc, s) for s in seen_descriptions):
                    continue
                seen_descriptions.append(desc)

                ch_num = item.get("plant_chapter_number", 0)
                all_results.append({
                    "description": desc,
                    "plant_chapter_number": ch_num,
                    "plant_chapter_id": str(chapter_map.get(ch_num)) if ch_num in chapter_map else None,
                    "confidence": min(1, max(0, float(item.get("confidence", 0.5)))),
                })

        return all_results

    async def suggest_resolution(self, project_id: uuid.UUID, model_id: uuid.UUID) -> list[dict]:
        """为 stale open 伏笔建议回收章节(§4.3 P2)。

        触发条件:status=open 且埋设章距今 ≥ _STALE_GAP 章仍 open(与 FE stale 阈值对齐)。
        对每个 stale open 伏笔取埋设章后最近 _SUGGEST_CANDIDATE_CHAPTERS 个已完成章摘要作为候选,
        按 _STALE_BATCH 个伏笔合并成一次 LLM 调用,返回候选章+置信度+理由。不写库。
        """
        model_result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
        model_config = model_result.scalar_one_or_none()
        if not model_config:
            raise ValueError("模型不存在")

        project_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            raise ValueError("项目不存在")

        outline_result = await self.db.execute(select(Outline).where(Outline.project_id == project_id))
        outline = outline_result.scalar_one_or_none()
        if not outline:
            raise ValueError("项目没有大纲")

        # 项目下所有章 + 摘要,用于计算埋设章号、max 已完成章号、候选章
        from app.models.chapter_summary import ChapterSummary

        co_result = await self.db.execute(
            select(ChapterOutline, Chapter, ChapterSummary)
            .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
            .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
            .where(ChapterOutline.outline_id == outline.id)
            .order_by(ChapterOutline.chapter_number)
        )
        chapters = list(co_result.all())
        # 章号 -> chapter_outline_id,以及已完成章列表
        num_to_id = {co.chapter_number: co.id for co, _ch, _cs in chapters}
        completed = [
            (co, ch, cs) for co, ch, cs in chapters if ch is not None and ch.status == "completed"
        ]
        if not completed:
            raise ValueError("没有已完成的章节可供推断回收")
        max_completed_num = max(co.chapter_number for co, _ch, _cs in completed)

        # 取 open 伏笔并解析埋设章号
        fs_result = await self.db.execute(
            select(Foreshadowing).where(
                Foreshadowing.project_id == project_id, Foreshadowing.status == "open"
            )
        )
        foreshadowings = list(fs_result.scalars().all())

        # stale 判定:埋设章号存在且距今差 ≥ _STALE_GAP
        from app.services.common import format_chapter_card

        stale = []
        for f in foreshadowings:
            plant_co = await self.db.get(ChapterOutline, f.plant_chapter_id) if f.plant_chapter_id else None
            plant_num = plant_co.chapter_number if plant_co else None
            if plant_num is None:
                continue
            if max_completed_num - plant_num >= _STALE_GAP:
                stale.append((f, plant_num))

        if not stale:
            return []

        # 为每个 stale 伏笔取埋设章后最近的 N 个已完成章摘要卡片
        adapter = await AdapterFactory.create(model_config)
        results_by_foreshadowing: dict[uuid.UUID, dict] = {}

        for batch_start in range(0, len(stale), _STALE_BATCH):
            batch = stale[batch_start : batch_start + _STALE_BATCH]
            fs_lines = []
            fs_indices: list[tuple[uuid.UUID, str, int]] = []
            for i, (f, plant_num) in enumerate(batch):
                fs_lines.append(
                    f"[{i}] 描述：{self._truncate(f.description, 200)}（埋设于第{plant_num}章）"
                )
                fs_indices.append((f.id, f.description, plant_num))
            # 候选章:取本批所有伏笔"埋设章之后"并集最近的 _SUGGEST_CANDIDATE_CHAPTERS 章
            candidate_chapters: list = []
            for co, ch, cs in completed:
                # 至少在 batch 中某个伏笔的埋设章之后
                if any(co.chapter_number > pl for _fid, _desc, pl in batch):
                    candidate_chapters.append((co, ch, cs))
            candidate_chapters = candidate_chapters[-_SUGGEST_CANDIDATE_CHAPTERS:]
            card_lines = [
                format_chapter_card(co, cs, ch.content_summary if ch else None)
                for co, ch, cs in candidate_chapters
            ]

            messages = [
                {
                    "role": "system",
                    "content": (
                        "你是一位资深的文学编辑,擅长判断伏笔在前文埋设后于后文哪一章被回收。\n\n"
                        "给定若干仍未回收的伏笔及其后续章节的结构化摘要,请为每个伏笔找出最可能回收它的章节编号,"
                        "并给出匹配依据(对应章节的 resolved_hooks/events/角色状态等)与置信度。\n\n"
                        "严格只输出 JSON 数组,不要额外文字或代码块：\n"
                        '[{"foreshadow_ref": "伏笔序号如 0", "resolution_chapter_number": 5, '
                        '"confidence": 0.8, "matched_hook": "回收章节对应悬念/事件", '
                        '"reason": "为何判定此章回收"}]\n\n'
                        "foreshadow_ref: 与输入序号对应(整数或字符串均可);\n"
                        "resolution_chapter_number: 必须是后续章节中出现过的章节编号;\n"
                        "confidence: 0-1;\n"
                        "若确实没有任何章节回收该伏笔,该伏笔不要出现在结果中。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"小说类型：{project.genre or '未指定'}\n\n"
                        f"## 待建议回收的伏笔\n" + "\n".join(fs_lines)
                        + "\n\n## 后续章节摘要卡片\n" + "\n".join(card_lines)
                    ),
                },
            ]

            try:
                result = await adapter.generate(messages, max_tokens=_SUGGEST_MAX_TOKENS)
            except Exception as e:  # noqa: BLE001
                logger.warning("伏笔回收建议 AI 调用失败: %s", e)
                continue

            data = extract_json_or_default(result.get("content", ""), [])
            if not isinstance(data, list):
                continue

            # 本批内按 foreshadow_ref 归并,同伏笔取最高 confidence
            ref_index = {str(i): i for i in range(len(batch))}
            for item in data:
                if not isinstance(item, dict):
                    continue
                ref = item.get("foreshadow_ref")
                ref_int = ref if isinstance(ref, int) else ref_index.get(str(ref))
                if ref_int is None or not (0 <= ref_int < len(batch)):
                    continue
                f_id, f_desc, _plant_num = fs_indices[ref_int]
                ch_num = item.get("resolution_chapter_number")
                if not isinstance(ch_num, int) or ch_num not in num_to_id:
                    continue
                confidence = min(1.0, max(0.0, float(item.get("confidence", 0.5) or 0.5)))
                existing = results_by_foreshadowing.get(f_id)
                if existing is not None and existing.get("confidence", 0) >= confidence:
                    continue
                results_by_foreshadowing[f_id] = {
                    "foreshadowing_id": str(f_id),
                    "description": f_desc,
                    "plant_chapter_number": _plant_num,
                    "resolution_chapter_number": ch_num,
                    "resolution_chapter_id": str(num_to_id[ch_num]),
                    "confidence": confidence,
                    "matched_hook": str(item.get("matched_hook") or ""),
                    "reason": str(item.get("reason") or ""),
                }

        # 仅保留真正拿到建议的伏笔(语义清晰:无候选者不出现在结果里)
        return list(results_by_foreshadowing.values())

    @staticmethod
    def _truncate(text: str, limit: int) -> str:
        if not text:
            return ""
        return text if len(text) <= limit else text[:limit] + "…"
