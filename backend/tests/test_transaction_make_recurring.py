"""POST /api/transactions/{id}/make-recurring (.checks/marcar-transacao-recorrente.md).

The existing charge becomes the first occurrence of a RecurringTransaction.
The rule and the foreign key are one commit; transfers and installments stay out.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.bank_connection import BankConnection
from app.models.category import Category
from app.models.credit_card_bill import CreditCardBill
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction
from app.models.user import User
from app.models.workspace import Workspace


def _pk(obj) -> uuid.UUID:
    """Primary key without a lazy load. expire_all() drops attributes, and
    reading them from an async test raises MissingGreenlet."""
    ident = sa_inspect(obj).identity
    assert ident is not None
    return ident[0]


async def _reload(session: AsyncSession, *objs) -> None:
    for obj in objs:
        if sa_inspect(obj).expired:
            await session.refresh(obj)


async def _account(
    session: AsyncSession,
    user: User,
    *,
    type: str = "checking",
    connection_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
) -> Account:
    await _reload(session, user)
    account = Account(
        id=uuid.uuid4(),
        user_id=user.id,
        workspace_id=workspace_id,
        connection_id=connection_id,
        name=f"Conta {type}",
        type=type,
        balance=Decimal("0.00"),
        currency="BRL",
    )
    session.add(account)
    await session.flush()
    return account


async def _transaction(
    session: AsyncSession,
    user: User,
    account: Account,
    **overrides,
) -> Transaction:
    await _reload(session, user, account)
    tx = Transaction(
        id=overrides.pop("id", uuid.uuid4()),
        user_id=user.id,
        workspace_id=overrides.pop("workspace_id", account.workspace_id),
        account_id=account.id,
        category_id=overrides.pop("category_id", None),
        description=overrides.pop("description", "Streaming"),
        amount=overrides.pop("amount", Decimal("49.90")),
        currency=overrides.pop("currency", "BRL"),
        date=overrides.pop("date", date(2026, 10, 7)),
        type=overrides.pop("type", "debit"),
        source=overrides.pop("source", "manual"),
        status=overrides.pop("status", "posted"),
        bill_id=overrides.pop("bill_id", None),
        transfer_pair_id=overrides.pop("transfer_pair_id", None),
        installment_number=overrides.pop("installment_number", None),
        installment_series_id=overrides.pop("installment_series_id", None),
        recurring_transaction_id=overrides.pop("recurring_transaction_id", None),
        created_at=datetime.now(timezone.utc),
    )
    if overrides:
        raise AssertionError(f"unexpected transaction fields: {sorted(overrides)}")
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx


async def _rules(session: AsyncSession, description: str, start: date) -> list[RecurringTransaction]:
    session.expire_all()
    result = await session.execute(
        select(RecurringTransaction).where(
            RecurringTransaction.description == description,
            RecurringTransaction.start_date == start,
        )
    )
    return list(result.scalars().all())


def _post(client: AsyncClient, headers: dict, transaction_id, body: dict):
    return client.post(
        f"/api/transactions/{transaction_id}/make-recurring",
        json=body,
        headers=headers,
    )


async def test_synced_credit_card_links_without_changing_posted_fields(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
    test_connection: BankConnection,
    test_categories: list[Category],
):
    """C2: a posted synced card charge gains a recurring id and keeps its facts."""
    account = await _account(
        session, test_user, type="credit_card", connection_id=test_connection.id,
    )
    bill = CreditCardBill(
        id=uuid.uuid4(),
        user_id=test_user.id,
        account_id=account.id,
        external_id="bill-oct",
        due_date=date(2026, 10, 15),
        total_amount=Decimal("49.90"),
        currency="BRL",
    )
    session.add(bill)
    await session.flush()
    tx = await _transaction(
        session,
        test_user,
        account,
        description="Streaming Plus",
        amount=Decimal("49.90"),
        date=date(2026, 10, 7),
        source="sync",
        status="posted",
        bill_id=bill.id,
        category_id=test_categories[0].id,
    )

    response = await _post(client, auth_headers, tx.id, {"frequency": "monthly"})

    assert response.status_code == 201
    body = response.json()
    assert body["recurring_transaction_id"]
    assert body["date"] == "2026-10-07"
    assert Decimal(str(body["amount"])) == Decimal("49.90")
    assert body["status"] == "posted"
    assert body["source"] == "sync"
    assert body["bill_id"] == str(bill.id)

    detail = await client.get(f"/api/transactions/{tx.id}", headers=auth_headers)
    assert detail.status_code == 200
    again = detail.json()
    assert again["recurring_transaction_id"] == body["recurring_transaction_id"]
    assert again["date"] == "2026-10-07"
    assert Decimal(str(again["amount"])) == Decimal("49.90")
    assert again["status"] == "posted"
    assert again["source"] == "sync"
    assert again["bill_id"] == str(bill.id)

    tx_id = _pk(tx)
    bill_id = _pk(bill)
    session.expire_all()
    stored = await session.get(Transaction, tx_id)
    assert stored is not None
    assert str(stored.recurring_transaction_id) == body["recurring_transaction_id"]
    assert stored.date == date(2026, 10, 7)
    assert stored.amount == Decimal("49.90")
    assert stored.status == "posted"
    assert stored.source == "sync"
    assert stored.bill_id == bill_id


async def test_rule_copies_the_transaction_and_is_listed(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
    test_categories: list[Category],
):
    """C5: the rule copies the charge, and end_date is null or the chosen date."""
    account = await _account(session, test_user)
    category_id = test_categories[0].id
    open_ended = await _transaction(
        session,
        test_user,
        account,
        description="Open ended",
        amount=Decimal("49.90"),
        currency="BRL",
        type="debit",
        category_id=category_id,
        date=date(2026, 10, 7),
    )
    closed = await _transaction(
        session,
        test_user,
        account,
        description="Closed ended",
        amount=Decimal("12.00"),
        currency="USD",
        type="credit",
        category_id=category_id,
        date=date(2026, 10, 7),
    )

    without_end = await _post(client, auth_headers, open_ended.id, {"frequency": "monthly"})
    with_end = await _post(
        client,
        auth_headers,
        closed.id,
        {"frequency": "yearly", "end_date": "2027-06-01"},
    )
    assert without_end.status_code == 201
    assert with_end.status_code == 201

    listed = await client.get("/api/recurring-transactions", headers=auth_headers)
    assert listed.status_code == 200
    by_description = {row["description"]: row for row in listed.json()}

    copied = by_description["Open ended"]
    assert copied["description"] == "Open ended"
    assert copied["id"] == without_end.json()["recurring_transaction_id"]
    assert Decimal(str(copied["amount"])) == Decimal("49.90")
    assert copied["currency"] == "BRL"
    assert copied["type"] == "debit"
    assert copied["account_id"] == str(account.id)
    assert copied["category_id"] == str(category_id)
    assert copied["start_date"] == "2026-10-07"
    assert copied["frequency"] == "monthly"
    assert copied["end_date"] is None
    assert copied["auto_generate"] is True
    assert copied["is_active"] is True
    assert copied["weekend_adjustment"] == "none"

    bounded = by_description["Closed ended"]
    assert bounded["description"] == "Closed ended"
    assert bounded["id"] == with_end.json()["recurring_transaction_id"]
    assert Decimal(str(bounded["amount"])) == Decimal("12.00")
    assert bounded["currency"] == "USD"
    assert bounded["type"] == "credit"
    assert bounded["account_id"] == str(account.id)
    assert bounded["category_id"] == str(category_id)
    assert bounded["start_date"] == "2026-10-07"
    assert bounded["frequency"] == "yearly"
    assert bounded["end_date"] == "2027-06-01"
    assert bounded["auto_generate"] is True
    assert bounded["is_active"] is True
    assert bounded["weekend_adjustment"] == "none"


async def test_weekly_next_occurrence_is_seven_days_later(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C6: weekly from 2026-10-07 lands on 2026-10-14 with no day of month."""
    account = await _account(session, test_user)
    tx = await _transaction(session, test_user, account, description="Weekly paper")
    response = await _post(client, auth_headers, tx.id, {"frequency": "weekly"})
    assert response.status_code == 201
    rules = await _rules(session, "Weekly paper", date(2026, 10, 7))
    assert len(rules) == 1
    assert rules[0].next_occurrence == date(2026, 10, 14)
    assert rules[0].day_of_month is None


