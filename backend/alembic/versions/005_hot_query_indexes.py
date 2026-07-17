"""hot-query composite/FK indexes

Revision ID: 005
Revises: 004
Create Date: 2026-07-17

Adds the composite and FK indexes that the hottest read paths scan on but
that were never created (the ORM models did not declare ``index=True`` on
these columns and migration 001 only hand-built a handful). All steps are
idempotent (``CREATE INDEX IF NOT EXISTS`` + ``_has_index`` guards) so the
migration is safe on a DB that already applied an earlier partial version.

Highest-value index: ``chapter_outlines(outline_id, chapter_number)`` — nearly
every chapter-ordering query (consistency, post-write, pacing, foreshadowing,
chat context, chapter listing) sorts by chapter_number within an outline;
without this index Postgres does a per-query sort.

No data is rewritten; all indexes are additive.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_index(bind, table: str, index: str) -> bool:
    inspector = sa.inspect(bind)
    return index in [i["name"] for i in inspector.get_indexes(table)]


# (index_name, table, columns, **extra_kwargs_for_create_index)
def _indexes():
    return [
        # chapter ordering within an outline — single highest-value missing index
        ("idx_chapter_outlines_outline_number", "chapter_outlines", ["outline_id", "chapter_number"], {}),
        # chapter lookup by outline + recency (get_chapter_by_outline)
        ("idx_chapters_outline_updated", "chapters", ["chapter_outline_id", "updated_at"], {}),
        # chapters.status filtered in pacing / foreshadowing scan / list paths
        ("idx_chapters_status", "chapters", ["status"], {}),
        # preview / version lookups (get_latest_preview, version list + count)
        ("idx_chapter_versions_chapter_type_created", "chapter_versions", ["chapter_id", "change_type", "created_at"], {}),
        ("idx_chapter_versions_chapter_created", "chapter_versions", ["chapter_id", "created_at"], {}),
        # chat history ordering (get_history)
        ("idx_chat_messages_project_created", "chat_messages", ["project_id", "created_at"], {}),
        # foreshadowing open/resolved filtering + FK joins (selectinload plant_chapter)
        ("idx_foreshadowings_project_status", "foreshadowings", ["project_id", "status"], {}),
        ("idx_foreshadowings_plant_chapter", "foreshadowings", ["plant_chapter_id"], {}),
        ("idx_foreshadowings_resolution_chapter", "foreshadowings", ["resolution_chapter_id"], {}),
        # FK columns never indexed by 001 but heavily filtered on.
        # (table names are the ORM __tablename__ — note: singular 'story_bible',
        # plural 'terminologies', 'project_notes'.)
        ("idx_terminologies_project", "terminologies", ["project_id"], {}),
        ("idx_project_notes_project", "project_notes", ["project_id"], {}),
        ("idx_scenes_chapter", "scenes", ["chapter_id"], {}),
        ("idx_story_bible_project", "story_bible", ["project_id"], {}),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    for name, table, columns, extra in _indexes():
        if not _has_index(bind, table, name):
            op.create_index(name, table, columns, **extra)


def downgrade() -> None:
    bind = op.get_bind()
    for name, table, _columns, _extra in reversed(_indexes()):
        if _has_index(bind, table, name):
            op.drop_index(name, table_name=table)
