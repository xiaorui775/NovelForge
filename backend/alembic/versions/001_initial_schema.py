"""initial schema (consolidated)

Revision ID: 001
Revises:
Create Date: 2026-05-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # model_configs
    op.create_table(
        'model_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False, server_default='openai'),
        sa.Column('base_url', sa.String(500), nullable=False),
        sa.Column('api_key_encrypted', sa.Text, nullable=False),
        sa.Column('model_name', sa.String(100), nullable=False),
        sa.Column('model_type', sa.String(20), nullable=False, server_default='chat'),
        sa.Column('input_cost_per_1k', sa.Numeric(10, 6), server_default='0'),
        sa.Column('output_cost_per_1k', sa.Numeric(10, 6), server_default='0'),
        sa.Column('max_tokens', sa.Integer, server_default='4096'),
        sa.Column('max_context_tokens', sa.Integer, server_default='8192'),
        sa.Column('is_active', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # worldviews
    op.create_table(
        'worldviews',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('rules', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # characters
    op.create_table(
        'characters',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('role_type', sa.String(50)),
        sa.Column('description', sa.Text),
        sa.Column('personality', sa.Text),
        sa.Column('background', sa.Text),
        sa.Column('avatar', sa.String(500)),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # worldview_characters
    op.create_table(
        'worldview_characters',
        sa.Column('worldview_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('worldviews.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('character_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('characters.id', ondelete='CASCADE'), primary_key=True),
    )

    # character_relations
    op.create_table(
        'character_relations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('from_character_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('characters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('to_character_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('characters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('relation_type', sa.String(50), nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # projects
    op.create_table(
        'projects',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('genre', sa.String(100)),
        sa.Column('description', sa.Text),
        sa.Column('language', sa.String(20), server_default='zh-CN'),
        sa.Column('target_words_per_chapter_min', sa.Integer, server_default='3000'),
        sa.Column('target_words_per_chapter_max', sa.Integer, server_default='5000'),
        sa.Column('worldview_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('worldviews.id')),
        sa.Column('cover_image', sa.String(500)),
        sa.Column('status', sa.String(20), server_default='draft'),
        sa.Column('style_reference', sa.Text),
        sa.Column('dialogue_ratio', sa.Numeric(3, 2), server_default='0.40'),
        sa.Column('tags', postgresql.JSONB, server_default='[]'),
        sa.Column('deleted_at', sa.DateTime),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # outlines
    op.create_table(
        'outlines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('total_chapters', sa.Integer, nullable=False),
        sa.Column('synopsis', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # chapter_outlines
    op.create_table(
        'chapter_outlines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('outline_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('outlines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chapter_number', sa.Integer, nullable=False),
        sa.Column('title', sa.String(200)),
        sa.Column('summary', sa.Text, nullable=False),
        sa.Column('detail_outline', sa.Text),
        sa.Column('chapter_memo', sa.Text),
        sa.Column('sort_order', sa.Integer, nullable=False),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # prompt_templates
    op.create_table(
        'prompt_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('is_default', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # chapters
    op.create_table(
        'chapters',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('chapter_outline_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chapter_outlines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content', sa.Text),
        sa.Column('word_count', sa.Integer, server_default='0'),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('model_configs.id')),
        sa.Column('token_used', sa.Integer, server_default='0'),
        sa.Column('cost', sa.Numeric(10, 4), server_default='0'),
        sa.Column('content_summary', sa.Text),
        sa.Column('status', sa.String(20), server_default='empty'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # chapter_versions
    op.create_table(
        'chapter_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('chapter_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chapters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version_number', sa.Integer, nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('word_count', sa.Integer, server_default='0'),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('model_configs.id')),
        sa.Column('token_used', sa.Integer, server_default='0'),
        sa.Column('quality_score', sa.Numeric(3, 1)),
        sa.Column('change_type', sa.String(30), nullable=False, server_default='ai_generate'),
        sa.Column('diff_snapshot', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # terminologies
    op.create_table(
        'terminologies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('term', sa.String(100), nullable=False),
        sa.Column('category', sa.String(50)),
        sa.Column('description', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # generation_logs
    op.create_table(
        'generation_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('chapter_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chapters.id', ondelete='CASCADE')),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('model_configs.id')),
        sa.Column('prompt_template_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('prompt_templates.id')),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('error_message', sa.Text),
        sa.Column('token_input', sa.Integer, server_default='0'),
        sa.Column('token_output', sa.Integer, server_default='0'),
        sa.Column('cost', sa.Numeric(10, 4), server_default='0'),
        sa.Column('duration_ms', sa.Integer, server_default='0'),
        sa.Column('quality_score', sa.Numeric(3, 1)),
        sa.Column('retry_count', sa.Integer, server_default='0'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # cost_budgets
    op.create_table(
        'cost_budgets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('monthly_limit', sa.Numeric(10, 2), nullable=False),
        sa.Column('current_usage', sa.Numeric(10, 2), server_default='0'),
        sa.Column('month', sa.String(7), nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # foreshadowings
    op.create_table(
        'foreshadowings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('plant_chapter_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chapter_outlines.id', ondelete='SET NULL')),
        sa.Column('resolution_chapter_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chapter_outlines.id', ondelete='SET NULL')),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('notes', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # chat_messages
    op.create_table(
        'chat_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('model_configs.id', ondelete='SET NULL')),
        sa.Column('token_used', sa.Integer, server_default='0'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # cover_images
    op.create_table(
        'cover_images',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('image_url', sa.Text, nullable=False),
        sa.Column('prompt', sa.Text, nullable=False),
        sa.Column('revised_prompt', sa.Text),
        sa.Column('model_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('model_configs.id', ondelete='SET NULL')),
        sa.Column('style', sa.String(50)),
        sa.Column('is_selected', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # project_notes
    op.create_table(
        'project_notes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('content', sa.Text, nullable=False, server_default=''),
        sa.Column('category', sa.String(50), nullable=False, server_default='general'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # character_appearances
    op.create_table(
        'character_appearances',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('character_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('characters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('chapter_outline_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chapter_outlines.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role_in_chapter', sa.String(50), nullable=False, server_default='minor'),
        sa.Column('notes', sa.Text, nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # story_bible
    op.create_table(
        'story_bible',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category', sa.String(50), nullable=False, server_default='custom'),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('content', sa.Text, nullable=False, server_default=''),
        sa.Column('tags', sa.Text, server_default=''),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # writing_goals
    op.create_table(
        'writing_goals',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(30), nullable=False, server_default='daily_words'),
        sa.Column('target', sa.Integer, nullable=False, server_default='0'),
        sa.Column('start_date', sa.Date, nullable=False),
        sa.Column('end_date', sa.Date, nullable=False),
        sa.Column('notes', sa.Text, nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # scenes
    op.create_table(
        'scenes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('chapter_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chapters.id', ondelete='CASCADE'), nullable=False),
        sa.Column('scene_number', sa.Integer, nullable=False),
        sa.Column('location', sa.String(200), nullable=False, server_default=''),
        sa.Column('time', sa.String(200), nullable=False, server_default=''),
        sa.Column('pov_character_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('characters.id')),
        sa.Column('summary', sa.Text, nullable=False, server_default=''),
        sa.Column('mood', sa.String(100), nullable=False, server_default=''),
        sa.Column('notes', sa.Text, nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # story_templates
    op.create_table(
        'story_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('structure', postgresql.JSONB, nullable=False),
        sa.Column('genre_hint', sa.String(100), nullable=False, server_default=''),
        sa.Column('is_builtin', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # Indexes
    op.create_index('idx_chapters_outline', 'chapters', ['chapter_outline_id'])
    op.create_index('idx_chapter_outlines_outline', 'chapter_outlines', ['outline_id'])
    op.create_index('idx_chapter_versions_chapter', 'chapter_versions', ['chapter_id'])
    op.create_index('idx_generation_logs_chapter', 'generation_logs', ['chapter_id'])
    op.create_index('idx_generation_logs_created', 'generation_logs', ['created_at'])
    op.create_index('idx_projects_status', 'projects', ['status'])


def downgrade() -> None:
    pass
