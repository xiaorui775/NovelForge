import json
import logging
import uuid
from typing import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.adapters.adapter_factory import AdapterFactory
from app.models.chapter import Chapter
from app.models.character import Character
from app.models.chat import ChatMessage
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

    async def _build_system_prompt(self, project: Project) -> str:
        """构建系统提示，注入项目上下文"""
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
        if not characters:
            result = await self.db.execute(select(Character))
            characters = list(result.scalars().all())

        # 获取术语
        terms_result = await self.db.execute(
            select(Terminology).where(Terminology.project_id == project.id)
        )
        terms = list(terms_result.scalars().all())

        # 获取最近章节摘要
        recent_chapters = []
        if outline:
            ch_result = await self.db.execute(
                select(ChapterOutline)
                .where(ChapterOutline.outline_id == outline.id)
                .order_by(ChapterOutline.chapter_number.desc())
                .limit(5)
            )
            recent_chapters = list(ch_result.scalars().all())

        # 组装提示
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

        if recent_chapters:
            ch_lines = [
                f"- 第{c.chapter_number}章 {c.title or ''}: {c.summary or '暂无摘要'}"
                for c in reversed(recent_chapters)
            ]
            parts.append("\n## 近期章节\n" + "\n".join(ch_lines))

        parts.append(
            "\n## 指导原则\n"
            "- 保持角色性格一致\n"
            "- 维护世界观逻辑自洽\n"
            "- 注意伏笔的埋设和回收\n"
            "- 节奏张弛有度\n"
            "- 回答简洁，聚焦写作问题"
        )

        return "\n".join(parts)

    async def send_message_stream(
        self,
        project_id: uuid.UUID,
        message: str,
        model_id: uuid.UUID,
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

        # 保存用户消息
        user_msg = ChatMessage(project_id=project_id, role="user", content=message)
        self.db.add(user_msg)
        await self.db.flush()

        # 构建对话历史
        history = await self.get_history(project_id, limit=20)
        system_prompt = await self._build_system_prompt(project)

        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            messages.append({"role": msg.role, "content": msg.content})

        # 流式生成
        adapter = AdapterFactory.create(model_config)
        full_content = ""
        token_count = 0

        try:
            async for chunk in adapter.generate_stream(messages, max_tokens=2000):
                full_content += chunk
                token_count += 1  # 粗略估算
                yield json.dumps({"type": "token", "content": chunk}, ensure_ascii=False)

            # 保存助手消息
            assistant_msg = ChatMessage(
                project_id=project_id,
                role="assistant",
                content=full_content,
                model_id=model_id,
                token_used=token_count,
            )
            self.db.add(assistant_msg)
            await self.db.flush()

            yield json.dumps(
                {
                    "type": "done",
                    "message_id": str(assistant_msg.id),
                    "token_used": token_count,
                },
                ensure_ascii=False,
            )

        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            # 仍然保存已生成的部分
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

    async def clear_history(self, project_id: uuid.UUID) -> None:
        """清空项目聊天记录"""
        result = await self.db.execute(
            select(ChatMessage).where(ChatMessage.project_id == project_id)
        )
        messages = result.scalars().all()
        for msg in messages:
            await self.db.delete(msg)
        await self.db.flush()
