"""pg_trgm 全文检索支持

Revision ID: 003
Revises: 002
"""
from alembic import op

revision = "003"
down_revision = "002"


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_chapters_content_trgm "
        "ON chapters USING gin (content gin_trgm_ops)"
    )


def downgrade():
    op.drop_index("idx_chapters_content_trgm")
