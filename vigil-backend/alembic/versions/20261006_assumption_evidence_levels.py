"""Persist conservative evidence and blast-radius assessment fields.

Revision ID: 20261006evidence
Revises: 20261006secass
Create Date: 2026-10-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261006evidence"
down_revision: Union[str, Sequence[str], None] = "20261006secass"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "security_assumption_versions",
        sa.Column("evidence_strength", sa.String(2), nullable=False, server_default="E1"),
    )
    op.add_column(
        "security_assumption_changes",
        sa.Column("risk_level", sa.String(24), nullable=False, server_default="UNASSESSED"),
    )
    op.add_column(
        "security_assumption_changes",
        sa.Column("blast_radius_status", sa.String(32), nullable=False, server_default="INSUFFICIENT_EVIDENCE"),
    )
    op.add_column(
        "security_assumption_changes",
        sa.Column("blast_radius_items", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column("security_assumption_runs", sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("security_assumption_runs", sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("security_assumption_runs", sa.Column("token_usage", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("security_assumption_runs", "token_usage")
    op.drop_column("security_assumption_runs", "retry_count")
    op.drop_column("security_assumption_runs", "latency_ms")
    op.drop_column("security_assumption_changes", "blast_radius_items")
    op.drop_column("security_assumption_changes", "blast_radius_status")
    op.drop_column("security_assumption_changes", "risk_level")
    op.drop_column("security_assumption_versions", "evidence_strength")
