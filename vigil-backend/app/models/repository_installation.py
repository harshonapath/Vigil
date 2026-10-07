from typing import TYPE_CHECKING
import uuid

from sqlalchemy import BigInteger, ForeignKey
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.repository import Repository


class RepositoryInstallation(Base):
    """GitHub App installation binding kept separately from the legacy repository row."""

    __tablename__ = "repository_installations"

    repository_id: Mapped[uuid.UUID] = mapped_column(
        UNIQUEIDENTIFIER, ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True
    )
    github_installation_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    repository: Mapped["Repository"] = relationship("Repository", back_populates="installation")
