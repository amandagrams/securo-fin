import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AccountCard(Base):
    """A card seen on an account's transactions and the name the user gave it.

    Keyed by (account_id, card_number): the same plastic cannot carry two
    names, and the PUT that writes it is an upsert. It is not an account —
    no balance, no limit. The card_number is the full string Pluggy sent in
    `creditCardMetadata.cardNumber` (never truncated: truncating would merge
    two different cards into one bucket), stored as text so `0597` keeps its
    leading zero.
    """

    __tablename__ = "account_cards"
    __table_args__ = (
        UniqueConstraint(
            "account_id", "card_number", name="uq_account_cards_account_card_number"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    card_number: Mapped[str] = mapped_column(String(19), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
