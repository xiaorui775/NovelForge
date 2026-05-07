"""add cascade to chapter-related fks

Revision ID: a3f1b2c4d5e6
Revises: 91a2969398fc
Create Date: 2026-05-02
"""
from alembic import op

revision = "a3f1b2c4d5e6"
down_revision = "91a2969398fc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # chapters.chapter_outline_id -> chapter_outlines.id (add CASCADE)
    op.drop_constraint("chapters_chapter_outline_id_fkey", "chapters", type_="foreignkey")
    op.create_foreign_key(
        "chapters_chapter_outline_id_fkey",
        "chapters",
        "chapter_outlines",
        ["chapter_outline_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # generation_logs.chapter_id -> chapters.id (add CASCADE)
    op.drop_constraint("generation_logs_chapter_id_fkey", "generation_logs", type_="foreignkey")
    op.create_foreign_key(
        "generation_logs_chapter_id_fkey",
        "generation_logs",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("generation_logs_chapter_id_fkey", "generation_logs", type_="foreignkey")
    op.create_foreign_key(
        "generation_logs_chapter_id_fkey",
        "generation_logs",
        "chapters",
        ["chapter_id"],
        ["id"],
    )

    op.drop_constraint("chapters_chapter_outline_id_fkey", "chapters", type_="foreignkey")
    op.create_foreign_key(
        "chapters_chapter_outline_id_fkey",
        "chapters",
        "chapter_outlines",
        ["chapter_outline_id"],
        ["id"],
    )