async def test_monthly_without_day_projects_only_the_next_month(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C7: empty day keeps one charge on the 7th and projects only 2026-11-07."""
    account = await _account(session, test_user)
    tx = await _transaction(
        session,
        test_user,
        account,
        description="Streaming",
        amount=Decimal("49.90"),
        date=date(2026, 10, 7),
    )
    response = await _post(client, auth_headers, tx.id, {"frequency": "monthly"})
    assert response.status_code == 201
    recurring_id = response.json()["recurring_transaction_id"]
    rules = await _rules(session, "Streaming", date(2026, 10, 7))
    assert len(rules) == 1
    assert rules[0].next_occurrence == date(2026, 11, 7)
    assert rules[0].day_of_month is None

    account_id = _pk(account)
    session.expire_all()
    charges = (
        await session.execute(
            select(Transaction).where(
                Transaction.account_id == account_id,
                Transaction.description == "Streaming",
                Transaction.date == date(2026, 10, 7),
            )
        )
    ).scalars().all()
    assert len(charges) == 1

    projected = await client.get(
        "/api/dashboard/projected-transactions",
        params={"account_id": str(account_id), "from": "2026-10-01", "to": "2026-11-30"},
        headers=auth_headers,
    )
    assert projected.status_code == 200
    mine = [item for item in projected.json() if item["recurring_id"] == recurring_id]
    assert any(
        item["date"] == "2026-11-07"
        and item["description"] == "Streaming"
        and Decimal(str(item["amount"])) == Decimal("49.90")
        for item in mine
    )
    assert all(item["date"] != "2026-10-07" for item in mine)


async def test_monthly_day_15_lands_on_the_fifteenth(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C8: monthly with day 15 moves the next charge to 2026-11-15."""
    account = await _account(session, test_user)
    tx = await _transaction(session, test_user, account, description="Mid month")
    response = await _post(
        client, auth_headers, tx.id, {"frequency": "monthly", "day_of_month": 15},
    )
    assert response.status_code == 201
    rules = await _rules(session, "Mid month", date(2026, 10, 7))
    assert len(rules) == 1
    assert rules[0].next_occurrence == date(2026, 11, 15)
    assert rules[0].day_of_month == 15


async def test_monthly_day_31_clamps_to_february_28(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C9: day 31 in January clamps the February occurrence to the 28th."""
    account = await _account(session, test_user)
    tx = await _transaction(
        session, test_user, account, description="Month end", date=date(2026, 1, 31),
    )
    response = await _post(
        client, auth_headers, tx.id, {"frequency": "monthly", "day_of_month": 31},
    )
    assert response.status_code == 201
    rules = await _rules(session, "Month end", date(2026, 1, 31))
    assert len(rules) == 1
    assert rules[0].next_occurrence == date(2026, 2, 28)
    assert rules[0].day_of_month == 31


async def test_quarterly_without_day_advances_three_months(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C10: quarterly with no day jumps from 2026-10-07 to 2027-01-07."""
    account = await _account(session, test_user)
    tx = await _transaction(session, test_user, account, description="Quarterly fee")
    response = await _post(client, auth_headers, tx.id, {"frequency": "quarterly"})
    assert response.status_code == 201
    rules = await _rules(session, "Quarterly fee", date(2026, 10, 7))
    assert len(rules) == 1
    assert rules[0].next_occurrence == date(2027, 1, 7)
    assert rules[0].day_of_month is None


async def test_already_linked_is_400_and_count_stays_one(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C12: a second POST is refused and does not add another rule."""
    account = await _account(session, test_user)
    tx = await _transaction(session, test_user, account, description="Already linked")
    first = await _post(client, auth_headers, tx.id, {"frequency": "monthly"})
    assert first.status_code == 201

    second = await _post(client, auth_headers, tx.id, {"frequency": "yearly"})
    assert second.status_code == 400
    assert second.json()["detail"] == "Transaction is already linked to a recurring bill"
    rules = await _rules(session, "Already linked", date(2026, 10, 7))
    assert len(rules) == 1
    assert rules[0].frequency == "monthly"


async def test_transfer_cannot_be_marked_recurring(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C14: a transfer leg is refused and creates no rule."""
    account = await _account(session, test_user)
    tx = await _transaction(
        session,
        test_user,
        account,
        description="To savings",
        transfer_pair_id=uuid.uuid4(),
    )
    response = await _post(client, auth_headers, tx.id, {"frequency": "monthly"})
    assert response.status_code == 400
    assert response.json()["detail"] == "A transfer cannot be marked recurring"
    assert await _rules(session, "To savings", date(2026, 10, 7)) == []


async def test_installment_cannot_be_marked_recurring(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C16: installment number or series id is refused and creates no rule."""
    account = await _account(session, test_user)
    cases = [
        ("Parcel number", {"installment_number": 3}),
        ("Parcel series", {"installment_series_id": uuid.uuid4()}),
    ]
    for description, fields in cases:
        tx = await _transaction(
            session, test_user, account, description=description, **fields,
        )
        response = await _post(client, auth_headers, tx.id, {"frequency": "monthly"})
        assert response.status_code == 400, description
        assert response.json()["detail"] == "An installment cannot be marked recurring"
        assert await _rules(session, description, date(2026, 10, 7)) == []


async def test_invalid_frequency_or_day_is_422_and_creates_nothing(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C18: a bad frequency or day is 422 and leaves no rule."""
    account = await _account(session, test_user)
    cases = [
        {"frequency": "daily"},
        {"frequency": "Monthly"},
        {"frequency": ""},
        {},
        {"frequency": "monthly", "day_of_month": 0},
        {"frequency": "monthly", "day_of_month": 32},
        {"frequency": "monthly", "day_of_month": -1},
        {"frequency": "weekly", "day_of_month": 7},
        {"frequency": "biweekly", "day_of_month": 1},
    ]
    for body in cases:
        tx = await _transaction(
            session, test_user, account, description=f"Invalid {body}",
        )
        response = await _post(client, auth_headers, tx.id, body)
        assert response.status_code == 422, body
        assert await _rules(session, tx.description, tx.date) == []


async def test_transaction_absent_from_workspace_is_404(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user: User,
):
    """C19: an id that is not in this workspace is 404 and creates no rule."""
    other = Workspace(
        id=uuid.uuid4(),
        name="Outro",
        kind="personal",
        created_by_user_id=test_user.id,
        default_currency="BRL",
    )
    session.add(other)
    await session.flush()
    account = await _account(session, test_user, workspace_id=other.id)
    tx = await _transaction(
        session,
        test_user,
        account,
        description="Foreign charge",
        workspace_id=other.id,
    )

    response = await _post(client, auth_headers, tx.id, {"frequency": "monthly"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Transaction not found"
    assert await _rules(session, "Foreign charge", date(2026, 10, 7)) == []

    missing = await _post(client, auth_headers, uuid.uuid4(), {"frequency": "monthly"})
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Transaction not found"


async def test_viewer_is_403_and_creates_nothing(
    client: AsyncClient,
    viewer_auth_headers,
    session: AsyncSession,
    test_user: User,
):
    """C20: a read-only member is refused and no rule is created."""
    account = await _account(session, test_user)
    tx = await _transaction(session, test_user, account, description="Viewer charge")
    response = await _post(
        client, viewer_auth_headers, tx.id, {"frequency": "monthly"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Read-only role"
    assert await _rules(session, "Viewer charge", date(2026, 10, 7)) == []


async def test_failed_link_leaves_no_recurring_row(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """C21: a commit that cannot save the link rolls the new rule back with it."""
    account = await _account(session, test_user)
    tx = await _transaction(session, test_user, account, description="Rollback charge")

    from sqlalchemy.ext.asyncio import AsyncSession as AsyncSessionCls

    real_commit = AsyncSessionCls.commit

    async def commit_that_refuses_the_link(self, *args, **kwargs):
        linking = any(
            isinstance(obj, Transaction) and obj.recurring_transaction_id is not None
            for obj in list(self.dirty)
        )
        if linking:
            raise IntegrityError("UPDATE", {}, Exception("link failed"))
        return await real_commit(self, *args, **kwargs)

    monkeypatch.setattr(AsyncSessionCls, "commit", commit_that_refuses_the_link)
    tx_id = _pk(tx)
    # The refused commit is not turned into an HTTP body: the link and the
    # rule share one transaction, so the error leaves the request.
    with pytest.raises(IntegrityError):
        await _post(client, auth_headers, tx_id, {"frequency": "monthly"})

    session.expire_all()
    stored = await session.get(Transaction, tx_id)
    assert stored is not None
    assert stored.recurring_transaction_id is None
    assert await _rules(session, "Rollback charge", date(2026, 10, 7)) == []
