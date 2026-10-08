import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AccountBase(BaseModel):
    name: str
    type: str
    balance: Decimal
    currency: str = "USD"


class AccountCreate(BaseModel):
    name: str
    type: str
    balance: Decimal = Decimal("0.00")
    balance_date: Optional[date] = None
    currency: str = "USD"
    credit_limit: Optional[Decimal] = None
    statement_close_day: Optional[int] = None
    payment_due_day: Optional[int] = None
    minimum_payment: Optional[Decimal] = None
    card_brand: Optional[str] = None
    card_level: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    type: Optional[str] = None
    balance: Optional[Decimal] = None
    balance_date: Optional[date] = None
    credit_limit: Optional[Decimal] = None
    statement_close_day: Optional[int] = None
    payment_due_day: Optional[int] = None
    minimum_payment: Optional[Decimal] = None
    card_brand: Optional[str] = None
    card_level: Optional[str] = None


class AccountRead(AccountBase):
    id: uuid.UUID
    user_id: uuid.UUID
    connection_id: Optional[uuid.UUID] = None
    external_id: Optional[str] = None
    display_name: Optional[str] = None
    # Last 4 chars of the bank's identifier, when the provider exposes one.
    # Read-only: absent from AccountUpdate because sync owns it.
    masked_number: Optional[str] = None
    # The account's own institution (issue #345), falling back to the linked
    # BankConnection's when the provider doesn't distinguish. Null for manual
    # accounts.
    institution_name: Optional[str] = None
    institution_logo_url: Optional[str] = None
    current_balance: float = 0.0
    previous_balance: Optional[float] = None
    balance_primary: Optional[float] = None
    credit_limit: Optional[float] = None
    available_credit: Optional[float] = None
    statement_close_day: Optional[int] = None
    payment_due_day: Optional[int] = None
    next_close_date: Optional[date] = None
    next_due_date: Optional[date] = None
    minimum_payment: Optional[float] = None
    card_brand: Optional[str] = None
    card_level: Optional[str] = None
    shared_balance_group: Optional[str] = None
    is_closed: bool = False
    closed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CreditCardBillRead(BaseModel):
    """Provider-agnostic credit-card bill (fatura) — issue #92.

    Provider-specific extras live in `raw_data` on the model but are not
    exposed here so that consumers don't form provider-shaped dependencies.
    """

    id: uuid.UUID
    account_id: uuid.UUID
    external_id: str
    due_date: date
    total_amount: float
    currency: str
    minimum_payment: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class UpcomingBillCycleRead(BaseModel):
    """One future credit-card cycle and what is already committed to it.

    `committed_total` is in the account currency. `committed_total_primary`
    is the same commitment in the user's primary currency, taken from stored
    `amount_primary` (and from the anchor parcel, for a projected installment).
    """

    due_date: date
    close_date: date
    committed_total: float
    committed_total_primary: float
    currency: str


class UpcomingBillsRead(BaseModel):
    """Future cycles after the one in progress.

    `cycles` has one entry per requested cycle, ascending by due_date, zeros
    included. The two future totals cover every future cycle, not only the
    ones listed. Both totals are null when the account is not a credit card
    with a close day and a due day — zero would mean "nothing committed".
    """

    cycles: list[UpcomingBillCycleRead]
    future_committed_total: Optional[float] = None
    future_committed_total_primary: Optional[float] = None


class AccountCardRead(BaseModel):
    """A card seen on this account's transactions, with the name the user
    gave it. The list is what the bill saw: a card that never appeared on a
    transaction is not listed (and cannot be named)."""

    card_number: str
    name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AccountCardUpdate(BaseModel):
    """Body of PUT /api/accounts/{account_id}/cards/{card_number}.

    `name` longer than 255 chars is a 422; surrounding whitespace is
    trimmed by the service, and a blank result clears the name to null.
    """

    name: Optional[str] = Field(default=None, max_length=255)


class AccountSummary(BaseModel):
    account_id: uuid.UUID
    current_balance: float
    opening_balance: float
    monthly_income: float
    monthly_expenses: float
    projected_income: float = 0.0
    projected_expenses: float = 0.0
    current_balance_primary: Optional[float] = None
    opening_balance_primary: Optional[float] = None
    monthly_income_primary: Optional[float] = None
    monthly_expenses_primary: Optional[float] = None
    projected_income_primary: Optional[float] = None
    projected_expenses_primary: Optional[float] = None
