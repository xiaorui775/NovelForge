from typing import Optional
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Outline(Base):
    __tablename__ = "outlines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    total_chapters: Mapped[int] = mapped_column(Integer)
    synopsis: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="outline")  # noqa: F821
    chapter_outlines: Mapped[list["ChapterOutline"]] = relationship(back_populates="outline", order_by="ChapterOutline.sort_order", cascade="all, delete-orphan")  # noqa: F821


class ChapterOutline(Base):
    __tablename__ = "chapter_outlines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    outline_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("outlines.id", ondelete="CASCADE"), index=True)
    chapter_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[Optional[str]] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    detail_outline: Mapped[Optional[str]] = mapped_column(Text)
    chapter_memo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    outline: Mapped["Outline"] = relationship(back_populates="chapter_outlines")  # noqa: F821
    chapter: Mapped["Optional[Chapter]"] = relationship(back_populates="chapter_outline", cascade="all, delete-orphan")  # noqa: F821
