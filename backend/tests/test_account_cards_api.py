"""Nome do cartão por conta (.checks/fatura-por-cartao.md, fatia S3).

`GET /api/accounts/{id}/cards` lista um item por `card_number` distinto visto
nos lançamentos da conta; `PUT /api/accounts/{id}/cards/{card_number}` é um
upsert do nome, chaveado por `(account_id, card_number)`. A lista é o que a
fatura viu: cartão nunca visto não pode ser nomeado.
"""
import asyncio
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from tests.conftest import TestSessionLocal
from app.models.account import Account
from app.models.account_card import AccountCard
from app.models.transaction import Transaction
from app.models.user import User
from app.models.workspace import Workspace


@pytest_asyncio.fixture
async def cc_account(session: AsyncSession, test_user: User) -> Account:
    """Conta de cartão manual (sem connection_id, então pode ser apagada)."""
    account = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        name="Cartão Roxo",
        type="credit_card",
        balance=Decimal("0.00"),
        currency="BRL",
        masked_number="1234",
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def _add_card_tx(
    session: AsyncSession,
    user: User,
    account: Account,
    card_number: str | None,
    amount: str = "10.00",
) -> Transaction:
    raw = {"creditCardMetadata": {"cardNumber": card_number}} if card_number else {}
    tx = Transaction(
        id=uuid.uuid4(),
        user_id=user.id,
        account_id=account.id,
        description=f"COMPRA {card_number or 'SEM CARTAO'}",
        amount=Decimal(amount),
        date=date.today(),
        type="debit",
        source="sync",
        raw_data=raw,
    )
    session.add(tx)
    await session.commit()
    return tx


async def _card_rows(session: AsyncSession, account_id: uuid.UUID) -> list[AccountCard]:
    result = await session.execute(
        select(AccountCard).where(AccountCard.account_id == account_id)
    )
    return list(result.scalars().all())


