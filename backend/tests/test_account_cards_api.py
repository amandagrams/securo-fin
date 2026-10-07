"""Fatura por cartão — identidade do cartão e nomes (.tasks/fatura-por-cartao.md).

Covers the backend half of the checklist in `.checks/fatura-por-cartao.md`:
`card_number` on the transaction reads (C1-C2) and the card-name routes
`GET/PUT /api/accounts/{account_id}/cards` (C13-C23). Every test crosses the
HTTP boundary except the ones whose claim is about the table itself (the
unique constraint, the sync path).
"""
import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import bcrypt
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.account_card import AccountCard
from app.models.bank_connection import BankConnection
from app.models.transaction import Transaction
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.providers.base import AccountData, TransactionData


async def _make_account(
    session: AsyncSession,
    user: User,
    workspace_id: uuid.UUID,
    *,
    masked_number: str | None = "1234",
    type_: str = "credit_card",
) -> Account:
    account = Account(
        id=uuid.uuid4(),
        user_id=user.id,
        workspace_id=workspace_id,
        name="Cartão Gold",
        type=type_,
        masked_number=masked_number,
        balance=Decimal("0.00"),
        currency="BRL",
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def _make_tx(
    session: AsyncSession,
    user: User,
    account: Account,
    *,
    raw_data: dict | None,
    amount: str = "10.00",
) -> Transaction:
    tx = Transaction(
        id=uuid.uuid4(),
        user_id=user.id,
        workspace_id=account.workspace_id,
        account_id=account.id,
        description="COMPRA",
        amount=Decimal(amount),
        currency="BRL",
        date=date.today(),
        type="debit",
        source="sync",
        raw_data=raw_data,
    )
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx


def _card_raw(card_number: str) -> dict:
    return {"creditCardMetadata": {"cardNumber": card_number}}


async def _card_rows(session: AsyncSession, account_id: uuid.UUID) -> list[AccountCard]:
    result = await session.execute(
        select(AccountCard).where(AccountCard.account_id == account_id)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# C1-C2 — card_number na leitura do lançamento
# ---------------------------------------------------------------------------


async def test_card_number_read_from_raw_data(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C1: cardNumber `0597` no raw_data aparece como card_number nas duas leituras."""
    account = await _make_account(session, test_user, test_workspace.id)
    tx = await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))

    listed = await client.get(
        "/api/transactions", params={"account_id": str(account.id)}, headers=auth_headers
    )
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert [i["card_number"] for i in items if i["id"] == str(tx.id)] == ["0597"]

    detail = await client.get(f"/api/transactions/{tx.id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["card_number"] == "0597"


@pytest.mark.parametrize(
    "raw_data",
    [
        None,
        {"creditCardMetadata": None},
        {"creditCardMetadata": {}},
        {"creditCardMetadata": {"cardNumber": ""}},
    ],
    ids=["no-raw-data", "metadata-null", "cardNumber-missing", "cardNumber-empty"],
)
async def test_card_number_null_variants_and_leading_zero(
    client: AsyncClient, auth_headers, session, test_user, test_workspace, raw_data
):
    """C2: metadata ausente/null, cardNumber ausente/"" → null nas duas leituras.
    O valor `0597` conserva o zero à esquerda (string, nunca inteiro)."""
    account = await _make_account(session, test_user, test_workspace.id)
    tx = await _make_tx(session, test_user, account, raw_data=raw_data)
    with_zero = await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))

    listed = await client.get(
        "/api/transactions", params={"account_id": str(account.id)}, headers=auth_headers
    )
    assert listed.status_code == 200
    by_id = {i["id"]: i["card_number"] for i in listed.json()["items"]}
    assert by_id[str(tx.id)] is None
    assert by_id[str(with_zero.id)] == "0597"

    detail = await client.get(f"/api/transactions/{tx.id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["card_number"] is None


# ---------------------------------------------------------------------------
# C13 — GET /api/accounts/{id}/cards
# ---------------------------------------------------------------------------


async def test_list_cards_one_item_per_distinct_card_in_order(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C13: um item por card_number distinto, na ordem do C7 (masked_number
    primeiro, depois lexicográfica); lançamento sem card_number não gera item.
    Dois lançamentos do mesmo cartão geram um item só."""
    account = await _make_account(session, test_user, test_workspace.id, masked_number="1234")
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))
    await _make_tx(session, test_user, account, raw_data=_card_raw("1234"))
    await _make_tx(session, test_user, account, raw_data=None)

    resp = await client.get(f"/api/accounts/{account.id}/cards", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == [
        {"card_number": "1234", "name": None},
        {"card_number": "0597", "name": None},
    ]


# ---------------------------------------------------------------------------
# C14-C17 — PUT /api/accounts/{id}/cards/{card_number}
# ---------------------------------------------------------------------------


async def test_put_name_returns_it_and_get_lists_it(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C14 (backend): PUT grava o nome e o GET passa a devolvê-lo."""
    account = await _make_account(session, test_user, test_workspace.id)
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))

    resp = await client.put(
        f"/api/accounts/{account.id}/cards/0597",
        json={"name": "Amanda"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == {"card_number": "0597", "name": "Amanda"}

    listed = await client.get(f"/api/accounts/{account.id}/cards", headers=auth_headers)
    assert listed.status_code == 200
    assert {"card_number": "0597", "name": "Amanda"} in listed.json()


async def test_put_blank_name_clears_to_null(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C15: `""` e `"   "` limpam o nome para null, com 200."""
    account = await _make_account(session, test_user, test_workspace.id)
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))
    url = f"/api/accounts/{account.id}/cards/0597"

    first = await client.put(url, json={"name": "Amanda"}, headers=auth_headers)
    assert first.status_code == 200

    for blank in ("", "   "):
        resp = await client.put(url, json={"name": blank}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"card_number": "0597", "name": None}
        listed = await client.get(
            f"/api/accounts/{account.id}/cards", headers=auth_headers
        )
        assert {"card_number": "0597", "name": None} in listed.json()


async def test_put_name_256_chars_is_422_and_whitespace_is_trimmed(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C16: 256 caracteres → 422 e nada gravado; `"  Amanda  "` grava `Amanda`."""
    account = await _make_account(session, test_user, test_workspace.id)
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))
    url = f"/api/accounts/{account.id}/cards/0597"

    too_long = await client.put(url, json={"name": "x" * 256}, headers=auth_headers)
    assert too_long.status_code == 422
    assert await _card_rows(session, account.id) == []

    trimmed = await client.put(url, json={"name": "  Amanda  "}, headers=auth_headers)
    assert trimmed.status_code == 200
    assert trimmed.json() == {"card_number": "0597", "name": "Amanda"}


async def test_put_unknown_card_is_404(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C17: card_number que não aparece em lançamento da conta → 404, nada gravado."""
    account = await _make_account(session, test_user, test_workspace.id)
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))

    resp = await client.put(
        f"/api/accounts/{account.id}/cards/9999",
        json={"name": "Amanda"},
        headers=auth_headers,
    )
    assert resp.status_code == 404
    assert await _card_rows(session, account.id) == []


