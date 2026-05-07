"""add chapter_memo to chapter_outlines

Revision ID: f6a7b8c9d0e1
Revises: d5e6f7a8b9c0
Create Date: 2026-05-02 15:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "f6a7b8c9d0e1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chapter_outlines",
        sa.Column("chapter_memo", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chapter_outlines", "chapter_memo")
