"""accounts.payment_account_id: which checking account pays a card's bill

Nullable on purpose. Cards that already exist, including every card a sync
creates, keep null — there is nothing to backfill, and the sync must not
guess a link. Only a credit card may point the column at an open checking
account in the same workspace; that rule lives in the service, not in the
database, because it depends on type and on the target being open.

Deleting the checking account drops the pointer and keeps the card.

Revision ID: 098
Revises: 097
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "098"
down_revision = "097"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("payment_account_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_accounts_payment_account_id",
        "accounts",
        "accounts",
        ["payment_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_accounts_payment_account_id",
        "accounts",
        ["payment_account_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_accounts_payment_account_id", table_name="accounts")
    op.drop_constraint("fk_accounts_payment_account_id", "accounts", type_="foreignkey")
    op.drop_column("accounts", "payment_account_id")
