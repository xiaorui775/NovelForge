"""add series and later schema drift columns

Revision ID: 004
Revises: 003
Create Date: 2026-07-16

Brings the database in line with the ORM models added after migration 003
(series management, chapter summaries, chat context fields, story bible
verification pointer) and re-asserts the pg_trgm setup.

SAFE FOR ALREADY-RUNNING DATABASES:
- Every DDL step is idempotent (guarded by ``IF NOT EXISTS`` / existence checks).
  Migration 002 ("consolidated incremental + series schema changes") declares
  the same series/chapter_summaries tables and the same projects/chat_messages/
  story_bible columns. Some deployments exist where migration 002 was stamped
  (or partially applied) without creating those objects; in others 002 ran
  cleanly. Either way, 004 must not error when an object already exists.
- No existing data is dropped or rewritten. ``sort_order_in_series`` is added
  ``NOT NULL DEFAULT 1`` so existing rows backfill safely.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, name: str) -> bool:
    inspector = sa.inspect(bind)
    return name in inspector.get_table_names()


def _has_column(bind, table: str, column: str) -> bool:
    inspector = sa.inspect(bind)
    return column in [c["name"] for c in inspector.get_columns(table)]


def _has_fk(bind, table: str, fk_name: str) -> bool:
    inspector = sa.inspect(bind)
    return fk_name in [fk["name"] for fk in inspector.get_foreign_keys(table) if fk.get("name")]


def _has_index(bind, table: str, index: str) -> bool:
    inspector = sa.inspect(bind)
    return index in [i["name"] for i in inspector.get_indexes(table)]


def upgrade() -> None:
    bind = op.get_bind()

    # --- pg_trgm (re-assert; migration 003's CREATE EXTENSION has been observed
    # to not land on a freshly-provisioned container DB, leaving /api/search
    # broken with "operator does not exist: text % character varying").
    # Idempotent in both directions. ---
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_chapters_content_trgm "
        "ON chapters USING gin (content gin_trgm_ops)"
    )

    # --- series table ---
    if not _has_table(bind, "series"):
        op.create_table(
            "series",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    # --- chapter_summaries table ---
    if not _has_table(bind, "chapter_summaries"):
        op.create_table(
            "chapter_summaries",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("chapter_id", sa.UUID(), nullable=False),
            sa.Column("events", sa.Text(), nullable=True),
            sa.Column("character_states", sa.Text(), nullable=True),
            sa.Column("unresolved_hooks", sa.Text(), nullable=True),
            sa.Column("resolved_hooks", sa.Text(), nullable=True),
            sa.Column("timeline", sa.Text(), nullable=True),
            sa.Column("locations", sa.Text(), nullable=True),
            sa.Column("narrative_threads", sa.Text(), nullable=True),
            sa.Column("word_count_at_summary", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_stale", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("generated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _has_index(bind, "chapter_summaries", "ix_chapter_summaries_chapter_id"):
        op.create_index(
            op.f("ix_chapter_summaries_chapter_id"),
            "chapter_summaries",
            ["chapter_id"],
            unique=True,
        )

    # --- projects.series linkage (series_id nullable -> safe on existing rows;
    #     sort_order_in_series NOT NULL DEFAULT 1 -> backfills existing rows) ---
    if not _has_column(bind, "projects", "series_id"):
        op.add_column("projects", sa.Column("series_id", sa.UUID(), nullable=True))
    if not _has_column(bind, "projects", "sort_order_in_series"):
        op.add_column(
            "projects",
            sa.Column("sort_order_in_series", sa.Integer(), nullable=False, server_default="1"),
        )
    if not _has_fk(bind, "projects", "fk_projects_series_id"):
        op.create_foreign_key(
            "fk_projects_series_id",
            "projects",
            "series",
            ["series_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # --- chat_messages context fields (all nullable -> safe) ---
    if not _has_column(bind, "chat_messages", "referenced_chapter_id"):
        op.add_column("chat_messages", sa.Column("referenced_chapter_id", sa.UUID(), nullable=True))
    if not _has_column(bind, "chat_messages", "referenced_text"):
        op.add_column("chat_messages", sa.Column("referenced_text", sa.Text(), nullable=True))
    if not _has_column(bind, "chat_messages", "context_mode"):
        op.add_column("chat_messages", sa.Column("context_mode", sa.String(length=20), nullable=True))
    if not _has_column(bind, "chat_messages", "suggested_action"):
        op.add_column("chat_messages", sa.Column("suggested_action", sa.Text(), nullable=True))

    # --- story_bible verification pointer (nullable -> safe) ---
    if not _has_column(bind, "story_bible", "last_verified_chapter_id"):
        op.add_column("story_bible", sa.Column("last_verified_chapter_id", sa.UUID(), nullable=True))
    if not _has_fk(bind, "story_bible", "fk_story_bible_last_verified_chapter_id"):
        op.create_foreign_key(
            "fk_story_bible_last_verified_chapter_id",
            "story_bible",
            "chapters",
            ["last_verified_chapter_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()

    if _has_fk(bind, "story_bible", "fk_story_bible_last_verified_chapter_id"):
        op.drop_constraint("fk_story_bible_last_verified_chapter_id", "story_bible", type_="foreignkey")
    if _has_column(bind, "story_bible", "last_verified_chapter_id"):
        op.drop_column("story_bible", "last_verified_chapter_id")

    if _has_column(bind, "chat_messages", "suggested_action"):
        op.drop_column("chat_messages", "suggested_action")
    if _has_column(bind, "chat_messages", "context_mode"):
        op.drop_column("chat_messages", "context_mode")
    if _has_column(bind, "chat_messages", "referenced_text"):
        op.drop_column("chat_messages", "referenced_text")
    if _has_column(bind, "chat_messages", "referenced_chapter_id"):
        op.drop_column("chat_messages", "referenced_chapter_id")

    if _has_fk(bind, "projects", "fk_projects_series_id"):
        op.drop_constraint("fk_projects_series_id", "projects", type_="foreignkey")
    if _has_column(bind, "projects", "sort_order_in_series"):
        op.drop_column("projects", "sort_order_in_series")
    if _has_column(bind, "projects", "series_id"):
        op.drop_column("projects", "series_id")

    if _has_index(bind, "chapter_summaries", "ix_chapter_summaries_chapter_id"):
        op.drop_index(op.f("ix_chapter_summaries_chapter_id"), table_name="chapter_summaries")
    if _has_table(bind, "chapter_summaries"):
        op.drop_table("chapter_summaries")
    if _has_table(bind, "series"):
        op.drop_table("series")

    # Note: pg_trgm is intentionally NOT removed on downgrade — migration 003
    # owns that extension and may still be the active head for some deployments.
