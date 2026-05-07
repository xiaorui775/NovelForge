"""add missing tables

Revision ID: b2c3d4e5f6a7
Revises: effa1beec658
Create Date: 2026-05-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'effa1beec658'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # project_notes
    op.create_table(
        'project_notes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('content', sa.Text(), server_default=''),
        sa.Column('category', sa.String(50), server_default='general'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # foreshadowings (if not exists)
    op.create_table(
        'foreshadowings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('chapter_introduced', sa.Integer()),
        sa.Column('chapter_resolved', sa.Integer()),
        sa.Column('status', sa.String(20), server_default='open'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # chat_messages (if not exists)
    op.create_table(
        'chat_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('model_configs.id'), nullable=True),
        sa.Column('token_used', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # cover_images (if not exists)
    op.create_table(
        'cover_images',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('revised_prompt', sa.Text()),
        sa.Column('image_url', sa.String(500), nullable=False),
        sa.Column('is_selected', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # story_templates (if not exists)
    op.create_table(
        'story_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('structure', postgresql.JSONB(), nullable=False),
        sa.Column('genre_hint', sa.String(100), nullable=False),
        sa.Column('is_builtin', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    # scenes (if not exists)
    op.create_table(
        'scenes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('chapter_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chapters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('scene_number', sa.Integer(), nullable=False),
        sa.Column('location', sa.String(200), nullable=False),
        sa.Column('time', sa.String(200), nullable=False),
        sa.Column('pov_character_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('characters.id'), nullable=True),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('mood', sa.String(100), nullable=False),
        sa.Column('notes', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('scenes')
    op.drop_table('story_templates')
    op.drop_table('cover_images')
    op.drop_table('chat_messages')
    op.drop_table('foreshadowings')
    op.drop_table('project_notes')
