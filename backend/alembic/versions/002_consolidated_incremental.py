"""consolidated incremental + series schema changes

Revision ID: 002
Revises: 001
Create Date: 2026-05-23

Merges the following migrations into one:
- chapter_summaries table
- chat_messages reference fields (referenced_chapter_id, referenced_text, context_mode)
- story_bible last_verified_chapter_id + foreign key
- chat_messages suggested_action
- series table and project series fields
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. chapter_summaries table
    op.create_table(
        'chapter_summaries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('chapter_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chapters.id', ondelete='CASCADE'), unique=True, nullable=False, index=True),
        sa.Column('events', sa.Text(), nullable=True),
        sa.Column('character_states', sa.Text(), nullable=True),
        sa.Column('unresolved_hooks', sa.Text(), nullable=True),
        sa.Column('resolved_hooks', sa.Text(), nullable=True),
        sa.Column('timeline', sa.Text(), nullable=True),
        sa.Column('locations', sa.Text(), nullable=True),
        sa.Column('narrative_threads', sa.Text(), nullable=True),
        sa.Column('word_count_at_summary', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_stale', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('generated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # 2. chat_messages reference fields
    op.add_column('chat_messages', sa.Column('referenced_chapter_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('chat_messages', sa.Column('referenced_text', sa.Text(), nullable=True))
    op.add_column('chat_messages', sa.Column('context_mode', sa.String(20), nullable=True))

    # 3. story_bible last_verified_chapter_id
    op.add_column('story_bible', sa.Column('last_verified_chapter_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_story_bible_last_verified_chapter',
        'story_bible', 'chapters',
        ['last_verified_chapter_id'], ['id'],
        ondelete='SET NULL',
    )

    # 4. chat_messages suggested_action
    op.add_column('chat_messages', sa.Column('suggested_action', sa.Text(), nullable=True))

    # 5. series table and project series fields
    op.create_table(
        'series',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.add_column('projects', sa.Column('series_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('projects', sa.Column('sort_order_in_series', sa.Integer(), server_default='1', nullable=False))
    op.create_foreign_key(
        'fk_projects_series_id', 'projects', 'series',
        ['series_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_projects_series_id', 'projects', ['series_id'])


def downgrade() -> None:
    # 5
    op.drop_index('ix_projects_series_id', 'projects')
    op.drop_constraint('fk_projects_series_id', 'projects', type_='foreignkey')
    op.drop_column('projects', 'sort_order_in_series')
    op.drop_column('projects', 'series_id')
    op.drop_table('series')

    # 4
    op.drop_column('chat_messages', 'suggested_action')

    # 3
    op.drop_constraint('fk_story_bible_last_verified_chapter', 'story_bible', type_='foreignkey')
    op.drop_column('story_bible', 'last_verified_chapter_id')

    # 2
    op.drop_column('chat_messages', 'context_mode')
    op.drop_column('chat_messages', 'referenced_text')
    op.drop_column('chat_messages', 'referenced_chapter_id')

    # 1
    op.drop_table('chapter_summaries')
