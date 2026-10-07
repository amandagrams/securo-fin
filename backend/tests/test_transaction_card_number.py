"""`card_number` na leitura do lançamento (.checks/fatura-por-cartao.md C1, C2).

O valor vem de `raw_data.creditCardMetadata.cardNumber` — o cartão adicional
ou virtual que fez o gasto. Texto, sem truncar, zero à esquerda preservado;
metadata ausente, nula, campo ausente ou vazio leem como null.
"""
import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User


async def _make_tx(session: AsyncSession, user: User, account: Account, raw_data) -> Transaction:
    tx = Transaction(
        id=uuid.uuid4(),
        user_id=user.id,
        account_id=account.id,
        description="COMPRA TESTE",
        amount=Decimal("10.00"),
        date=date.today(),
        type="debit",
        source="sync",
        raw_data=raw_data,
    )
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx


async def test_card_number_from_raw_data_in_list_and_detail(
    client: AsyncClient,
    session: AsyncSession,
    test_user: User,
    test_account: Account,
    auth_headers: dict,
):
    """C1: cardNumber '0597' sai como card_number '0597' — string com o zero
    à esquerda — tanto na lista quanto no detalhe."""
    tx = await _make_tx(
        session, test_user, test_account,
        {"creditCardMetadata": {"cardNumber": "0597"}},
    )

    listed = await client.get("/api/transactions", headers=auth_headers)
    assert listed.status_code == 200
    rows = {item["id"]: item for item in listed.json()["items"]}
    assert rows[str(tx.id)]["card_number"] == "0597"

    detail = await client.get(f"/api/transactions/{tx.id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["card_number"] == "0597"


@pytest.mark.parametrize(
    "raw_data",
    [
        {"category": "Food"},  # creditCardMetadata ausente
        {"creditCardMetadata": None},  # metadata nula
        {"creditCardMetadata": {"totalInstallments": 3}},  # cardNumber ausente
        {"creditCardMetadata": {"cardNumber": ""}},  # cardNumber vazio
    ],
    ids=["metadata-missing", "metadata-null", "cardNumber-missing", "cardNumber-empty"],
)
async def test_card_number_null_variants(
    client: AsyncClient,
    session: AsyncSession,
    test_user: User,
    test_account: Account,
    auth_headers: dict,
    raw_data,
):
    """C2: cada variante sem cartão lê card_number null nas duas leituras."""
    tx = await _make_tx(session, test_user, test_account, raw_data)

    listed = await client.get("/api/transactions", headers=auth_headers)
    assert listed.status_code == 200
    rows = {item["id"]: item for item in listed.json()["items"]}
    assert rows[str(tx.id)]["card_number"] is None

    detail = await client.get(f"/api/transactions/{tx.id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["card_number"] is None
