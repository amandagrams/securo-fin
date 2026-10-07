"""account_cards: a name for each card seen on a credit-card account

A purchase made by an additional or virtual card arrives from Pluggy with
`creditCardMetadata.cardNumber`, which the sync already stores inside
`transactions.raw_data`. The digits alone don't say whose card it is, so
the user can give each `(account_id, card_number)` a name.

Born empty — no name exists today, so there is nothing to migrate, and the
unique constraint never races against pre-existing rows. `card_number` is
text (never an integer: `0597` keeps its leading zero) and never truncated,
because truncating would merge two different cards into one bucket.

Rows follow the account: ON DELETE CASCADE on `account_id` (and on
`workspace_id`, like every workspace-scoped table). A card_number that
stops appearing in transactions keeps its row, so the name comes back when
the card returns to a bill.

Revision ID: 097
Revises: 096
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "097"
down_revision = "096"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "account_cards",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("card_number", sa.String(length=19), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "account_id", "card_number", name="uq_account_cards_account_card_number"
        ),
    )
    op.create_index("ix_account_cards_workspace_id", "account_cards", ["workspace_id"])
    op.create_index("ix_account_cards_account_id", "account_cards", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_account_cards_account_id", table_name="account_cards")
    op.drop_index("ix_account_cards_workspace_id", table_name="account_cards")
    op.drop_table("account_cards")