async def test_list_cards_distinct_ordered_with_names(
    client: AsyncClient, session: AsyncSession, test_user, cc_account, auth_headers,
):
    """C18: um item por card_number distinto, com name, na ordem do critério 7;
    lançamento sem card_number não gera item."""
    await _add_card_tx(session, test_user, cc_account, "0597")
    await _add_card_tx(session, test_user, cc_account, "0597")  # mesmo cartão, um item
    await _add_card_tx(session, test_user, cc_account, "1234")
    await _add_card_tx(session, test_user, cc_account, None)  # sem cartão: sem item

    response = await client.get(f"/api/accounts/{cc_account.id}/cards", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    # `1234` é o masked_number da conta e vem primeiro; cada item traz name.
    assert body == [
        {"card_number": "1234", "name": None},
        {"card_number": "0597", "name": None},
    ]


async def test_put_card_name_returns_saved_name(
    client: AsyncClient, session: AsyncSession, test_user, cc_account, auth_headers,
):
    """C19: PUT {"name": "Amanda"} responde 200 com card_number e name."""
    await _add_card_tx(session, test_user, cc_account, "0597")

    response = await client.put(
        f"/api/accounts/{cc_account.id}/cards/0597",
        json={"name": "Amanda"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json() == {"card_number": "0597", "name": "Amanda"}


async def test_put_blank_name_clears_to_null(
    client: AsyncClient, session: AsyncSession, test_user, cc_account, auth_headers,
):
    """C21: nome em branco ou só espaços limpa para null, e o GET mantém o
    item com name null."""
    await _add_card_tx(session, test_user, cc_account, "0597")
    first = await client.put(
        f"/api/accounts/{cc_account.id}/cards/0597",
        json={"name": "Amanda"},
        headers=auth_headers,
    )
    assert first.status_code == 200

    for blank in ("", "   "):
        response = await client.put(
            f"/api/accounts/{cc_account.id}/cards/0597",
            json={"name": blank},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == {"card_number": "0597", "name": None}

    listed = await client.get(f"/api/accounts/{cc_account.id}/cards", headers=auth_headers)
    assert listed.status_code == 200
    assert {"card_number": "0597", "name": None} in listed.json()


async def test_put_name_length_and_trim(
    client: AsyncClient, session: AsyncSession, test_user, cc_account, auth_headers,
):
    """C23: 256 caracteres é 422 e nada é gravado; espaços em volta são
    aparados ("  Amanda  " grava e devolve "Amanda")."""
    await _add_card_tx(session, test_user, cc_account, "0597")

    too_long = await client.put(
        f"/api/accounts/{cc_account.id}/cards/0597",
        json={"name": "x" * 256},
        headers=auth_headers,
    )
    assert too_long.status_code == 422
    assert await _card_rows(session, cc_account.id) == []

    trimmed = await client.put(
        f"/api/accounts/{cc_account.id}/cards/0597",
        json={"name": "  Amanda  "},
        headers=auth_headers,
    )
    assert trimmed.status_code == 200
    assert trimmed.json() == {"card_number": "0597", "name": "Amanda"}
    rows = await _card_rows(session, cc_account.id)
    assert len(rows) == 1 and rows[0].name == "Amanda"


async def test_put_unknown_card_number_404(
    client: AsyncClient, session: AsyncSession, test_user, cc_account, auth_headers,
):
    """C24: card_number que não aparece em lançamento nenhum da conta é 404
    e nada é gravado."""
    await _add_card_tx(session, test_user, cc_account, "0597")

    response = await client.put(
        f"/api/accounts/{cc_account.id}/cards/9999",
        json={"name": "Amanda"},
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert await _card_rows(session, cc_account.id) == []


async def test_other_workspace_404(
    client: AsyncClient, session: AsyncSession, test_user, auth_headers,
):
    """C25: conta de outro workspace responde 404 no GET e no PUT."""
    other_ws = Workspace(id=uuid.uuid4(), name="Other", created_by_user_id=test_user.id)
    session.add(other_ws)
    await session.flush()
    foreign = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=other_ws.id,
        name="Cartão Alheio",
        type="credit_card",
        balance=Decimal("0.00"),
        currency="BRL",
    )
    session.add(foreign)
    await session.commit()
    await _add_card_tx(session, test_user, foreign, "0597")

    listed = await client.get(f"/api/accounts/{foreign.id}/cards", headers=auth_headers)
    assert listed.status_code == 404

    renamed = await client.put(
        f"/api/accounts/{foreign.id}/cards/0597",
        json={"name": "Amanda"},
        headers=auth_headers,
    )
    assert renamed.status_code == 404


async def test_viewer_put_403_get_200(
    client: AsyncClient, session: AsyncSession, test_user, cc_account,
    auth_headers, viewer_auth_headers,
):
    """C26: membro viewer lê (200) mas não escreve (403), e nada é gravado."""
    await _add_card_tx(session, test_user, cc_account, "0597")

    denied = await client.put(
        f"/api/accounts/{cc_account.id}/cards/0597",
        json={"name": "Amanda"},
        headers=viewer_auth_headers,
    )
    assert denied.status_code == 403
    assert await _card_rows(session, cc_account.id) == []

    listed = await client.get(
        f"/api/accounts/{cc_account.id}/cards", headers=viewer_auth_headers
    )
    assert listed.status_code == 200


async def test_put_is_idempotent_single_row(
    client: AsyncClient, session: AsyncSession, test_user, cc_account, auth_headers,
):
    """C28: o mesmo PUT duas vezes responde 200 duas vezes e deixa exatamente
    uma linha para (account_id, card_number)."""
    await _add_card_tx(session, test_user, cc_account, "0597")

    for _ in range(2):
        response = await client.put(
            f"/api/accounts/{cc_account.id}/cards/0597",
            json={"name": "Amanda"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Amanda"

    count = await session.scalar(
        select(func.count()).select_from(AccountCard).where(
            AccountCard.account_id == cc_account.id,
            AccountCard.card_number == "0597",
        )
    )
    assert count == 1


async def test_concurrent_puts_no_500_single_row(
    session: AsyncSession, test_user, cc_account, auth_headers,
):
    """C29: dois PUT simultâneos não respondem 500, deixam uma linha só, e o
    name é o de um dos dois — o último a gravar vence."""
    await _add_card_tx(session, test_user, cc_account, "0597")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as first, \
            AsyncClient(transport=transport, base_url="http://test") as second:
        responses = await asyncio.gather(
            first.put(
                f"/api/accounts/{cc_account.id}/cards/0597",
                json={"name": "Amanda"},
                headers=auth_headers,
            ),
            second.put(
                f"/api/accounts/{cc_account.id}/cards/0597",
                json={"name": "Bruno"},
                headers=auth_headers,
            ),
        )

    assert all(r.status_code != 500 for r in responses)
    assert all(r.status_code == 200 for r in responses)
    rows = await _card_rows(session, cc_account.id)
    assert len(rows) == 1
    assert rows[0].name in ("Amanda", "Bruno")


async def test_account_delete_removes_cards(
    client: AsyncClient, session: AsyncSession, test_user, cc_account, auth_headers,
):
    """C30: apagar a conta remove as linhas de account_cards daquela conta."""
    await _add_card_tx(session, test_user, cc_account, "0597")
    named = await client.put(
        f"/api/accounts/{cc_account.id}/cards/0597",
        json={"name": "Amanda"},
        headers=auth_headers,
    )
    assert named.status_code == 200

    deleted = await client.delete(f"/api/accounts/{cc_account.id}", headers=auth_headers)
    assert deleted.status_code == 204
    assert await _card_rows(session, cc_account.id) == []


async def test_name_survives_card_absence(
    client: AsyncClient, session: AsyncSession, test_user, cc_account, auth_headers,
):
    """C31: o cartão que some dos lançamentos sai da lista mas conserva a
    linha, e o nome volta quando o cartão volta à fatura."""
    tx = await _add_card_tx(session, test_user, cc_account, "0597")
    named = await client.put(
        f"/api/accounts/{cc_account.id}/cards/0597",
        json={"name": "Amanda"},
        headers=auth_headers,
    )
    assert named.status_code == 200

    await session.delete(await session.get(Transaction, tx.id))
    await session.commit()

    gone = await client.get(f"/api/accounts/{cc_account.id}/cards", headers=auth_headers)
    assert gone.status_code == 200
    assert all(item["card_number"] != "0597" for item in gone.json())
    rows = await _card_rows(session, cc_account.id)
    assert len(rows) == 1 and rows[0].name == "Amanda"

    await _add_card_tx(session, test_user, cc_account, "0597")
    back = await client.get(f"/api/accounts/{cc_account.id}/cards", headers=auth_headers)
    assert back.status_code == 200
    assert {"card_number": "0597", "name": "Amanda"} in back.json()


async def test_sync_does_not_touch_account_cards(
    session: AsyncSession, test_user, test_workspace, test_connection, test_account,
):
    """C32: o sync escreve em transactions/accounts/bills e nenhum caminho
    dele escreve em account_cards — a linha semeada fica intacta."""
    from app.providers.base import AccountData, TransactionData
    from app.services.connection_service import sync_connection

    seeded = AccountCard(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=test_workspace.id,
        account_id=test_account.id,
        card_number="0597",
        name="Amanda",
    )
    session.add(seeded)
    await session.commit()
    await session.refresh(seeded)
    account_id = test_account.id
    original_updated_at = seeded.updated_at

    mock_provider = AsyncMock()
    mock_provider.refresh_credentials = AsyncMock(return_value={"token": "refreshed"})
    mock_provider.get_accounts = AsyncMock(return_value=[
        AccountData(
            external_id=test_account.external_id, name=test_account.name,
            type=test_account.type, balance=Decimal("100"), currency="BRL",
        ),
    ])
    mock_provider.get_transactions = AsyncMock(return_value=[
        TransactionData(
            external_id="sync-card-tx-1", description="COMPRA ADICIONAL",
            amount=Decimal("40"), date=date.today(), type="debit", currency="BRL",
            raw_data={"creditCardMetadata": {"cardNumber": "0597"}},
        ),
    ])

    with patch("app.services.connection_service.get_provider", return_value=mock_provider), \
            patch("app.services.connection_service.detect_transfer_pairs", new_callable=AsyncMock), \
            patch("app.services.connection_service.stamp_primary_amount", new_callable=AsyncMock), \
            patch("app.services.connection_service.apply_rules_to_transaction", new_callable=AsyncMock):
        await sync_connection(session, test_connection.id, test_workspace.id, test_user.id)

    # `sync_connection` pode deixar a sessão do teste num estado em que o
    # próximo SELECT dispara MissingGreenlet; a verificação usa outra sessão
    # no mesmo banco em memória (StaticPool).
    async with TestSessionLocal() as verify:
        synced = await verify.scalar(
            select(Transaction).where(Transaction.external_id == "sync-card-tx-1")
        )
        assert synced is not None  # o sync de fato escreveu em transactions

        name_after = await verify.scalar(
            select(AccountCard.name).where(
                AccountCard.account_id == account_id,
                AccountCard.card_number == "0597",
            )
        )
        updated_after = await verify.scalar(
            select(AccountCard.updated_at).where(
                AccountCard.account_id == account_id,
                AccountCard.card_number == "0597",
            )
        )
    assert name_after == "Amanda"
    assert updated_after == original_updated_at
