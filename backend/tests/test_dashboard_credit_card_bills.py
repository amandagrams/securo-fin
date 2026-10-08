"""Dashboard open credit-card bills: GET /api/dashboard/credit-card-bills."""
import calendar
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_clock import app_today
from app.models.account import Account
from app.models.bank_connection import BankConnection
from app.models.credit_card_bill import CreditCardBill
from app.models.fx_rate import FxRate
from app.models.transaction import Transaction
from app.models.user import User
from app.models.workspace import Workspace
from app.services.credit_card_service import get_cycle_dates

_FIELDS = {
    "account_id",
    "account_name",
    "masked_number",
    "institution_logo_url",
    "due_date",
    "close_date",
    "status",
    "amount",
    "amount_primary",
    "currency",
}


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def _clamp_day(year: int, month: int, day: int) -> date:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))


def _close_date_for_due(due: date, close_day: int | None) -> date:
    if not close_day:
        return due
    same = _clamp_day(due.year, due.month, close_day)
    if same <= due:
        return same
    year, month = _shift_month(due.year, due.month, -1)
    return _clamp_day(year, month, close_day)


def _cycle_containing(close_day: int, reference: date) -> tuple[date, date, date]:
    """Port of the account page's creditCardCycleBoundaries."""
    this_close = _clamp_day(reference.year, reference.month, close_day)
    if this_close > reference:
        next_close = this_close
    else:
        year, month = _shift_month(reference.year, reference.month, 1)
        next_close = _clamp_day(year, month, close_day)
    end = next_close - timedelta(days=1)
    prev_year, prev_month = _shift_month(next_close.year, next_close.month, -1)
    start = _clamp_day(prev_year, prev_month, close_day)
    return start, end, next_close


def _due_strictly_after(cycle_end: date, due_day: int) -> date:
    same = _clamp_day(cycle_end.year, cycle_end.month, due_day)
    if same > cycle_end:
        return same
    year, month = _shift_month(cycle_end.year, cycle_end.month, 1)
    return _clamp_day(year, month, due_day)


def _close_day_before(due: date, today: date) -> int:
    for day in range(1, 29):
        if _close_date_for_due(due, day) < today:
            return day
    raise AssertionError(f"no close day before {today} for due {due}")


def _separating_cycle_days(today: date) -> tuple[int, int]:
    """Close/due days whose in-progress cycle is not `get_cycle_dates`."""
    for close_day in range(1, 29):
        for due_day in range(1, 29):
            scheduled = get_cycle_dates(close_day, due_day, today)
            _start, end, close = _cycle_containing(close_day, today)
            due = _due_strictly_after(end, due_day)
            if scheduled["next_close_date"] != close or scheduled["next_due_date"] != due:
                return close_day, due_day
    raise AssertionError(f"in-progress cycle matches get_cycle_dates on {today}")


async def _account(session: AsyncSession, user: User, workspace: Workspace, **overrides) -> Account:
    fields = dict(
        user_id=user.id,
        workspace_id=workspace.id,
        name="Card",
        type="credit_card",
        balance=Decimal("0"),
        currency="BRL",
        is_closed=False,
    )
    fields.update(overrides)
    account = Account(**fields)
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def _connection(
    session: AsyncSession, user: User, workspace: Workspace, logo: str,
) -> BankConnection:
    connection = BankConnection(
        user_id=user.id,
        workspace_id=workspace.id,
        provider="test",
        external_id=str(uuid.uuid4()),
        institution_name="Banco",
        logo_url=logo,
        status="active",
    )
    session.add(connection)
    await session.commit()
    await session.refresh(connection)
    return connection


async def _bill(
    session: AsyncSession, user: User, account: Account, *, external_id: str, due: date,
) -> CreditCardBill:
    bill = CreditCardBill(
        user_id=user.id,
        workspace_id=account.workspace_id,
        account_id=account.id,
        external_id=external_id,
        due_date=due,
        total_amount=Decimal("0"),
        currency=account.currency,
    )
    session.add(bill)
    await session.commit()
    await session.refresh(bill)
    return bill


async def _tx(
    session: AsyncSession,
    user: User,
    account: Account,
    *,
    amount: str,
    when: date,
    type_: str = "debit",
    status: str = "posted",
    bill: CreditCardBill | None = None,
) -> None:
    session.add(Transaction(
        user_id=user.id,
        workspace_id=account.workspace_id,
        account_id=account.id,
        description=f"{type_} {amount}",
        amount=Decimal(amount),
        currency=account.currency,
        date=when,
        effective_date=when,
        type=type_,
        source="manual",
        status=status,
        bill_id=bill.id if bill is not None else None,
    ))
    await session.commit()


