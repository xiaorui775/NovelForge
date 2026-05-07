from typing import Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generation import PromptTemplate
from app.schemas.prompt_template import PromptTemplateCreate, PromptTemplateUpdate


class PromptTemplateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_templates(self, template_type: Optional[str] = None) -> list[PromptTemplate]:
        stmt = select(PromptTemplate).order_by(PromptTemplate.is_default.desc(), PromptTemplate.name)
        if template_type:
            stmt = stmt.where(PromptTemplate.type == template_type)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_template(self, template_id: uuid.UUID) -> Optional[PromptTemplate]:
        result = await self.db.execute(select(PromptTemplate).where(PromptTemplate.id == template_id))
        return result.scalar_one_or_none()

    async def get_default_template(self, template_type: str) -> Optional[PromptTemplate]:
        result = await self.db.execute(
            select(PromptTemplate).where(
                PromptTemplate.type == template_type,
                PromptTemplate.is_default == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def create_template(self, data: PromptTemplateCreate) -> PromptTemplate:
        template = PromptTemplate(**data.model_dump())
        if template.is_default:
            await self._clear_defaults(template.type)
        self.db.add(template)
        await self.db.flush()
        await self.db.refresh(template)
        return template

    async def update_template(self, template_id: uuid.UUID, data: PromptTemplateUpdate) -> Optional[PromptTemplate]:
        template = await self.get_template(template_id)
        if not template:
            return None

        update_data = data.model_dump(exclude_unset=True)

        if update_data.get("is_default"):
            t_type = update_data.get("type", template.type)
            await self._clear_defaults(t_type)

        for field, value in update_data.items():
            setattr(template, field, value)

        await self.db.flush()
        await self.db.refresh(template)
        return template

    async def delete_template(self, template_id: uuid.UUID) -> bool:
        template = await self.get_template(template_id)
        if not template:
            return False
        await self.db.delete(template)
        return True

    async def set_default(self, template_id: uuid.UUID) -> Optional[PromptTemplate]:
        template = await self.get_template(template_id)
        if not template:
            return None
        await self._clear_defaults(template.type)
        template.is_default = True
        await self.db.flush()
        await self.db.refresh(template)
        return template

    async def _clear_defaults(self, template_type: str) -> None:
        result = await self.db.execute(
            select(PromptTemplate).where(
                PromptTemplate.type == template_type,
                PromptTemplate.is_default == True,  # noqa: E712
            )
        )
        for t in result.scalars().all():
            t.is_default = False
