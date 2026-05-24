import json
import logging
import re
import uuid
from typing import AsyncGenerator, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.chapter_summary import ChapterSummary
from app.models.character import Character
from app.models.chat import ChatMessage
from app.models.foreshadowing import Foreshadowing
from app.models.model_config import ModelConfig
from app.models.outline import ChapterOutline, Outline
from app.models.project import Project
from app.models.terminology import Terminology
from app.models.worldview import Worldview

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_history(self, project_id: uuid.UUID, limit: int = 50) -> list[ChatMessage]:
        result = await self.db.execute(
            select(ChatMessage)
            .where(ChatMessage.project_id == project_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def _build_system_prompt(
        self,
        project: Project,
        referenced_chapter_id: Optional[uuid.UUID] = None,
        referenced_text: Optional[str] = None,
        context_mode: str = "full",
        model_config=None,
    ) -> str:
        """构建系统提示，按 context_mode 注入不同深度的上下文"""
        # 获取大纲
        outline_result = await self.db.execute(
            select(Outline)
            .where(Outline.project_id == project.id)
            .order_by(Outline.updated_at.desc(), Outline.created_at.desc())
        )
        outline = outline_result.scalars().first()

        # 获取角色（通过世界观关联）
        characters = []
        if project.worldview_id:
            wv_result = await self.db.execute(
                select(Worldview)
                .where(Worldview.id == project.worldview_id)
                .options(selectinload(Worldview.characters))
            )
            wv = wv_result.scalar_one_or_none()
            if wv:
                characters = list(wv.characters)

        # 获取术语
        terms_result = await self.db.execute(
            select(Terminology).where(Terminology.project_id == project.id)
        )
        terms = list(terms_result.scalars().all())

        # 组装基础提示
        parts = [
            f"你是一位专业的写作助手，正在帮助作者创作「{project.name}」。",
            f"小说类型：{project.genre or '未指定'}",
            f"语言：{project.language}",
        ]

        if outline:
            parts.append(f"\n## 全书大纲\n{outline.synopsis or '暂无'}")

        if characters:
            char_lines = []
            for c in characters[:10]:
                line = f"- {c.name}"
                if c.role_type:
                    line += f"（{c.role_type}）"
                if c.description:
                    line += f"：{c.description[:100]}"
                char_lines.append(line)
            parts.append("\n## 主要角色\n" + "\n".join(char_lines))

        if terms:
            term_lines = [f"- {t.term}: {t.description or ''}" for t in terms[:20]]
            parts.append("\n## 术语\n" + "\n".join(term_lines))

        # full 模式：注入全部章节摘要 + 伏笔
        if context_mode == "full" and outline:
            # 获取所有章节（含摘要状态）
            co_result = await self.db.execute(
                select(ChapterOutline, Chapter, ChapterSummary)
                .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
                .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
                .where(ChapterOutline.outline_id == outline.id)
                .order_by(ChapterOutline.chapter_number)
            )
            all_rows = list(co_result.all())

            # 懒生成：对最近缺失或过期摘要的章节补生成（最多 3 章，避免过多 LLM 调用）
            if model_config:
                from app.services.generation_service import GenerationService
                gen_svc = GenerationService(self.db)
                generated = 0
                for co, ch, cs in reversed(all_rows):
                    if generated >= 3:
                        break
                    if not ch or not ch.content or len(ch.content.strip()) < 100:
                        continue
                    need_generate = False
                    if not cs and not ch.content_summary:
                        need_generate = True
                    elif cs and cs.is_stale:
                        need_generate = True
                    if need_generate:
                        await gen_svc._generate_content_summary(ch, model_config)
                        await self.db.refresh(ch)
                        generated += 1

            # 重新查询以获取最新摘要（含结构化字段）
            co_result = await self.db.execute(
                select(ChapterOutline, Chapter, ChapterSummary)
                .outerjoin(Chapter, Chapter.chapter_outline_id == ChapterOutline.id)
                .outerjoin(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
                .where(ChapterOutline.outline_id == outline.id)
                .order_by(ChapterOutline.chapter_number)
            )
            from app.services.common import format_chapter_card
            chapter_lines = []
            for co, ch, cs in co_result.all():
                chapter_lines.append(format_chapter_card(co, cs, ch.content_summary if ch else None))
            if chapter_lines:
                parts.append("\n## 章节状态卡\n" + "\n".join(chapter_lines))

            # 活跃伏笔
            fs_result = await self.db.execute(
                select(Foreshadowing)
                .where(Foreshadowing.project_id == project.id, Foreshadowing.status != "resolved")
                .limit(10)
            )
            foreshadowings = list(fs_result.scalars().all())
            if foreshadowings:
                fs_lines = [f"- {f.description}" for f in foreshadowings]
                parts.append("\n## 活跃伏笔\n" + "\n".join(fs_lines))

        # chapter / selection 模式：注入引用的章节内容
        if referenced_chapter_id and context_mode in ("chapter", "selection"):
            # 加载章节
            ch_result = await self.db.execute(
                select(Chapter, ChapterOutline)
                .join(ChapterOutline, Chapter.chapter_outline_id == ChapterOutline.id)
                .where(Chapter.id == referenced_chapter_id)
            )
            row = ch_result.first()
            if row:
                chapter, co = row
                parts.append(f"\n## 当前讨论章节：第{co.chapter_number}章 {co.title or ''}")

                if chapter.content_summary:
                    parts.append(f"章节摘要：{chapter.content_summary}")

                if context_mode == "chapter" and chapter.content:
                    content_excerpt = chapter.content[:8000]
                    parts.append(f"\n## 章节全文\n{content_excerpt}")

                if context_mode == "selection" and referenced_text:
                    parts.append(f"\n## 选中的段落\n{referenced_text}")

        # 系列前作上下文
        if project.series_id:
            from app.services.series_service import SeriesService
            svc = SeriesService(self.db)
            ctx = await svc.get_predecessor_context(project.id)
            if ctx:
                series_parts = []
                if ctx.get("earlier_books_text"):
                    series_parts.append(ctx["earlier_books_text"])
                if ctx.get("immediate_predecessor_text"):
                    series_parts.append(ctx["immediate_predecessor_text"])
                if series_parts:
                    parts.append("\n## 系列前作概要（本书是系列续作，请保持连贯）\n" + "\n".join(series_parts))

        parts.append(
            "\n## 指导原则\n"
            "- 保持角色性格一致\n"
            "- 维护世界观逻辑自洽\n"
            "- 注意伏笔的埋设和回收\n"
            "- 节奏张弛有度\n"
            "- 回答简洁，聚焦写作问题\n\n"
            "## 改写/润色规则\n"
            "当用户要求改写、润色、替换某段文本时，先给出分析和建议，"
            "然后在回复末尾用以下格式附上建议操作：\n"
            "<!--ACTION: {\"action\": \"replace\", \"chapter_id\": \"章节ID\", \"content\": \"替换后的完整文本\"} -->\n"
            "其中 chapter_id 从引用上下文中获取，content 为替换后的完整文本。"
        )

        return "\n".join(parts)

    async def send_message_stream(
        self,
        project_id: uuid.UUID,
        message: str,
        model_id: uuid.UUID,
        referenced_chapter_id: Optional[uuid.UUID] = None,
        referenced_text: Optional[str] = None,
        context_mode: str = "full",
    ) -> AsyncGenerator[str, None]:
        """发送消息并流式返回响应"""
        # 获取模型配置
        model_result = await self.db.execute(select(ModelConfig).where(ModelConfig.id == model_id))
        model_config = model_result.scalar_one_or_none()
        if not model_config:
            yield json.dumps({"type": "error", "message": "模型不存在"}, ensure_ascii=False)
            return

        # 获取项目
        project_result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        if not project:
            yield json.dumps({"type": "error", "message": "项目不存在"}, ensure_ascii=False)
            return

        # 保存用户消息（含引用上下文）
        user_msg = ChatMessage(
            project_id=project_id,
            role="user",
            content=message,
            referenced_chapter_id=referenced_chapter_id,
            referenced_text=referenced_text,
            context_mode=context_mode,
        )
        self.db.add(user_msg)
        await self.db.flush()

        # 构建对话历史（最近 3 轮保持原文，更早的压缩）
        history = await self.get_history(project_id, limit=50)
        compressed_history = self._compress_history(history, keep_recent=3)
        system_prompt = await self._build_system_prompt(
            project,
            referenced_chapter_id=referenced_chapter_id,
            referenced_text=referenced_text,
            context_mode=context_mode,
            model_config=model_config,
        )

        messages = [{"role": "system", "content": system_prompt}]
        for msg in compressed_history:
            messages.append({"role": msg.role, "content": msg.content})

        # 流式生成
        adapter = AdapterFactory.create(model_config)
        full_content = ""
        token_count = 0

        try:
            async for chunk in adapter.generate_stream(messages, max_tokens=2000):
                full_content += chunk
                token_count += 1
                yield json.dumps({"type": "token", "content": chunk}, ensure_ascii=False)

            # 使用真实 token 数据
            usage = adapter.last_usage
            actual_tokens = usage.completion_tokens if usage and usage.completion_tokens > 0 else token_count

            # 解析 AI 回复中的建议操作（改写/润色类）— 支持多个 ACTION
            suggested_actions = []
            display_content = full_content
            for action_match in re.finditer(r'<!--ACTION:\s*(.*?)\s*-->', full_content, re.DOTALL):
                try:
                    action_data = json.loads(action_match.group(1))
                    if action_data.get("action") in ("replace", "insert"):
                        # 用消息的 referenced_chapter_id 覆盖 AI 输出的 chapter_id（更可靠）
                        if referenced_chapter_id:
                            action_data["chapter_id"] = str(referenced_chapter_id)
                        suggested_actions.append(action_data)
                except (json.JSONDecodeError, ValueError):
                    pass

            # 从显示内容中移除所有 ACTION 标记
            if suggested_actions:
                display_content = re.sub(r'<!--ACTION:\s*.*?\s*-->', '', full_content, flags=re.DOTALL).strip()

            # 兼容：suggested_action 字段存第一个（旧前端），新字段存全部
            suggested_action = json.dumps(suggested_actions, ensure_ascii=False) if suggested_actions else None

            # 保存助手消息
            assistant_msg = ChatMessage(
                project_id=project_id,
                role="assistant",
                content=display_content,
                model_id=model_id,
                token_used=actual_tokens,
                referenced_chapter_id=referenced_chapter_id,
                suggested_action=suggested_action,
            )
            self.db.add(assistant_msg)
            await self.db.flush()

            yield json.dumps(
                {
                    "type": "done",
                    "message_id": str(assistant_msg.id),
                    "token_used": actual_tokens,
                },
                ensure_ascii=False,
            )

        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            if full_content:
                assistant_msg = ChatMessage(
                    project_id=project_id,
                    role="assistant",
                    content=full_content + "\n\n[生成中断]",
                    model_id=model_id,
                    token_used=token_count,
                )
                self.db.add(assistant_msg)
                await self.db.flush()

            yield json.dumps(
                {"type": "error", "message": f"生成失败: {type(e).__name__}: {str(e)}"},
                ensure_ascii=False,
            )

    @staticmethod
    def _compress_history(history: list[ChatMessage], keep_recent: int = 3) -> list[ChatMessage]:
        """压缩聊天历史：最近 keep_recent 轮保持原文，更早的压缩为关键信息摘要"""
        if len(history) <= keep_recent * 2:
            return history

        result = []
        split_point = len(history) - keep_recent * 2

        # 将早期消息压缩为关键信息摘要
        early_parts = []
        for msg in history[:split_point]:
            content = msg.content or ""
            if msg.role == "user":
                # 提取用户意图关键词
                question = content.strip()
                if len(question) > 80:
                    question = question[:80] + "…"
                early_parts.append(f"用户问了：{question}")
            elif msg.role == "assistant":
                # 提取助手建议要点
                answer = content.strip()
                # 取第一句话作为核心建议
                first_sentence = answer.split("。")[0] if "。" in answer else answer.split("\n")[0]
                if len(first_sentence) > 100:
                    first_sentence = first_sentence[:100] + "…"
                early_parts.append(f"助手建议：{first_sentence}")
        early_summary = "\n".join(early_parts)

        from types import SimpleNamespace
        result.append(SimpleNamespace(
            role="user",
            content=f"[历史概要]\n{early_summary}\n[以上是之前的对话概要，以下是最新对话]",
        ))

        # 最近的保持原文
        for msg in history[split_point:]:
            result.append(msg)

        return result

    async def clear_history(self, project_id: uuid.UUID) -> None:
        """清空项目聊天记录"""
        result = await self.db.execute(
            select(ChatMessage).where(ChatMessage.project_id == project_id)
        )
        messages = result.scalars().all()
        for msg in messages:
            await self.db.delete(msg)
        await self.db.flush()