async def _summary(
    client: AsyncClient,
    headers: dict,
    account_id: uuid.UUID,
    *,
    start: date,
    end: date,
    bill_id: uuid.UUID | None = None,
    unbilled_only: bool = False,
) -> dict:
    params: dict = {"from": start.isoformat(), "to": end.isoformat()}
    if bill_id is not None:
        params["bill_id"] = str(bill_id)
    if unbilled_only:
        params["unbilled_only"] = "true"
    response = await client.get(f"/api/accounts/{account_id}/summary", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_two_open_cards_ordered_by_due_date_match_account_summary(
    client: AsyncClient, auth_headers: dict, session: AsyncSession, test_user: User, test_workspace: Workspace,
):
    """C1: one item per card, due-date order, status from close_date, amount = summary."""
    today = app_today()
    early_due = today
    later_due = today + timedelta(days=20)
    close_day = _close_day_before(early_due, today)
    early_close = _close_date_for_due(early_due, close_day)
    assert early_close < today

    logo = "https://bank.example/logo.png"
    connection = await _connection(session, test_user, test_workspace, logo)
    early = await _account(
        session, test_user, test_workspace,
        name="Early",
        display_name="Early Card",
        masked_number="4321",
        statement_close_day=close_day,
        payment_due_day=early_due.day,
        connection_id=connection.id,
    )
    later = await _account(
        session, test_user, test_workspace,
        name="Later",
        display_name="Later Card",
    )

    early_prev_due = early_due - timedelta(days=40)
    early_prev = await _bill(session, test_user, early, external_id="early-prev", due=early_prev_due)
    early_bill = await _bill(session, test_user, early, external_id="early-current", due=early_due)
    early_start = early_prev_due + timedelta(days=1)
    # Linked to the current bill but dated outside its window: counts only via bill_id.
    await _tx(session, test_user, early, amount="100.00", when=early_prev.due_date, bill=early_bill)
    # Unlinked, inside the window.
    await _tx(session, test_user, early, amount="30.00", when=early_start)
    await _tx(session, test_user, early, amount="20.00", when=early_start, status="pending")
    await _tx(session, test_user, early, amount="5.00", when=early_start, type_="credit")
    # Unlinked, the day before the window: must not count.
    await _tx(session, test_user, early, amount="999.00", when=early_prev.due_date)

    later_bill = await _bill(session, test_user, later, external_id="later-current", due=later_due)
    later_start = later_due - timedelta(days=45)
    await _tx(session, test_user, later, amount="40.00", when=later_due, bill=later_bill)
    await _tx(session, test_user, later, amount="777.00", when=later_start - timedelta(days=1))

    early_summary = await _summary(
        client, auth_headers, early.id, start=early_start, end=early_due, bill_id=early_bill.id,
    )
    later_summary = await _summary(
        client, auth_headers, later.id, start=later_start, end=later_due, bill_id=later_bill.id,
    )
    assert early_summary["projected_expenses"] == pytest.approx(145.0)
    assert early_summary["monthly_expenses"] == pytest.approx(125.0)
    assert later_summary["projected_expenses"] == pytest.approx(40.0)

    response = await client.get("/api/dashboard/credit-card-bills", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert [item["account_id"] for item in body["items"]] == [str(early.id), str(later.id)]

    early_item, later_item = body["items"]
    assert set(early_item) == _FIELDS
    assert set(later_item) == _FIELDS
    assert early_item["account_name"] == "Early Card"
    assert early_item["masked_number"] == "4321"
    assert early_item["institution_logo_url"] == logo
    assert early_item["due_date"] == early_due.isoformat()
    assert early_item["close_date"] == early_close.isoformat()
    assert early_item["status"] == "closed"
    assert early_item["currency"] == "BRL"
    assert early_item["amount"] == pytest.approx(early_summary["projected_expenses"])
    assert early_item["amount"] == pytest.approx(145.0)
    assert early_item["amount_primary"] == pytest.approx(early_item["amount"])

    assert later_item["account_name"] == "Later Card"
    assert later_item["masked_number"] is None
    assert later_item["institution_logo_url"] is None
    assert later_item["due_date"] == later_due.isoformat()
    assert later_item["close_date"] == later_due.isoformat()
    assert later_due >= today
    assert later_item["status"] == "open"
    assert later_item["currency"] == "BRL"
    assert later_item["amount"] == pytest.approx(later_summary["projected_expenses"])
    assert later_item["amount"] == pytest.approx(40.0)
    assert later_item["amount_primary"] == pytest.approx(40.0)


@pytest.mark.asyncio
async def test_aggregates_sum_amount_primary_count_and_earliest_due(
    client: AsyncClient, auth_headers: dict, session: AsyncSession, test_user: User, test_workspace: Workspace,
):
    """C2: total_primary sums converted amounts; count and earliest follow the items."""
    today = app_today()
    for offset in (-1, 0, 1):
        session.add(FxRate(
            base_currency="USD",
            quote_currency="BRL",
            date=today + timedelta(days=offset),
            rate=Decimal("5"),
            source="test",
        ))
    await session.commit()

    usd_due = today
    brl_due = today + timedelta(days=15)
    usd = await _account(session, test_user, test_workspace, name="Dollar", currency="USD")
    brl = await _account(session, test_user, test_workspace, name="Real", currency="BRL")
    usd_bill = await _bill(session, test_user, usd, external_id="usd", due=usd_due)
    brl_bill = await _bill(session, test_user, brl, external_id="brl", due=brl_due)
    await _tx(session, test_user, usd, amount="40.00", when=usd_due, bill=usd_bill)
    await _tx(session, test_user, brl, amount="100.00", when=brl_due, bill=brl_bill)

    response = await client.get("/api/dashboard/credit-card-bills", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    items = body["items"]
    assert len(items) == 2
    by_currency = {item["currency"]: item for item in items}
    assert by_currency["USD"]["amount"] == pytest.approx(40.0)
    assert by_currency["USD"]["amount_primary"] == pytest.approx(200.0)
    assert by_currency["BRL"]["amount"] == pytest.approx(100.0)
    assert by_currency["BRL"]["amount_primary"] == pytest.approx(100.0)
    assert body["total_primary"] == pytest.approx(sum(item["amount_primary"] for item in items))
    assert body["total_primary"] == pytest.approx(300.0)
    assert sum(item["amount"] for item in items) == pytest.approx(140.0)
    assert body["accounts_count"] == len(items)
    assert body["earliest_due_date"] == min(item["due_date"] for item in items)
    assert body["earliest_due_date"] == usd_due.isoformat()


@pytest.mark.asyncio
async def test_card_without_bills_uses_get_cycle_dates_window(
    client: AsyncClient, auth_headers: dict, session: AsyncSession, test_user: User, test_workspace: Workspace,
):
    """C3: no bills, both cycle days — the get_cycle_dates cycle, not the one containing today."""
    today = app_today()
    close_day, due_day = 1, 20
    scheduled = get_cycle_dates(close_day, due_day, today)
    close = scheduled["next_close_date"]
    due = scheduled["next_due_date"]
    assert close is not None and due is not None
    start, end, _window_close = _cycle_containing(close_day, close - timedelta(days=1))
    assert end == close - timedelta(days=1)

    account = await _account(
        session, test_user, test_workspace,
        name="Cycle",
        statement_close_day=close_day,
        payment_due_day=due_day,
    )
    await _tx(session, test_user, account, amount="80.00", when=end)
    await _tx(session, test_user, account, amount="500.00", when=close)

    summary = await _summary(client, auth_headers, account.id, start=start, end=end)
    assert summary["projected_expenses"] == pytest.approx(80.0)

    response = await client.get("/api/dashboard/credit-card-bills", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["accounts_count"] == 1
    item = body["items"][0]
    assert item["account_id"] == str(account.id)
    assert item["due_date"] == due.isoformat()
    assert item["close_date"] == close.isoformat()
    assert item["status"] == ("open" if close >= today else "closed")
    assert item["amount"] == pytest.approx(summary["projected_expenses"])
    assert item["amount"] == pytest.approx(80.0)


@pytest.mark.asyncio
async def test_cards_without_cycle_and_closed_accounts_are_excluded(
    client: AsyncClient, auth_headers: dict, session: AsyncSession, test_user: User, test_workspace: Workspace,
):
    """C4: no cycle days, a single cycle day, a closed card, and a non-card stay out."""
    today = app_today()
    due = today + timedelta(days=5)
    eligible = await _account(session, test_user, test_workspace, name="Eligible")
    eligible_bill = await _bill(session, test_user, eligible, external_id="eligible", due=due)
    await _tx(session, test_user, eligible, amount="10.00", when=due, bill=eligible_bill)

    no_cycle = await _account(session, test_user, test_workspace, name="No Cycle")
    await _tx(session, test_user, no_cycle, amount="50.00", when=today)

    close_only = await _account(
        session, test_user, test_workspace, name="Close Only", statement_close_day=11,
    )
    due_only = await _account(
        session, test_user, test_workspace, name="Due Only", payment_due_day=16,
    )

    closed = await _account(session, test_user, test_workspace, name="Closed", is_closed=True)
    closed_bill = await _bill(session, test_user, closed, external_id="closed", due=due)
    await _tx(session, test_user, closed, amount="999.00", when=due, bill=closed_bill)

    checking = await _account(session, test_user, test_workspace, name="Checking", type="checking")

    response = await client.get("/api/dashboard/credit-card-bills", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    ids = {item["account_id"] for item in body["items"]}
    assert ids == {str(eligible.id)}
    assert str(no_cycle.id) not in ids
    assert str(close_only.id) not in ids
    assert str(due_only.id) not in ids
    assert str(closed.id) not in ids
    assert str(checking.id) not in ids
    assert body["items"][0]["amount"] == pytest.approx(10.0)
    assert body["total_primary"] == pytest.approx(10.0)
    assert body["accounts_count"] == 1
    assert body["earliest_due_date"] == due.isoformat()


@pytest.mark.asyncio
async def test_shared_balance_group_counts_once_first_by_name(
    client: AsyncClient, auth_headers: dict, session: AsyncSession, test_user: User, test_workspace: Workspace,
):
    """C5: one row for the group — the first Account.name, counted once."""
    today = app_today()
    alpha_due = today + timedelta(days=30)
    beta_due = today + timedelta(days=5)
    alpha = await _account(
        session, test_user, test_workspace,
        name="Alpha",
        display_name="Zeta Card",
        shared_balance_group="line-1",
    )
    beta = await _account(
        session, test_user, test_workspace,
        name="Beta",
        display_name="Aaron Card",
        shared_balance_group="line-1",
    )
    alpha_bill = await _bill(session, test_user, alpha, external_id="alpha", due=alpha_due)
    beta_bill = await _bill(session, test_user, beta, external_id="beta", due=beta_due)
    await _tx(session, test_user, alpha, amount="100.00", when=alpha_due, bill=alpha_bill)
    await _tx(session, test_user, beta, amount="400.00", when=beta_due, bill=beta_bill)

    response = await client.get("/api/dashboard/credit-card-bills", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["account_id"] == str(alpha.id)
    assert item["account_name"] == "Zeta Card"
    assert item["due_date"] == alpha_due.isoformat()
    assert item["amount"] == pytest.approx(100.0)
    assert item["amount_primary"] == pytest.approx(100.0)
    assert body["total_primary"] == pytest.approx(100.0)
    assert body["accounts_count"] == 1
    assert body["earliest_due_date"] == alpha_due.isoformat()
    assert str(beta.id) not in {row["account_id"] for row in body["items"]}


@pytest.mark.asyncio
async def test_no_eligible_cards_returns_empty_aggregates(
    client: AsyncClient, auth_headers: dict, session: AsyncSession, test_user: User, test_workspace: Workspace,
):
    """C6: nothing eligible → empty items and zero aggregates."""
    today = app_today()
    await _account(session, test_user, test_workspace, name="No Cycle")
    closed = await _account(session, test_user, test_workspace, name="Closed", is_closed=True)
    closed_bill = await _bill(
        session, test_user, closed, external_id="closed", due=today + timedelta(days=3),
    )
    await _tx(session, test_user, closed, amount="999.00", when=today, bill=closed_bill)
    await _account(session, test_user, test_workspace, name="Checking", type="checking")

    response = await client.get("/api/dashboard/credit-card-bills", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "total_primary": 0.0,
        "accounts_count": 0,
        "earliest_due_date": None,
    }


@pytest.mark.asyncio
async def test_past_due_bill_falls_back_to_current_cycle(
    client: AsyncClient, auth_headers: dict, session: AsyncSession, test_user: User, test_workspace: Workspace,
):
    """C7: newest bill already due, no future bill → the cycle that contains today."""
    today = app_today()
    close_day, due_day = _separating_cycle_days(today)
    scheduled = get_cycle_dates(close_day, due_day, today)
    start, end, close = _cycle_containing(close_day, today)
    due = _due_strictly_after(end, due_day)
    assert scheduled["next_due_date"] != due or scheduled["next_close_date"] != close
    overdue_due = today - timedelta(days=10)
    assert overdue_due < today

    account = await _account(
        session, test_user, test_workspace,
        name="Overdue",
        statement_close_day=close_day,
        payment_due_day=due_day,
    )
    overdue = await _bill(session, test_user, account, external_id="overdue", due=overdue_due)
    await _tx(session, test_user, account, amount="999.00", when=today, bill=overdue)
    await _tx(session, test_user, account, amount="42.00", when=today)

    unbilled_only = start >= _close_date_for_due(overdue_due, close_day)
    summary = await _summary(
        client, auth_headers, account.id, start=start, end=end, unbilled_only=unbilled_only,
    )
    assert summary["projected_expenses"] == pytest.approx(42.0)

    response = await client.get("/api/dashboard/credit-card-bills", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["due_date"] == due.isoformat()
    assert item["due_date"] != overdue_due.isoformat()
    assert item["due_date"] != scheduled["next_due_date"].isoformat() or item["close_date"] != scheduled["next_close_date"].isoformat()
    assert item["close_date"] == close.isoformat()
    assert close > today
    assert item["status"] == "open"
    assert item["amount"] == pytest.approx(summary["projected_expenses"])
    assert item["amount"] == pytest.approx(42.0)
    assert body["total_primary"] == pytest.approx(42.0)
    assert body["earliest_due_date"] == due.isoformat()
