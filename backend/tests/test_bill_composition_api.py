"""Composição da fatura no summary (.checks/fatura-composicao-e-status.md, S1).

As asserções vêm dos critérios: débitos em bill_purchases, créditos que
entram na fatura em bill_refunds, diferença igual a projected_expenses,
null fora de credit_card, e _primary pela mesma conversão dos outros.
"""

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_clock import app_today
from app.models.account import Account
from app.models.category import Category
from app.models.credit_card_bill import CreditCardBill
from app.models.fx_rate import FxRate
from app.models.transaction import Transaction


async def _account(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    acc_type: str,
    currency: str,
) -> Account:
    account = Account(
        id=uuid.uuid4(),
        user_id=user_id,
        name=f"{acc_type} {currency}",
        type=acc_type,
        balance=Decimal("0"),
        currency=currency,
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def _bill(
    session: AsyncSession,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    due,
) -> CreditCardBill:
    bill = CreditCardBill(
        user_id=user_id,
        account_id=account_id,
        external_id=str(uuid.uuid4()),
        due_date=due,
        total_amount=Decimal("0"),
        currency="BRL",
    )
    session.add(bill)
    await session.commit()
    await session.refresh(bill)
    return bill


async def _txn(
    session: AsyncSession,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    amount: str,
    txn_type: str,
    txn_date,
    *,
    currency: str,
    status: str = "posted",
    bill_id: uuid.UUID | None = None,
    is_ignored: bool = False,
    transfer_pair_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
) -> None:
    session.add(
        Transaction(
            id=uuid.uuid4(),
            user_id=user_id,
            account_id=account_id,
            description=f"{txn_type} {amount} {status}",
            amount=Decimal(amount),
            currency=currency,
            date=txn_date,
            type=txn_type,
            source="manual",
            status=status,
            bill_id=bill_id,
            is_ignored=is_ignored,
            transfer_pair_id=transfer_pair_id,
            category_id=category_id,
        )
    )
    await session.commit()


@pytest.mark.asyncio
async def test_bill_purchases_and_refunds_for_selected_bill(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user,
):
    today = app_today()
    account = await _account(session, test_user.id, acc_type="credit_card", currency="BRL")
    bill = await _bill(session, test_user.id, account.id, today)
    other = await _bill(session, test_user.id, account.id, today)
    transfer_cat = Category(
        id=uuid.uuid4(),
        user_id=test_user.id,
        name="Transfer-like",
        treat_as_transfer=True,
    )
    session.add(transfer_cat)
    await session.commit()

    on_bill = today - timedelta(days=5)
    window_from = today - timedelta(days=20)
    window_to = today - timedelta(days=1)
    await _txn(
        session,
        test_user.id,
        account.id,
        "100.00",
        "debit",
        on_bill,
        currency="BRL",
        bill_id=bill.id,
    )
    await _txn(
        session,
        test_user.id,
        account.id,
        "50.00",
        "debit",
        on_bill,
        currency="BRL",
        status="pending",
        bill_id=bill.id,
    )
    await _txn(
        session,
        test_user.id,
        account.id,
        "30.00",
        "credit",
        on_bill,
        currency="BRL",
        bill_id=bill.id,
    )
    await _txn(
        session,
        test_user.id,
        account.id,
        "25.00",
        "debit",
        on_bill,
        currency="BRL",
        bill_id=bill.id,
        is_ignored=True,
    )
    await _txn(
        session,
        test_user.id,
        account.id,
        "80.00",
        "credit",
        on_bill,
        currency="BRL",
        bill_id=bill.id,
        transfer_pair_id=uuid.uuid4(),
    )
    await _txn(
        session,
        test_user.id,
        account.id,
        "40.00",
        "credit",
        on_bill,
        currency="BRL",
        bill_id=bill.id,
        category_id=transfer_cat.id,
    )
    await _txn(
        session,
        test_user.id,
        account.id,
        "999.00",
        "debit",
        on_bill,
        currency="BRL",
        bill_id=other.id,
    )

    selected = await client.get(
        f"/api/accounts/{account.id}/summary",
        headers=auth_headers,
        params={
            "bill_id": str(bill.id),
            "from": window_from.isoformat(),
            "to": window_to.isoformat(),
        },
    )
    assert selected.status_code == 200
    body = selected.json()
    assert body["bill_purchases"] == pytest.approx(150.00)
    assert body["bill_refunds"] == pytest.approx(30.00)
    assert body["bill_purchases"] - body["bill_refunds"] == pytest.approx(
        body["projected_expenses"]
    )
    assert body["projected_expenses"] == pytest.approx(120.00)

    # Posted + pending + a future row with no bill, and one already billed
    # inside the same window. unbilled_only keeps only the first three.
    open_from = today
    open_to = today + timedelta(days=15)
    await _txn(session, test_user.id, account.id, "40.00", "debit", today, currency="BRL")
    await _txn(
        session,
        test_user.id,
        account.id,
        "10.00",
        "debit",
        today,
        currency="BRL",
        status="pending",
    )
    await _txn(
        session,
        test_user.id,
        account.id,
        "7.00",
        "debit",
        today + timedelta(days=5),
        currency="BRL",
    )
    await _txn(
        session,
        test_user.id,
        account.id,
        "999.00",
        "debit",
        today,
        currency="BRL",
        bill_id=bill.id,
    )

    unbilled = await client.get(
        f"/api/accounts/{account.id}/summary",
        headers=auth_headers,
        params={"from": open_from.isoformat(), "to": open_to.isoformat(), "unbilled_only": True},
    )
    assert unbilled.status_code == 200
    open_body = unbilled.json()
    assert open_body["bill_purchases"] == pytest.approx(57.00)
    assert open_body["bill_refunds"] == pytest.approx(0.00)
    assert open_body["bill_purchases"] - open_body["bill_refunds"] == pytest.approx(
        open_body["projected_expenses"]
    )
    assert open_body["projected_expenses"] == pytest.approx(57.00)


@pytest.mark.asyncio
async def test_bill_composition_null_for_non_credit_card(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user,
):
    today = app_today()
    account = await _account(session, test_user.id, acc_type="checking", currency="USD")
    await _txn(session, test_user.id, account.id, "100.00", "debit", today, currency="USD")
    await _txn(session, test_user.id, account.id, "30.00", "credit", today, currency="USD")

    response = await client.get(f"/api/accounts/{account.id}/summary", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["bill_purchases"] is None
    assert body["bill_refunds"] is None
    assert body["bill_purchases_primary"] is None
    assert body["bill_refunds_primary"] is None


@pytest.mark.asyncio
async def test_bill_composition_primary_converted_like_other_primary(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user,
):
    today = app_today()
    session.add(
        FxRate(
            base_currency="USD",
            quote_currency="BRL",
            date=today,
            rate=Decimal("5"),
            source="test",
        )
    )
    await session.commit()

    account = await _account(session, test_user.id, acc_type="credit_card", currency="USD")
    await _txn(session, test_user.id, account.id, "100.00", "debit", today, currency="USD")
    await _txn(session, test_user.id, account.id, "20.00", "credit", today, currency="USD")

    response = await client.get(
        f"/api/accounts/{account.id}/summary",
        headers=auth_headers,
        params={"from": (today - timedelta(days=1)).isoformat(), "to": today.isoformat()},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["bill_purchases"] == pytest.approx(100.00)
    assert body["bill_refunds"] == pytest.approx(20.00)
    assert body["bill_purchases_primary"] == pytest.approx(500.00)
    assert body["bill_refunds_primary"] == pytest.approx(100.00)
    native_rate = body["projected_expenses_primary"] / body["projected_expenses"]
    assert body["bill_purchases_primary"] / body["bill_purchases"] == pytest.approx(native_rate)
    assert body["bill_refunds_primary"] / body["bill_refunds"] == pytest.approx(native_rate)
    assert body["projected_expenses"] == pytest.approx(80.00)
    assert body["projected_expenses_primary"] == pytest.approx(400.00)
