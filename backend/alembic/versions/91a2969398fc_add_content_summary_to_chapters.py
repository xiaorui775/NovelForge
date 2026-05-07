"""add content_summary to chapters

Revision ID: 91a2969398fc
Revises: 001
Create Date: 2026-05-02 10:01:06.831560

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '91a2969398fc'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('chapters', sa.Column('content_summary', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('chapters', 'content_summary')
