"""Add durable, auditable Security Assumptions domain.

Revision ID: 20261006secass
Revises: dad717408364
Create Date: 2026-10-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mssql

revision: str = "20261006secass"
down_revision: Union[str, Sequence[str], None] = "dad717408364"
branch_labels = None
depends_on = None
UUID = mssql.UNIQUEIDENTIFIER()


def upgrade() -> None:
    op.create_table(
        "repository_installations",
        sa.Column("repository_id", UUID, sa.ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("github_installation_id", sa.BigInteger(), nullable=False),
    )
    op.create_index("ix_repository_installations_github_installation_id", "repository_installations", ["github_installation_id"])
    op.create_table(
        "security_assumptions",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("repository_id", UUID, sa.ForeignKey("repositories.id"), nullable=False),
        sa.Column("identity_key", sa.String(64), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("subject", sa.String(512), nullable=False),
        sa.Column("security_property", sa.String(512), nullable=False),
        sa.Column("scope", sa.String(512), nullable=False),
        sa.Column("current_status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("repository_id", "identity_key", name="uq_security_assumptions_identity"),
    )
    op.create_index("ix_security_assumptions_repository_category", "security_assumptions", ["repository_id", "category"])
    op.create_table(
        "security_assumption_versions",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("assumption_id", UUID, sa.ForeignKey("security_assumptions.id"), nullable=False),
        sa.Column("analysis_id", UUID, sa.ForeignKey("analyses.id"), nullable=False),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("scope", sa.String(512), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("potential_impact", sa.Text(), nullable=False),
        sa.Column("head_sha", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("assumption_id", "analysis_id", name="uq_assumption_versions_analysis"),
    )
    op.create_index("ix_assumption_versions_analysis", "security_assumption_versions", ["analysis_id"])
    op.create_table(
        "security_assumption_evidence",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("version_id", UUID, sa.ForeignKey("security_assumption_versions.id"), nullable=False),
        sa.Column("path", sa.String(1024), nullable=False),
        sa.Column("symbol", sa.String(512), nullable=True),
        sa.Column("start_line", sa.Integer(), nullable=False),
        sa.Column("end_line", sa.Integer(), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("evidence_type", sa.String(32), nullable=False),
        sa.Column("commit_sha", sa.String(40), nullable=False),
        sa.Column("validation_status", sa.String(32), nullable=False),
    )
    op.create_index("ix_assumption_evidence_version", "security_assumption_evidence", ["version_id"])
    op.create_table(
        "security_assumption_changes",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("repository_id", UUID, sa.ForeignKey("repositories.id"), nullable=False),
        sa.Column("analysis_id", UUID, sa.ForeignKey("analyses.id"), nullable=False),
        sa.Column("assumption_id", UUID, sa.ForeignKey("security_assumptions.id"), nullable=True),
        sa.Column("prior_version_id", UUID, sa.ForeignKey("security_assumption_versions.id"), nullable=True),
        sa.Column("new_version_id", UUID, sa.ForeignKey("security_assumption_versions.id"), nullable=True),
        sa.Column("classification", sa.String(40), nullable=False),
        sa.Column("impact_summary", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_assumption_changes_idempotency"),
    )
    op.create_index("ix_assumption_changes_analysis", "security_assumption_changes", ["analysis_id"])
    op.create_index("ix_assumption_changes_repository_classification", "security_assumption_changes", ["repository_id", "classification"])
    op.create_table(
        "security_assumption_decisions",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("change_id", UUID, sa.ForeignKey("security_assumption_changes.id"), nullable=False),
        sa.Column("reviewer_login", sa.String(255), nullable=False),
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("expected_version", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_assumption_decisions_idempotency"),
        sa.UniqueConstraint("change_id", "expected_version", name="uq_assumption_decisions_change_version"),
    )
    op.create_index("ix_assumption_decisions_change", "security_assumption_decisions", ["change_id"])
    op.create_table(
        "security_assumption_runs",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("analysis_id", UUID, sa.ForeignKey("analyses.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("context_file_count", sa.Integer(), nullable=False),
        sa.Column("context_char_count", sa.Integer(), nullable=False),
        sa.Column("candidate_count", sa.Integer(), nullable=False),
        sa.Column("validated_candidate_count", sa.Integer(), nullable=False),
        sa.Column("rejected_candidate_count", sa.Integer(), nullable=False),
        sa.Column("validated_evidence_count", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(64), nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("fallback_used", sa.Boolean(), nullable=False),
        sa.Column("failure_code", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("analysis_id", name="uq_assumption_runs_analysis"),
    )


def downgrade() -> None:
    op.drop_table("security_assumption_runs")
    op.drop_index("ix_assumption_decisions_change", table_name="security_assumption_decisions")
    op.drop_table("security_assumption_decisions")
    op.drop_index("ix_assumption_changes_repository_classification", table_name="security_assumption_changes")
    op.drop_index("ix_assumption_changes_analysis", table_name="security_assumption_changes")
    op.drop_table("security_assumption_changes")
    op.drop_index("ix_assumption_evidence_version", table_name="security_assumption_evidence")
    op.drop_table("security_assumption_evidence")
    op.drop_index("ix_assumption_versions_analysis", table_name="security_assumption_versions")
    op.drop_table("security_assumption_versions")
    op.drop_index("ix_security_assumptions_repository_category", table_name="security_assumptions")
    op.drop_table("security_assumptions")
    op.drop_index("ix_repository_installations_github_installation_id", table_name="repository_installations")
    op.drop_table("repository_installations")