# ---------------------------------------------------------------------------
# C18-C19 — autorização
# ---------------------------------------------------------------------------


async def test_other_workspace_account_is_404(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C18: conta de outro workspace → GET e PUT respondem 404."""
    other = User(
        id=uuid.uuid4(),
        email="other-ws@example.com",
        hashed_password=bcrypt.hashpw(b"otherpass123", bcrypt.gensalt()).decode(),
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(other)
    await session.flush()
    other_ws = Workspace(
        id=uuid.uuid4(), name="Outro", kind="personal", created_by_user_id=other.id
    )
    session.add(other_ws)
    await session.flush()
    session.add(
        WorkspaceMember(
            id=uuid.uuid4(), workspace_id=other_ws.id, user_id=other.id, role="owner"
        )
    )
    await session.commit()

    foreign = await _make_account(session, other, other_ws.id)
    await _make_tx(session, other, foreign, raw_data=_card_raw("0597"))

    listed = await client.get(f"/api/accounts/{foreign.id}/cards", headers=auth_headers)
    assert listed.status_code == 404

    put = await client.put(
        f"/api/accounts/{foreign.id}/cards/0597",
        json={"name": "Amanda"},
        headers=auth_headers,
    )
    assert put.status_code == 404
    assert await _card_rows(session, foreign.id) == []


async def test_viewer_put_403_get_200(
    client: AsyncClient, auth_headers, viewer_auth_headers, session, test_user, test_workspace
):
    """C19 (backend): membro sem escrita leva 403 no PUT (nada gravado) e 200 no GET."""
    account = await _make_account(session, test_user, test_workspace.id)
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))

    put = await client.put(
        f"/api/accounts/{account.id}/cards/0597",
        json={"name": "Amanda"},
        headers=viewer_auth_headers,
    )
    assert put.status_code == 403
    assert await _card_rows(session, account.id) == []

    listed = await client.get(
        f"/api/accounts/{account.id}/cards", headers=viewer_auth_headers
    )
    assert listed.status_code == 200
    assert listed.json() == [{"card_number": "0597", "name": None}]


# ---------------------------------------------------------------------------
# C20-C21 — idempotência e concorrência
# ---------------------------------------------------------------------------


async def test_same_put_twice_is_idempotent_single_row(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C20: o mesmo PUT duas vezes → dois 200 e exatamente uma linha."""
    account = await _make_account(session, test_user, test_workspace.id)
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))
    url = f"/api/accounts/{account.id}/cards/0597"

    for _ in range(2):
        resp = await client.put(url, json={"name": "Amanda"}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"card_number": "0597", "name": "Amanda"}

    rows = await _card_rows(session, account.id)
    assert len(rows) == 1
    assert rows[0].name == "Amanda"


