"""Add incremental generation fields for breakpoint resume.

Revision ID: 006
Revises: 005
Create Date: 2026-09-14

Adds support for Phase 3.2 "增量生成 + 断点续传":
- content_draft: temporary storage for partial generation results
- generation_status: 'idle' | 'generating' | 'interrupted'
- generation_checkpoint: JSON metadata for resume (last position, token count, etc.)

These allow resuming after user cancel or network interruption without re-generating everything.
Single-process limitation: if backend restarts, in-memory generation state is lost,
but the draft text (if flushed) can still be used as a starting point.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns to chapters table (idempotent guards via IF NOT EXISTS pattern in raw SQL for safety)
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c["name"] for c in inspector.get_columns("chapters")]

    if "content_draft" not in columns:
        op.add_column(
            "chapters",
            sa.Column("content_draft", sa.Text(), nullable=True),
        )

    if "generation_status" not in columns:
        op.add_column(
            "chapters",
            sa.Column("generation_status", sa.String(20), nullable=False, server_default="idle"),
        )
        # Add index for status filtering
        op.create_index("idx_chapters_generation_status", "chapters", ["generation_status"])

    if "generation_checkpoint" not in columns:
        op.add_column(
            "chapters",
            sa.Column("generation_checkpoint", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = [i["name"] for i in inspector.get_indexes("chapters")]
    columns = [c["name"] for c in inspector.get_columns("chapters")]

    if "idx_chapters_generation_status" in indexes:
        op.drop_index("idx_chapters_generation_status", table_name="chapters")

    if "generation_checkpoint" in columns:
        op.drop_column("chapters", "generation_checkpoint")

    if "generation_status" in columns:
        op.drop_column("chapters", "generation_status")

    if "content_draft" in columns:
        op.drop_column("chapters", "content_draft")
