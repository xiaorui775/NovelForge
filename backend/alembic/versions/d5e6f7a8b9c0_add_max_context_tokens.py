"""Add max_context_tokens to model_configs

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "model_configs",
        sa.Column("max_context_tokens", sa.Integer(), nullable=False, server_default="8192"),
    )


def downgrade() -> None:
    op.drop_column("model_configs", "max_context_tokens")
