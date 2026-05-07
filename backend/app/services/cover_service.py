import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.adapter_factory import AdapterFactory
from app.models.cover_image import CoverImage
from app.models.model_config import ModelConfig
from app.models.project import Project
from app.schemas.cover_image import CoverImageGenerate


class CoverService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_cover(self, project_id: uuid.UUID, data: CoverImageGenerate) -> CoverImage:
        # Verify project exists
        project = await self.db.get(Project, project_id)
        if not project:
            raise ValueError("项目不存在")

        # Get model config
        model = await self.db.get(ModelConfig, data.model_id)
        if not model:
            raise ValueError("模型配置不存在")

        # Generate image
        adapter = AdapterFactory.create_image_adapter(model)
        result = await adapter.generate_image(
            prompt=data.prompt,
            size=data.size,
            quality=data.quality,
            style=data.style,
        )

        # Create record
        cover = CoverImage(
            project_id=project_id,
            image_url=result["url"],
            prompt=data.prompt,
            revised_prompt=result.get("revised_prompt"),
            model_id=data.model_id,
            style=data.style,
            is_selected=False,
        )
        self.db.add(cover)
        await self.db.commit()
        await self.db.refresh(cover)
        return cover

    async def list_covers(self, project_id: uuid.UUID) -> list[CoverImage]:
        result = await self.db.execute(
            select(CoverImage)
            .where(CoverImage.project_id == project_id)
            .order_by(CoverImage.created_at.desc())
        )
        return list(result.scalars().all())

    async def select_cover(self, project_id: uuid.UUID, cover_id: uuid.UUID) -> CoverImage:
        cover = await self.db.get(CoverImage, cover_id)
        if not cover or cover.project_id != project_id:
            raise ValueError("封面不存在")

        # Deselect all other covers
        all_covers = await self.list_covers(project_id)
        for c in all_covers:
            c.is_selected = False

        cover.is_selected = True

        # Update project cover_image
        project = await self.db.get(Project, project_id)
        if project:
            project.cover_image = cover.image_url

        await self.db.commit()
        await self.db.refresh(cover)
        return cover

    async def delete_cover(self, project_id: uuid.UUID, cover_id: uuid.UUID) -> None:
        cover = await self.db.get(CoverImage, cover_id)
        if not cover or cover.project_id != project_id:
            raise ValueError("封面不存在")
        await self.db.delete(cover)
        await self.db.commit()