async def test_concurrent_puts_no_500_single_row_last_write_wins(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C21: dois PUTs disparados juntos → nenhum 500, uma linha só, e o nome
    é um dos dois (o último a gravar vence)."""
    account = await _make_account(session, test_user, test_workspace.id)
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))
    url = f"/api/accounts/{account.id}/cards/0597"

    responses = await asyncio.gather(
        client.put(url, json={"name": "Amanda"}, headers=auth_headers),
        client.put(url, json={"name": "Bruno"}, headers=auth_headers),
    )
    assert [r.status_code for r in responses] == [200, 200]

    rows = await _card_rows(session, account.id)
    assert len(rows) == 1
    assert rows[0].name in {"Amanda", "Bruno"}


async def test_duplicate_insert_violates_unique_constraint(
    session, test_user, test_workspace
):
    """C21 (mecanismo): a unicidade de (account_id, card_number) é o que
    garante a linha única — uma segunda inserção direta do mesmo par falha."""
    account = await _make_account(session, test_user, test_workspace.id)

    def _row() -> AccountCard:
        return AccountCard(
            id=uuid.uuid4(),
            user_id=test_user.id,
            workspace_id=test_workspace.id,
            account_id=account.id,
            card_number="0597",
            name="Amanda",
        )

    session.add(_row())
    await session.commit()
    session.add(_row())
    with pytest.raises(IntegrityError):
        await session.commit()
    await session.rollback()


# ---------------------------------------------------------------------------
# C22 — ciclo de vida
# ---------------------------------------------------------------------------


async def test_account_delete_removes_card_rows(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C22: apagar a conta leva junto as linhas de account_cards."""
    account = await _make_account(session, test_user, test_workspace.id)
    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))
    put = await client.put(
        f"/api/accounts/{account.id}/cards/0597",
        json={"name": "Amanda"},
        headers=auth_headers,
    )
    assert put.status_code == 200

    deleted = await client.delete(f"/api/accounts/{account.id}", headers=auth_headers)
    assert deleted.status_code == 204
    assert await _card_rows(session, account.id) == []


