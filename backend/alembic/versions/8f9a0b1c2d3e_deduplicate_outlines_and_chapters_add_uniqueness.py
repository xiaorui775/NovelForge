"""deduplicate outlines and chapters, add uniqueness constraints

Revision ID: 8f9a0b1c2d3e
Revises: 7e1a2b3c4d5f
Create Date: 2026-05-03 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '8f9a0b1c2d3e'
down_revision: Union[str, None] = '7e1a2b3c4d5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep newest outline per project, remove others (cascades chapter_outlines -> chapters)
    op.execute("""
        WITH ranked AS (
            SELECT id, project_id,
                   ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY updated_at DESC, created_at DESC, id DESC) AS rn
            FROM outlines
        )
        DELETE FROM outlines o
        USING ranked r
        WHERE o.id = r.id AND r.rn > 1;
    """)

    # Keep newest chapter per chapter_outline, remove others
    op.execute("""
        WITH ranked AS (
            SELECT id, chapter_outline_id,
                   ROW_NUMBER() OVER (PARTITION BY chapter_outline_id ORDER BY updated_at DESC, created_at DESC, id DESC) AS rn
            FROM chapters
        )
        DELETE FROM chapters c
        USING ranked r
        WHERE c.id = r.id AND r.rn > 1;
    """)

    # Enforce uniqueness going forward
    op.create_unique_constraint(
        'uq_outlines_project_id',
        'outlines',
        ['project_id'],
    )
    op.create_unique_constraint(
        'uq_chapters_chapter_outline_id',
        'chapters',
        ['chapter_outline_id'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_chapters_chapter_outline_id', 'chapters', type_='unique')
    op.drop_constraint('uq_outlines_project_id', 'outlines', type_='unique')
