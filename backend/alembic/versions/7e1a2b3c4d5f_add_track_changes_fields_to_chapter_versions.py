"""add track changes fields to chapter_versions

Revision ID: 7e1a2b3c4d5f
Revises: 5ab525d48d16
Create Date: 2026-05-02 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7e1a2b3c4d5f'
down_revision: Union[str, None] = '5ab525d48d16'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('chapter_versions', sa.Column('change_type', sa.String(length=30), nullable=False, server_default='ai_generate'))
    op.add_column('chapter_versions', sa.Column('diff_snapshot', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('chapter_versions', 'diff_snapshot')
    op.drop_column('chapter_versions', 'change_type')
