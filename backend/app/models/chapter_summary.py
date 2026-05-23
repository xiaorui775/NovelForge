import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Boolean, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ChapterSummary(Base):
    __tablename__ = "chapter_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )

    # 结构化摘要字段（JSON 字符串）
    events: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    character_states: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    unresolved_hooks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_hooks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timeline: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    locations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    narrative_threads: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 元数据
    word_count_at_summary: Mapped[int] = mapped_column(Integer, default=0)
    is_stale: Mapped[bool] = mapped_column(Boolean, default=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    chapter = relationship("Chapter", back_populates="summary")  # noqa: F821
