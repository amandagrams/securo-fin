"""Conta corrente que paga a fatura do cartão (.checks/saldo-da-conta-no-mes.md, S1).

POST de cartão novo exige `payment_account_id` de uma checking aberta deste
workspace. Cartão que já existe, inclusive o que o sync criou, pode ficar
null. Apagar a checking zera o ponteiro e conserva o cartão.
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_clock import app_today
from app.models.account import Account
from app.models.bank_connection import BankConnection
from app.models.transaction import Transaction
from app.models.workspace import Workspace
from app.providers.base import AccountData
from app.services.connection_service import sync_connection
from app.services.credit_card_service import compute_effective_date


async def _names(client: AsyncClient, headers: dict) -> set[str]:
    response = await client.get("/api/accounts", headers=headers)
    assert response.status_code == 200, response.text
    return {row["name"] for row in response.json()}


async def _create(client: AsyncClient, headers: dict, payload: dict) -> object:
    return await client.post("/api/accounts", headers=headers, json=payload)


async def _checking(client: AsyncClient, headers: dict, name: str = "Conta") -> str:
    response = await _create(
        client, headers,
        {"name": name, "type": "checking", "balance": "0.00", "currency": "BRL"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.asyncio
async def test_create_credit_card_requires_payment_account(client: AsyncClient, auth_headers):
    """C1: cartão sem payment_account_id é 422 e não grava conta nova."""
    await _checking(client, auth_headers)
    before = await _names(client, auth_headers)

    response = await _create(
        client, auth_headers,
        {"name": "Nubank", "type": "credit_card", "balance": "0.00", "currency": "BRL"},
    )

    assert response.status_code == 422
    assert await _names(client, auth_headers) == before


@pytest.mark.asyncio
async def test_create_credit_card_returns_payment_account(client: AsyncClient, auth_headers):
    """C2: cartão criado com a Conta devolve esse id no POST e no GET."""
    conta_id = await _checking(client, auth_headers)

    created = await _create(
        client, auth_headers,
        {
            "name": "Nubank",
            "type": "credit_card",
            "balance": "0.00",
            "currency": "BRL",
            "payment_account_id": conta_id,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["payment_account_id"] == conta_id

    fetched = await client.get(f"/api/accounts/{created.json()['id']}", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.json()["payment_account_id"] == conta_id


@pytest.mark.asyncio
async def test_invalid_payment_account_in_workspace_is_422(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C3: savings, outro cartão e checking fechada, no workspace, são 422."""
    conta_id = await _checking(client, auth_headers)
    savings = await _create(
        client, auth_headers,
        {"name": "Poupança", "type": "savings", "balance": "0.00", "currency": "BRL"},
    )
    assert savings.status_code == 201, savings.text
    other_card = await _create(
        client, auth_headers,
        {
            "name": "Outro cartão",
            "type": "credit_card",
            "balance": "0.00",
            "currency": "BRL",
            "payment_account_id": conta_id,
        },
    )
    assert other_card.status_code == 201, other_card.text
    closed = await _create(
        client, auth_headers,
        {"name": "Fechada", "type": "checking", "balance": "0.00", "currency": "BRL"},
    )
    assert closed.status_code == 201, closed.text
    closed_id = closed.json()["id"]
    closing = await client.post(f"/api/accounts/{closed_id}/close", headers=auth_headers)
    assert closing.status_code == 200, closing.text

    before = await _names(client, auth_headers)
    for target_id in (savings.json()["id"], other_card.json()["id"], closed_id):
        response = await _create(
            client, auth_headers,
            {
                "name": f"Recusado {target_id[:8]}",
                "type": "credit_card",
                "balance": "0.00",
                "currency": "BRL",
                "payment_account_id": target_id,
            },
        )
        assert response.status_code == 422, response.text
    assert await _names(client, auth_headers) == before
    assert test_user.id  # the closed account belongs to this workspace's user


