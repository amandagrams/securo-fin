"""Próximas faturas (.checks/fatura-proximas-faturas.md, fatia S1).

`GET /api/accounts/{id}/upcoming-bills` soma o que `counts_on_bill` já aceita
nos ciclos posteriores ao ciclo em curso e projeta as parcelas que ainda não
existem. A projeção não é gravada.
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.models.workspace import Workspace
from app.services.credit_card_service import apply_effective_date

TODAY = date(2026, 10, 8)
PURCHASE = date(2026, 6, 15)


@pytest.fixture(autouse=True)
def _freeze_today(monkeypatch):
    monkeypatch.setattr(
        "app.services.account_service.app_today",
        lambda: TODAY,
    )


def cents(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


async def _tx_count(session: AsyncSession, account_id: uuid.UUID) -> int:
    session.expire_all()
    total = await session.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.account_id == account_id)
    )
    return int(total or 0)


def _add(
    session: AsyncSession,
    user: User,
    account: Account,
    *,
    amount: str,
    tx_date: date,
    type: str = "debit",
    source: str = "manual",
    status: str = "posted",
    description: str = "TX",
    amount_primary: str | None = None,
    **extra,
) -> Transaction:
    tx = Transaction(
        user_id=user.id,
        account_id=account.id,
        description=description,
        amount=Decimal(amount),
        currency=account.currency,
        date=tx_date,
        type=type,
        source=source,
        status=status,
        amount_primary=Decimal(amount_primary) if amount_primary is not None else None,
        **extra,
    )
    apply_effective_date(tx, account)
    session.add(tx)
    return tx


async def _card(
    session: AsyncSession,
    user: User,
    *,
    type: str = "credit_card",
    currency: str = "BRL",
    close_day: int | None = 10,
    due_day: int | None = 17,
    name: str = "Nubank",
) -> Account:
    account = Account(
        user_id=user.id,
        name=name,
        type=type,
        balance=Decimal("0"),
        currency=currency,
        statement_close_day=close_day,
        payment_due_day=due_day,
    )
    session.add(account)
    await session.flush()
    return account


async def _seed_partial_sync(session: AsyncSession, user: User) -> Account:
    """Parcelas 1..4 de 10. A 4 vale 99.00 e cai no ciclo em curso.

    As anteriores valem 100.00 e o total informado pelo banco é 1000.00, de
    modo que total/n = 100.00 não satisfaz a projeção de 99.00. O débito
    manual de 50.00 cai no primeiro ciclo futuro.
    """
    account = await _card(session, user)
    amounts = {1: "100.00", 2: "100.00", 3: "100.00", 4: "99.00"}
    dates = {
        1: date(2026, 6, 15),
        2: date(2026, 7, 15),
        3: date(2026, 8, 15),
        4: date(2026, 9, 15),
    }
    for number in range(1, 5):
        _add(
            session,
            user,
            account,
            amount=amounts[number],
            amount_primary=amounts[number],
            tx_date=dates[number],
            source="sync",
            description=f"PARC {number}",
            installment_number=number,
            total_installments=10,
            installment_total_amount=Decimal("1000.00"),
            installment_purchase_date=PURCHASE,
        )
    _add(
        session,
        user,
        account,
        amount="50.00",
        amount_primary="50.00",
        tx_date=date(2026, 10, 15),
        status="pending",
        description="MANUAL",
    )
    await session.commit()
    await session.refresh(account)
    return account


async def test_synced_series_projects_next_parcels_at_last_amount(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
):
    account = await _seed_partial_sync(session, test_user)
    account_id = account.id
    assert await _tx_count(session, account_id) == 5

    resp = await client.get(
        f"/api/accounts/{account_id}/upcoming-bills",
        headers=auth_headers,
        params={"cycles": 3},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert [c["due_date"] for c in body["cycles"]] == [
        "2026-11-17",
        "2026-12-17",
        "2027-01-17",
    ]
    assert [c["close_date"] for c in body["cycles"]] == [
        "2026-11-10",
        "2026-12-10",
        "2027-01-10",
    ]
    assert [cents(c["committed_total"]) for c in body["cycles"]] == [
        Decimal("149.00"),
        Decimal("99.00"),
        Decimal("99.00"),
    ]
    assert [cents(c["committed_total_primary"]) for c in body["cycles"]] == [
        Decimal("149.00"),
        Decimal("99.00"),
        Decimal("99.00"),
    ]
    assert {c["currency"] for c in body["cycles"]} == {"BRL"}
    assert await _tx_count(session, account_id) == 5


async def test_future_committed_total_ignores_cycles_cutoff(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
):
    account = await _seed_partial_sync(session, test_user)

    wide = await client.get(
        f"/api/accounts/{account.id}/upcoming-bills",
        headers=auth_headers,
        params={"cycles": 3},
    )
    narrow = await client.get(
        f"/api/accounts/{account.id}/upcoming-bills",
        headers=auth_headers,
        params={"cycles": 1},
    )

    assert wide.status_code == 200
    assert cents(wide.json()["future_committed_total"]) == Decimal("644.00")
    assert cents(wide.json()["future_committed_total_primary"]) == Decimal("644.00")
    assert narrow.status_code == 200
    assert len(narrow.json()["cycles"]) == 1
    assert cents(narrow.json()["future_committed_total"]) == Decimal("644.00")
    assert cents(narrow.json()["future_committed_total_primary"]) == Decimal("644.00")


async def test_complete_series_projects_nothing_and_only_bill_rows_sum(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
):
    account = await _card(session, test_user)
    transfer_cat = Category(
        user_id=test_user.id,
        name="Aplicação",
        treat_as_transfer=True,
    )
    ignored_cat = Category(
        user_id=test_user.id,
        name="Fora",
        is_ignored=True,
    )
    session.add_all([transfer_cat, ignored_cat])
    await session.flush()

    series_id = uuid.uuid4()
    for number in range(1, 11):
        month = 12 + (number - 1)
        year = 2025 + (month - 1) // 12
        month = (month - 1) % 12 + 1
        _add(
            session,
            test_user,
            account,
            amount="99.00",
            amount_primary="99.00",
            tx_date=date(year, month, 15),
            description=f"SERIE {number}",
            installment_number=number,
            total_installments=10,
            installment_total_amount=Decimal("990.00"),
            installment_purchase_date=date(2025, 12, 15),
            installment_series_id=series_id,
        )

    # Primeiro ciclo futuro: date 2026-10-15 → vencimento 2026-11-17.
    future = date(2026, 10, 15)
    _add(session, test_user, account, amount="20.00", tx_date=future, description="DEBITO")
    _add(
        session,
        test_user,
        account,
        amount="30.00",
        tx_date=future,
        description="APLICACAO",
        category_id=transfer_cat.id,
    )
    _add(
        session,
        test_user,
        account,
        amount="8.00",
        tx_date=future,
        type="credit",
        description="ESTORNO",
    )
    _add(
        session,
        test_user,
        account,
        amount="100.00",
        tx_date=future,
        description="IGNORADO",
        is_ignored=True,
    )
    _add(
        session,
        test_user,
        account,
        amount="80.00",
        tx_date=future,
        description="PAR",
        transfer_pair_id=uuid.uuid4(),
    )
    _add(
        session,
        test_user,
        account,
        amount="40.00",
        tx_date=future,
        type="credit",
        description="PAGAMENTO",
        category_id=transfer_cat.id,
    )
    _add(
        session,
        test_user,
        account,
        amount="15.00",
        tx_date=future,
        source="settlement",
        description="ACERTO",
    )
    _add(
        session,
        test_user,
        account,
        amount="12.00",
        tx_date=future,
        description="CAT IGNORADA",
        category_id=ignored_cat.id,
    )
    await session.commit()

    resp = await client.get(
        f"/api/accounts/{account.id}/upcoming-bills",
        headers=auth_headers,
        params={"cycles": 3},
    )

    assert resp.status_code == 200
    totals = [cents(c["committed_total"]) for c in resp.json()["cycles"]]
    # 20 + 30 - 8. A série completa não projeta, e o resto não entra na fatura.
    assert totals == [Decimal("42.00"), Decimal("0.00"), Decimal("0.00")]


@pytest.mark.parametrize("identity", ["fingerprint", "series_id"])
async def test_ignored_latest_parcel_suppresses_projection(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
    identity: str,
):
    account = await _card(session, test_user, name=identity)
    series_id = uuid.uuid4() if identity == "series_id" else None
    dates = {
        1: date(2026, 6, 15),
        2: date(2026, 7, 15),
        3: date(2026, 8, 15),
        4: date(2026, 9, 15),
    }
    for number in range(1, 5):
        _add(
            session,
            test_user,
            account,
            amount="99.00" if number == 4 else "100.00",
            tx_date=dates[number],
            source="sync",
            description=f"PARC {number}",
            installment_number=number,
            total_installments=10,
            installment_total_amount=Decimal("1000.00"),
            installment_purchase_date=PURCHASE,
            installment_series_id=series_id,
            is_ignored=number == 4,
        )
    await session.commit()

    resp = await client.get(
        f"/api/accounts/{account.id}/upcoming-bills",
        headers=auth_headers,
        params={"cycles": 3},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert [cents(c["committed_total"]) for c in body["cycles"]] == [
        Decimal("0.00"),
        Decimal("0.00"),
        Decimal("0.00"),
    ]
    assert cents(body["future_committed_total"]) == Decimal("0.00")
    assert body["future_committed_total"] is not None


@pytest.mark.parametrize(
    ("type_", "close_day", "due_day"),
    [
        ("credit_card", None, 17),
        ("credit_card", 10, None),
        ("checking", 10, 17),
    ],
)
async def test_unconfigured_or_non_card_returns_empty(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
    type_: str,
    close_day: int | None,
    due_day: int | None,
):
    account = await _card(
        session,
        test_user,
        type=type_,
        close_day=close_day,
        due_day=due_day,
        name=type_,
    )
    _add(
        session,
        test_user,
        account,
        amount="50.00",
        tx_date=date(2026, 10, 15),
        description="FUTURO",
    )
    await session.commit()

    resp = await client.get(
        f"/api/accounts/{account.id}/upcoming-bills",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["cycles"] == []
    assert body["future_committed_total"] is None
    assert body["future_committed_total_primary"] is None


async def test_other_workspace_upcoming_bills_404(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
):
    other = Workspace(id=uuid.uuid4(), name="Other", created_by_user_id=test_user.id)
    session.add(other)
    await session.flush()
    foreign = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=other.id,
        name="Cartão Alheio",
        type="credit_card",
        balance=Decimal("0.00"),
        currency="BRL",
        statement_close_day=10,
        payment_due_day=17,
    )
    session.add(foreign)
    await session.commit()

    resp = await client.get(
        f"/api/accounts/{foreign.id}/upcoming-bills",
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_cycles_defaults_to_six(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
):
    account = await _seed_partial_sync(session, test_user)

    resp = await client.get(
        f"/api/accounts/{account.id}/upcoming-bills",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    body = resp.json()
    assert [c["due_date"] for c in body["cycles"]] == [
        "2026-11-17",
        "2026-12-17",
        "2027-01-17",
        "2027-02-17",
        "2027-03-17",
        "2027-04-17",
    ]
    assert [cents(c["committed_total"]) for c in body["cycles"]] == [
        Decimal("149.00"),
        Decimal("99.00"),
        Decimal("99.00"),
        Decimal("99.00"),
        Decimal("99.00"),
        Decimal("99.00"),
    ]


@pytest.mark.parametrize("cycles", [0, 25])
async def test_cycles_out_of_range_422(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
    cycles: int,
):
    account = await _card(session, test_user)
    await session.commit()

    resp = await client.get(
        f"/api/accounts/{account.id}/upcoming-bills",
        headers=auth_headers,
        params={"cycles": cycles},
    )
    assert resp.status_code == 422


async def test_cycles_bounds_keep_future_total(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
):
    account = await _seed_partial_sync(session, test_user)
    url = f"/api/accounts/{account.id}/upcoming-bills"

    one = await client.get(url, headers=auth_headers, params={"cycles": 1})
    assert one.status_code == 200
    assert len(one.json()["cycles"]) == 1
    assert cents(one.json()["cycles"][0]["committed_total"]) == Decimal("149.00")
    assert cents(one.json()["future_committed_total"]) == Decimal("644.00")

    full = await client.get(url, headers=auth_headers, params={"cycles": 24})
    assert full.status_code == 200
    totals = [cents(c["committed_total"]) for c in full.json()["cycles"]]
    assert len(totals) == 24
    assert totals[:6] == [
        Decimal("149.00"),
        Decimal("99.00"),
        Decimal("99.00"),
        Decimal("99.00"),
        Decimal("99.00"),
        Decimal("99.00"),
    ]
    assert totals[6:] == [Decimal("0.00")] * 18
    assert cents(full.json()["future_committed_total"]) == Decimal("644.00")


async def test_primary_totals_use_stored_amount_primary(
    client: AsyncClient,
    auth_headers,
    session: AsyncSession,
    test_user: User,
):
    account = await _card(session, test_user, currency="USD", name="Visa")
    _add(
        session,
        test_user,
        account,
        amount="10.00",
        amount_primary="55.00",
        tx_date=date(2026, 9, 15),
        source="sync",
        description="PARC 1",
        installment_number=1,
        total_installments=2,
        installment_total_amount=Decimal("20.00"),
        installment_purchase_date=date(2026, 9, 15),
    )
    _add(
        session,
        test_user,
        account,
        amount="4.00",
        amount_primary="22.00",
        tx_date=date(2026, 10, 15),
        status="pending",
        description="MANUAL",
    )
    await session.commit()

    resp = await client.get(
        f"/api/accounts/{account.id}/upcoming-bills",
        headers=auth_headers,
        params={"cycles": 1},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["cycles"][0]["currency"] == "USD"
    assert cents(body["cycles"][0]["committed_total"]) == Decimal("14.00")
    assert cents(body["cycles"][0]["committed_total_primary"]) == Decimal("77.00")
    assert cents(body["future_committed_total"]) == Decimal("14.00")
    assert cents(body["future_committed_total_primary"]) == Decimal("77.00")
