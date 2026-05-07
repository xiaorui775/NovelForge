from typing import Optional
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    genre: Mapped[Optional[str]] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(20), default="zh-CN")
    target_words_per_chapter_min: Mapped[int] = mapped_column(Integer, default=3000)
    target_words_per_chapter_max: Mapped[int] = mapped_column(Integer, default=5000)
    worldview_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("worldviews.id"))
    cover_image: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    style_reference: Mapped[Optional[str]] = mapped_column(Text)
    dialogue_ratio: Mapped[float] = mapped_column(Numeric(3, 2), default=0.40)
    tags: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    outline: Mapped["Optional[Outline]"] = relationship(back_populates="project", cascade="all, delete-orphan")  # noqa: F821
    worldview: Mapped["Worldview | None"] = relationship(back_populates="projects")  # noqa: F821
    foreshadowings = relationship("Foreshadowing", back_populates="project", cascade="all, delete-orphan")  # noqa: F821
    chat_messages = relationship("ChatMessage", back_populates="project", cascade="all, delete-orphan")  # noqa: F821
    cover_images = relationship("CoverImage", back_populates="project", cascade="all, delete-orphan")  # noqa: F821
