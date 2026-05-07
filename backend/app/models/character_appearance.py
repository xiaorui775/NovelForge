import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CharacterAppearance(Base):
    __tablename__ = "character_appearances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("characters.id", ondelete="CASCADE"))
    chapter_outline_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chapter_outlines.id", ondelete="CASCADE"))
    role_in_chapter: Mapped[str] = mapped_column(String(50), default="minor")  # major, minor, mentioned
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
