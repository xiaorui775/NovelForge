from typing import Optional
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))
    role_type: Mapped[Optional[str]] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(Text)
    personality: Mapped[Optional[str]] = mapped_column(Text)
    background: Mapped[Optional[str]] = mapped_column(Text)
    avatar: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    relations_from: Mapped[list["CharacterRelation"]] = relationship(
        back_populates="from_character",
        foreign_keys="CharacterRelation.from_character_id",
    )
    relations_to: Mapped[list["CharacterRelation"]] = relationship(
        back_populates="to_character",
        foreign_keys="CharacterRelation.to_character_id",
    )
    worldviews: Mapped[list["Worldview"]] = relationship(  # noqa: F821
        secondary="worldview_characters", back_populates="characters"
    )


class CharacterRelation(Base):
    __tablename__ = "character_relations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_character_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("characters.id", ondelete="CASCADE")
    )
    to_character_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("characters.id", ondelete="CASCADE")
    )
    relation_type: Mapped[str] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    from_character: Mapped["Character"] = relationship(foreign_keys=[from_character_id], back_populates="relations_from")  # noqa: F821
    to_character: Mapped["Character"] = relationship(foreign_keys=[to_character_id], back_populates="relations_to")  # noqa: F821