async def test_card_row_survives_transaction_absence_and_name_returns(
    client: AsyncClient, auth_headers, session, test_user, test_workspace
):
    """C22: cartão que sai dos lançamentos some da lista mas conserva a linha,
    e volta com o nome quando o cartão reaparece."""
    account = await _make_account(session, test_user, test_workspace.id)
    tx = await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))
    put = await client.put(
        f"/api/accounts/{account.id}/cards/0597",
        json={"name": "Amanda"},
        headers=auth_headers,
    )
    assert put.status_code == 200

    await session.delete(tx)
    await session.commit()

    listed = await client.get(f"/api/accounts/{account.id}/cards", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json() == []
    rows = await _card_rows(session, account.id)
    assert len(rows) == 1 and rows[0].name == "Amanda"

    await _make_tx(session, test_user, account, raw_data=_card_raw("0597"))
    listed = await client.get(f"/api/accounts/{account.id}/cards", headers=auth_headers)
    assert listed.json() == [{"card_number": "0597", "name": "Amanda"}]


# ---------------------------------------------------------------------------
# C23 — o sync nunca escreve em account_cards
# ---------------------------------------------------------------------------


async def test_sync_upsert_does_not_touch_card_names(
    session, test_user, test_workspace
):
    """C23: uma sincronização real (provider mockado) escreve em transactions
    e accounts, e a linha nomeada de account_cards fica intacta."""
    from app.services.connection_service import sync_connection

    conn = BankConnection(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=test_workspace.id,
        provider="test",
        external_id="conn-cards",
        institution_name="Banco",
        credentials={"token": "fake"},
        status="active",
        last_sync_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    )
    session.add(conn)
    await session.commit()

    def _provider(tx_external_id: str) -> AsyncMock:
        provider = AsyncMock()
        provider.refresh_credentials = AsyncMock(return_value={"token": "t"})
        provider.get_accounts = AsyncMock(return_value=[
            AccountData(
                external_id="cc-1",
                name="Cartão",
                type="credit_card",
                balance=Decimal("100"),
                currency="BRL",
                masked_number="1234",
            )
        ])
        provider.get_transactions = AsyncMock(return_value=[
            TransactionData(
                external_id=tx_external_id,
                description="COMPRA ADICIONAL",
                amount=Decimal("40"),
                date=date.today(),
                type="debit",
                currency="BRL",
                raw_data=_card_raw("0597"),
            )
        ])
        provider.get_holdings = AsyncMock(return_value=[])
        provider.get_bills = AsyncMock(return_value=[])
        return provider

    def _patches(provider):
        return (
            patch("app.services.connection_service.get_provider", return_value=provider),
            patch("app.services.connection_service.detect_transfer_pairs", new_callable=AsyncMock),
            patch("app.services.connection_service.stamp_primary_amount", new_callable=AsyncMock),
            patch("app.services.connection_service.apply_rules_to_transaction", new_callable=AsyncMock),
        )

    p1, p2, p3, p4 = _patches(_provider("tx-1"))
    with p1, p2, p3, p4:
        await sync_connection(session, conn.id, test_workspace.id, test_user.id)

    account = await session.scalar(select(Account).where(Account.external_id == "cc-1"))
    assert account is not None
    account_id = account.id

    from app.services.account_service import upsert_account_card

    named = await upsert_account_card(
        session, account_id, test_workspace.id, test_user.id, "0597", "Amanda"
    )
    assert named == {"card_number": "0597", "name": "Amanda"}

    q1, q2, q3, q4 = _patches(_provider("tx-2"))
    with q1, q2, q3, q4:
        await sync_connection(session, conn.id, test_workspace.id, test_user.id)

    rows = await _card_rows(session, account_id)
    assert len(rows) == 1
    assert rows[0].name == "Amanda"
    tx_count = await session.scalar(
        select(Transaction.id).where(Transaction.account_id == account_id).limit(1)
    )
    assert tx_count is not None
