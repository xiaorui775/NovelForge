"""Add search indexes

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "c4d5e6f7a8b9"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pg_trgm extension for trigram-based ILIKE indexes
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # GIN indexes for ILIKE %query% searches
    op.execute("CREATE INDEX IF NOT EXISTS idx_projects_name_gin ON projects USING gin (name gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_projects_description_gin ON projects USING gin (description gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_chapters_content_gin ON chapters USING gin (content gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_characters_name_gin ON characters USING gin (name gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_characters_description_gin ON characters USING gin (description gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_terminology_term_gin ON terminology USING gin (term gin_trgm_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_terminology_description_gin ON terminology USING gin (description gin_trgm_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_projects_name_gin")
    op.execute("DROP INDEX IF EXISTS idx_projects_description_gin")
    op.execute("DROP INDEX IF EXISTS idx_chapters_content_gin")
    op.execute("DROP INDEX IF EXISTS idx_characters_name_gin")
    op.execute("DROP INDEX IF EXISTS idx_characters_description_gin")
    op.execute("DROP INDEX IF EXISTS idx_terminology_term_gin")
    op.execute("DROP INDEX IF EXISTS idx_terminology_description_gin")