@pytest.mark.asyncio
async def test_payment_account_in_other_workspace_is_404(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C4: alvo de outro workspace é 404 e o cartão não é gravado."""
    await _checking(client, auth_headers)
    other = Workspace(id=uuid.uuid4(), name="Alheio", created_by_user_id=test_user.id)
    session.add(other)
    await session.flush()
    foreign = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=other.id,
        name="Checking alheia",
        type="checking",
        balance=Decimal("0.00"),
        currency="BRL",
    )
    session.add(foreign)
    await session.commit()
    before = await _names(client, auth_headers)

    response = await _create(
        client, auth_headers,
        {
            "name": "Nubank alheio",
            "type": "credit_card",
            "balance": "0.00",
            "currency": "BRL",
            "payment_account_id": str(foreign.id),
        },
    )

    assert response.status_code == 404, response.text
    assert await _names(client, auth_headers) == before


@pytest.mark.asyncio
async def test_patch_payment_account_on_existing_and_synced_card(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user, test_workspace,
):
    """C5: cartão existente e o que o sync criou nascem null, o PATCH grava e limpa,
    e um sync seguinte não inventa nem apaga o vínculo."""
    conta_id = await _checking(client, auth_headers)
    manual = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        name="Cartão manual",
        type="credit_card",
        balance=Decimal("0.00"),
        currency="BRL",
        payment_account_id=None,
    )
    session.add(manual)
    await session.commit()

    untouched = await client.get(f"/api/accounts/{manual.id}", headers=auth_headers)
    assert untouched.status_code == 200
    assert untouched.json()["payment_account_id"] is None

    linked = await client.patch(
        f"/api/accounts/{manual.id}",
        headers=auth_headers,
        json={"payment_account_id": conta_id},
    )
    assert linked.status_code == 200, linked.text
    assert linked.json()["payment_account_id"] == conta_id
    again = await client.get(f"/api/accounts/{manual.id}", headers=auth_headers)
    assert again.json()["payment_account_id"] == conta_id

    cleared = await client.patch(
        f"/api/accounts/{manual.id}",
        headers=auth_headers,
        json={"payment_account_id": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["payment_account_id"] is None

    conn = BankConnection(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=test_workspace.id,
        provider="test",
        external_id=f"ext-{uuid.uuid4().hex[:8]}",
        institution_name="Banco",
        credentials={"token": "fake"},
        status="active",
        last_sync_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    )
    session.add(conn)
    await session.commit()
    provider = AsyncMock()
    provider.refresh_credentials = AsyncMock(return_value={"token": "t"})
    provider.get_accounts = AsyncMock(return_value=[
        AccountData(
            external_id="cc-sync", name="Cartão sync", type="credit_card",
            balance=Decimal("0"), currency="BRL",
        )
    ])
    provider.get_transactions = AsyncMock(return_value=[])
    provider.get_bills = AsyncMock(return_value=[])
    silence = (
        patch("app.services.connection_service.detect_transfer_pairs", new_callable=AsyncMock),
        patch("app.services.connection_service.stamp_primary_amount", new_callable=AsyncMock),
        patch("app.services.connection_service.apply_rules_to_transaction", new_callable=AsyncMock),
    )
    with patch("app.services.connection_service.get_provider", return_value=provider), *silence:
        await sync_connection(session, conn.id, test_workspace.id, test_user.id)

    synced = (await session.execute(
        select(Account).where(Account.external_id == "cc-sync")
    )).scalar_one()
    assert synced.payment_account_id is None

    patched = await client.patch(
        f"/api/accounts/{synced.id}",
        headers=auth_headers,
        json={"payment_account_id": conta_id},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["payment_account_id"] == conta_id

    session.expire_all()
    with patch("app.services.connection_service.get_provider", return_value=provider), *silence:
        await sync_connection(session, conn.id, test_workspace.id, test_user.id)

    refetched = await client.get(f"/api/accounts/{synced.id}", headers=auth_headers)
    assert refetched.status_code == 200
    assert refetched.json()["payment_account_id"] == conta_id


@pytest.mark.asyncio
async def test_null_payment_account_does_not_move_checking_calendar(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C6: com o ponteiro null, a fatura do cartão não mexe no calendário da Conta."""
    today = app_today()
    due = date_on_day(today, 28)
    conta = Account(
        id=uuid.uuid4(), user_id=test_user.id, name="Conta", type="checking",
        balance=Decimal("1000.00"), currency="BRL",
    )
    card = Account(
        id=uuid.uuid4(), user_id=test_user.id, name="Nubank", type="credit_card",
        balance=Decimal("0.00"), currency="BRL",
        statement_close_day=20, payment_due_day=28, payment_account_id=None,
    )
    session.add_all([conta, card])
    await session.flush()
    session.add_all([
        Transaction(
            id=uuid.uuid4(), user_id=test_user.id, account_id=conta.id,
            description="Saldo inicial", amount=Decimal("1000.00"), currency="BRL",
            date=today - timedelta(days=400), type="credit", source="opening_balance",
            status="posted",
        ),
        Transaction(
            id=uuid.uuid4(), user_id=test_user.id, account_id=card.id,
            description="Compra", amount=Decimal("250.00"), currency="BRL",
            date=due.replace(day=5), type="debit", source="manual", status="posted",
        ),
    ])
    await session.commit()
    assert compute_effective_date(due.replace(day=5), 20, 28) == due

    response = await client.get(
        "/api/transactions/calendar",
        headers=auth_headers,
        params={"month": due.replace(day=1).isoformat(), "account_id": str(conta.id)},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["actual_balance"] == 1000.0
    assert {day["ending_balance"] for day in body["days"]} == {1000.0}
    assert all(
        item["description"] != "Nubank"
        for day in body["days"] for item in day["items"]
    )


@pytest.mark.asyncio
async def test_delete_checking_nulls_payment_account_keeps_card(
    client: AsyncClient, auth_headers,
):
    """C7: apagar a checking não apaga o cartão; o ponteiro fica null."""
    conta_id = await _checking(client, auth_headers)
    created = await _create(
        client, auth_headers,
        {
            "name": "Nubank",
            "type": "credit_card",
            "balance": "0.00",
            "currency": "BRL",
            "payment_account_id": conta_id,
        },
    )
    assert created.status_code == 201, created.text
    card_id = created.json()["id"]

    deleted = await client.delete(f"/api/accounts/{conta_id}", headers=auth_headers)
    assert deleted.status_code == 204, deleted.text

    fetched = await client.get(f"/api/accounts/{card_id}", headers=auth_headers)
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["name"] == "Nubank"
    assert fetched.json()["payment_account_id"] is None


def date_on_day(anchor, day: int):
    """A date with this day-of-month, this month when it is still ahead, else next month."""
    from datetime import date

    candidate = date(anchor.year, anchor.month, day)
    if candidate <= anchor:
        if anchor.month == 12:
            return date(anchor.year + 1, 1, day)
        return date(anchor.year, anchor.month + 1, day)
    return candidate
