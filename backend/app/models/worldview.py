from typing import Optional
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Table, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

worldview_characters = Table(
    "worldview_characters",
    Base.metadata,
    Column("worldview_id", UUID(as_uuid=True), ForeignKey("worldviews.id", ondelete="CASCADE"), primary_key=True),
    Column("character_id", UUID(as_uuid=True), ForeignKey("characters.id", ondelete="CASCADE"), primary_key=True),
)


class Worldview(Base):
    __tablename__ = "worldviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text)
    rules: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    characters: Mapped[list["Character"]] = relationship(secondary="worldview_characters", back_populates="worldviews")  # noqa: F821
    projects: Mapped[list["Project"]] = relationship(back_populates="worldview")  # noqa: F821
