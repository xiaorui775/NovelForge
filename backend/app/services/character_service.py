from typing import Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.character import Character, CharacterRelation
from app.schemas.character import CharacterCreate, CharacterRelationCreate, CharacterUpdate


class CharacterService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_characters(self) -> list[Character]:
        result = await self.db.execute(select(Character).order_by(Character.name))
        return list(result.scalars().all())

    async def get_character(self, character_id: uuid.UUID) -> Optional[Character]:
        result = await self.db.execute(
            select(Character)
            .where(Character.id == character_id)
            .options(selectinload(Character.worldviews))
        )
        return result.scalar_one_or_none()

    async def create_character(self, data: CharacterCreate) -> Character:
        character = Character(**data.model_dump())
        self.db.add(character)
        await self.db.flush()
        await self.db.refresh(character)
        return character

    async def update_character(self, character_id: uuid.UUID, data: CharacterUpdate) -> Optional[Character]:
        character = await self.get_character(character_id)
        if not character:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(character, field, value)
        await self.db.flush()
        await self.db.refresh(character)
        return character

    async def delete_character(self, character_id: uuid.UUID) -> bool:
        character = await self.get_character(character_id)
        if not character:
            return False
        # Delete associated relations first (ORM doesn't cascade through relationships by default)
        relations = await self.list_relations(character_id)
        for rel in relations:
            await self.db.delete(rel)
        # Remove from worldviews
        for wv in character.worldviews:
            wv.characters.remove(character)
        await self.db.delete(character)
        await self.db.flush()
        return True

    # Relations
    async def list_all_relations(self) -> list[CharacterRelation]:
        result = await self.db.execute(select(CharacterRelation))
        return list(result.scalars().all())

    async def list_relations(self, character_id: uuid.UUID) -> list[CharacterRelation]:
        result = await self.db.execute(
            select(CharacterRelation).where(
                (CharacterRelation.from_character_id == character_id)
                | (CharacterRelation.to_character_id == character_id)
            )
        )
        return list(result.scalars().all())

    async def create_relation(self, data: CharacterRelationCreate) -> CharacterRelation:
        relation = CharacterRelation(**data.model_dump())
        self.db.add(relation)
        await self.db.flush()
        await self.db.refresh(relation)
        return relation

    async def delete_relation(self, relation_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(CharacterRelation).where(CharacterRelation.id == relation_id)
        )
        relation = result.scalar_one_or_none()
        if not relation:
            return False
        await self.db.delete(relation)
        return True
