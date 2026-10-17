"""Saldo real e saldo previsto de cada dia (.checks/saldo-da-conta-no-mes.md, S2).

`actual_balance` é o posted até hoje, na moeda primária. `ending_balance` caminha
esse real com cada transação na data dela, e a fatura do cartão ligado cai no
vencimento, uma vez, pelo total.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.app_clock import app_today
from app.models.account import Account
from app.models.credit_card_bill import CreditCardBill
from app.models.fx_rate import FxRate
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction
from app.services.credit_card_service import compute_effective_date


def _grid(month_start: date) -> tuple[date, date]:
    grid_start = month_start - timedelta(days=(month_start.weekday() + 1) % 7)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)
    last = month_end - timedelta(days=1)
    grid_end = last + timedelta(days=6 - ((last.weekday() + 1) % 7) + 1)
    return grid_start, grid_end


def _future_day(today: date, day: int) -> date:
    """This month's `day` when it is still ahead of today, otherwise next month's."""
    candidate = date(today.year, today.month, day)
    if candidate > today:
        return candidate
    if today.month == 12:
        return date(today.year + 1, 1, day)
    return date(today.year, today.month + 1, day)


def _three_future_days(today: date) -> tuple[date, date, date]:
    cursor = today + timedelta(days=1)
    while True:
        days = (cursor, cursor + timedelta(days=1), cursor + timedelta(days=2))
        if len({(d.year, d.month) for d in days}) == 1:
            return days
        cursor += timedelta(days=1)


async def _calendar(client: AsyncClient, headers: dict, month: date, account_id=None) -> dict:
    params: dict = {"month": month.isoformat()}
    if account_id is not None:
        params["account_id"] = str(account_id)
    response = await client.get("/api/transactions/calendar", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _on(body: dict, day: date) -> dict:
    return next(row for row in body["days"] if row["date"] == day.isoformat())


async def _account(
    session: AsyncSession, user, *, name: str, acc_type: str, currency: str = "BRL",
    opening: str | None = None, **fields,
) -> Account:
    account = Account(
        id=uuid.uuid4(), user_id=user.id, name=name, type=acc_type,
        balance=Decimal(opening or "0"), currency=currency, **fields,
    )
    session.add(account)
    await session.flush()
    if opening is not None and Decimal(opening) != 0:
        session.add(Transaction(
            id=uuid.uuid4(), user_id=user.id, account_id=account.id,
            description="Saldo inicial", amount=abs(Decimal(opening)), currency=currency,
            date=date(2020, 1, 1), type="credit" if Decimal(opening) > 0 else "debit",
            source="opening_balance", status="posted",
        ))
    return account


def _tx(user, account, **fields) -> Transaction:
    payload = dict(
        id=uuid.uuid4(), user_id=user.id, account_id=account.id,
        currency=account.currency, status="posted", source="manual",
    )
    payload.update(fields)
    return Transaction(**payload)


@pytest.mark.asyncio
async def test_projected_walk_pending_future_posted_and_transfer(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C8: pending, posted futuro e transferência andam o previsto e não o real."""
    today = app_today()
    transfer_day, credit_day, debit_day = _three_future_days(today)
    # T, C, X are consecutive. The helper returns them in calendar order, so
    # name them by the criterion: debit, then credit, then transfer.
    t_day, c_day, x_day = transfer_day, credit_day, debit_day
    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1000.00")
    other = await _account(session, test_user, name="Outra", acc_type="checking", opening="0")
    mercado = _tx(
        test_user, conta, description="Mercado", amount=Decimal("80.00"),
        date=t_day, type="debit", status="pending",
    )
    salary = _tx(
        test_user, conta, description="Salário", amount=Decimal("200.00"),
        date=c_day, type="credit", status="posted",
    )
    pair = uuid.uuid4()
    outbound = _tx(
        test_user, conta, description="Para outra", amount=Decimal("40.00"),
        date=x_day, type="debit", status="pending", source="transfer",
        transfer_pair_id=pair,
    )
    inbound = _tx(
        test_user, other, description="Da conta", amount=Decimal("40.00"),
        date=x_day, type="credit", status="pending", source="transfer",
        transfer_pair_id=pair,
    )
    session.add_all([mercado, salary, outbound, inbound])
    await session.commit()

    body = await _calendar(client, auth_headers, date(t_day.year, t_day.month, 1), conta.id)
    assert body["actual_balance"] == 1000.0
    for row in body["days"]:
        current = date.fromisoformat(row["date"])
        if current < t_day:
            expected = 1000.0
        elif current < c_day:
            expected = 920.0
        elif current < x_day:
            expected = 1120.0
        else:
            expected = 1080.0
        assert row["ending_balance"] == expected, (current, row["ending_balance"], expected)

    mercado_item = next(item for item in _on(body, t_day)["items"] if item["description"] == "Mercado")
    assert mercado_item["kind"] == "projected"
    assert mercado_item["id"] == str(mercado.id)
    assert mercado_item["type"] == "debit"
    assert mercado_item["amount"] == 80.0

    salary_item = next(item for item in _on(body, c_day)["items"] if item["description"] == "Salário")
    assert salary_item["kind"] == "projected"
    assert salary_item["id"] == str(salary.id)
    assert salary_item["type"] == "credit"
    assert salary_item["amount"] == 200.0

    transfer_item = next(item for item in _on(body, x_day)["items"] if item["is_transfer"])
    assert transfer_item["id"] == str(outbound.id)
    assert _on(body, x_day)["ending_balance"] - _on(body, x_day - timedelta(days=1))["ending_balance"] == -40.0


@pytest.mark.asyncio
async def test_recurring_projects_once_and_past_posted_stay_actual(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C9: recorrência futura tira 300; os 30 já posted não viram um quarto débito."""
    today = app_today()
    rent_day = today + timedelta(days=12)
    past = [today - timedelta(days=3), today - timedelta(days=2), today - timedelta(days=1)]
    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1090.00")
    for posted_on in past:
        session.add(_tx(
            test_user, conta, description="Já lançado", amount=Decimal("30.00"),
            date=posted_on, type="debit", status="posted",
        ))
    session.add(RecurringTransaction(
        id=uuid.uuid4(), user_id=test_user.id, account_id=conta.id,
        description="Aluguel", amount=Decimal("300.00"), currency="BRL",
        type="debit", frequency="monthly", start_date=rent_day, end_date=rent_day,
        next_occurrence=rent_day, weekend_adjustment="none", is_active=True,
    ))
    await session.commit()

    body = await _calendar(client, auth_headers, date(rent_day.year, rent_day.month, 1), conta.id)
    assert body["actual_balance"] == 1000.0
    for row in body["days"]:
        current = date.fromisoformat(row["date"])
        if current >= rent_day:
            assert row["ending_balance"] == 700.0, (current, row["ending_balance"])
    following = rent_day + timedelta(days=1)
    if any(row["date"] == following.isoformat() for row in body["days"]):
        assert _on(body, following)["ending_balance"] == _on(body, rent_day)["ending_balance"]
        assert all(item["description"] != "Aluguel" for item in _on(body, following)["items"])

    seen = {item["date"] for row in body["days"] for item in row["items"] if item["description"] == "Aluguel"}
    assert rent_day.isoformat() in seen
    for posted_on in past:
        month = date(posted_on.year, posted_on.month, 1)
        posted_body = await _calendar(client, auth_headers, month, conta.id)
        assert posted_on.isoformat() in {row["date"] for row in posted_body["days"]}
        matches = [
            item for item in _on(posted_body, posted_on)["items"]
            if item["description"] == "Já lançado"
        ]
        assert len(matches) == 1
        assert matches[0]["kind"] == "actual"
        assert matches[0]["amount"] == 30.0
        assert all(item["description"] != "Aluguel" for item in _on(posted_body, posted_on)["items"])


async def _linked_card(session, user, conta, *, currency="BRL", close_day=20, due_day=28, name="Nubank"):
    return await _account(
        session, user, name=name, acc_type="credit_card", currency=currency,
        statement_close_day=close_day, payment_due_day=due_day,
        payment_account_id=conta.id,
    )


@pytest.mark.asyncio
async def test_card_cycle_drops_checking_on_due_date_once(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C10: sem fatura gravada, o ciclo cai uma vez no vencimento e não na compra."""
    today = app_today()
    due = _future_day(today, 28)
    purchase = due.replace(day=5)
    assert compute_effective_date(purchase, 20, 28) == due
    assert due > today
    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1000.00")
    card = await _linked_card(session, test_user, conta)
    session.add_all([
        _tx(
            test_user, card, description="Compra", amount=Decimal("250.00"),
            date=purchase, type="debit", status="posted",
        ),
        _tx(
            test_user, card, description="Ignorada", amount=Decimal("999.00"),
            date=purchase, type="debit", status="posted", is_ignored=True,
        ),
    ])
    await session.commit()

    body = await _calendar(client, auth_headers, date(due.year, due.month, 1), conta.id)
    assert body["actual_balance"] == 1000.0
    for row in body["days"]:
        current = date.fromisoformat(row["date"])
        expected = 750.0 if current >= due else 1000.0
        assert row["ending_balance"] == expected, (current, row["ending_balance"])

    due_row = _on(body, due)
    bill = next(item for item in due_row["items"] if item["description"] == "Nubank")
    assert bill["kind"] == "projected"
    assert bill["id"] is None
    assert bill["recurring_id"] is None
    assert bill["type"] == "debit"
    assert bill["amount"] == 250.0
    assert bill["currency"] == "BRL"
    assert bill["account_id"] == str(conta.id)
    assert due_row["projected_expense"] == 250.0
    assert due_row["projected_count"] == 1
    if any(row["date"] == purchase.isoformat() for row in body["days"]):
        assert all(item["description"] != "Compra" for item in _on(body, purchase)["items"])


@pytest.mark.asyncio
async def test_bill_row_total_replaces_cycle_sum(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C11: a linha da fatura é o total; o débito do ciclo não soma por cima."""
    today = app_today()
    due = _future_day(today, 28)
    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1000.00")
    card = await _linked_card(session, test_user, conta)
    session.add(_tx(
        test_user, card, description="Compra", amount=Decimal("250.00"),
        date=due.replace(day=5), type="debit", status="posted",
    ))
    session.add(CreditCardBill(
        id=uuid.uuid4(), user_id=test_user.id, account_id=card.id,
        external_id="bill-400", due_date=due, total_amount=Decimal("400.00"),
        currency="BRL",
    ))
    await session.commit()

    body = await _calendar(client, auth_headers, date(due.year, due.month, 1), conta.id)
    assert body["actual_balance"] == 1000.0
    due_row = _on(body, due)
    assert due_row["ending_balance"] == 600.0
    bills = [item for item in due_row["items"] if item["id"] is None]
    assert len(bills) == 1
    assert bills[0]["amount"] == 400.0
    assert due_row["projected_expense"] == 400.0
    assert _on(body, due + timedelta(days=1))["ending_balance"] == 600.0 or due + timedelta(days=1) not in {
        date.fromisoformat(row["date"]) for row in body["days"]
    }


@pytest.mark.asyncio
async def test_payment_transfer_on_due_date_suppresses_bill_line(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C12: a transferência do pagamento no vencimento não deixa um segundo 250."""
    today = app_today()
    due = _future_day(today, 28)
    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1000.00")
    card = await _linked_card(session, test_user, conta)
    pair = uuid.uuid4()
    session.add_all([
        _tx(
            test_user, card, description="Compra", amount=Decimal("250.00"),
            date=due.replace(day=5), type="debit", status="posted",
        ),
        _tx(
            test_user, conta, description="Pagamento", amount=Decimal("250.00"),
            date=due, type="debit", status="pending", source="transfer",
            transfer_pair_id=pair,
        ),
        _tx(
            test_user, card, description="Pagamento", amount=Decimal("250.00"),
            date=due, type="credit", status="pending", source="transfer",
            transfer_pair_id=pair,
        ),
    ])
    await session.commit()

    body = await _calendar(client, auth_headers, date(due.year, due.month, 1), conta.id)
    due_row = _on(body, due)
    assert due_row["ending_balance"] == 750.0
    assert any(item["is_transfer"] and item["amount"] == 250.0 for item in due_row["items"])
    assert not any(item["id"] is None and item["amount"] == 250.0 for item in due_row["items"])
    later = [row for row in body["days"] if date.fromisoformat(row["date"]) >= due]
    assert {row["ending_balance"] for row in later} == {750.0}


@pytest.mark.asyncio
async def test_bill_does_not_leave_the_other_checking(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C13: a fatura só sai da checking apontada por payment_account_id."""
    today = app_today()
    due = _future_day(today, 28)
    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1000.00")
    outra = await _account(session, test_user, name="Outra", acc_type="checking", opening="1000.00")
    card = await _linked_card(session, test_user, conta)
    session.add(_tx(
        test_user, card, description="Compra", amount=Decimal("250.00"),
        date=due.replace(day=5), type="debit", status="posted",
    ))
    await session.commit()

    body = await _calendar(client, auth_headers, date(due.year, due.month, 1), outra.id)
    assert body["actual_balance"] == 1000.0
    assert {row["ending_balance"] for row in body["days"]} == {1000.0}
    assert all(item["description"] != "Nubank" for row in body["days"] for item in row["items"])


@pytest.mark.asyncio
async def test_bill_before_grid_is_carried_in_the_seed(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C14: o mês seguinte não relista a fatura; o valor já está na semente."""
    today = app_today()
    due = _future_day(today, 10)
    purchase = due.replace(day=1)
    assert compute_effective_date(purchase, 3, 10) == due
    if due.month == 12:
        following = date(due.year + 1, 1, 1)
    else:
        following = date(due.year, due.month + 1, 1)
    grid_start, _grid_end = _grid(following)
    assert grid_start > due

    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1000.00")
    card = await _linked_card(session, test_user, conta, close_day=3, due_day=10)
    session.add(_tx(
        test_user, card, description="Compra", amount=Decimal("250.00"),
        date=purchase, type="debit", status="posted",
    ))
    await session.commit()

    body = await _calendar(client, auth_headers, following, conta.id)
    assert body["actual_balance"] == 1000.0
    assert {row["ending_balance"] for row in body["days"]} == {750.0}
    assert all(item["description"] != "Nubank" for row in body["days"] for item in row["items"])


@pytest.mark.asyncio
async def test_due_today_or_earlier_does_not_move_balances(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C15: vencida ou que vence hoje não entra no real nem no previsto futuro."""
    today = app_today()
    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1000.00")
    card = await _linked_card(session, test_user, conta)
    session.add_all([
        CreditCardBill(
            id=uuid.uuid4(), user_id=test_user.id, account_id=card.id,
            external_id="bill-today", due_date=today, total_amount=Decimal("400.00"),
            currency="BRL",
        ),
        CreditCardBill(
            id=uuid.uuid4(), user_id=test_user.id, account_id=card.id,
            external_id="bill-past", due_date=today - timedelta(days=1),
            total_amount=Decimal("400.00"), currency="BRL",
        ),
    ])
    await session.commit()

    month = date(today.year, today.month, 1)
    body = await _calendar(client, auth_headers, month, conta.id)
    assert body["actual_balance"] == 1000.0
    for row in body["days"]:
        current = date.fromisoformat(row["date"])
        if current >= today:
            assert row["ending_balance"] == 1000.0
        assert all(item["description"] != "Nubank" for item in row["items"])


@pytest.mark.asyncio
async def test_unfiltered_sum_is_open_checking_plus_the_bill(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C16: sem filtro, só checking aberta; a fatura do critério 7 ainda cai em D."""
    today = app_today()
    due = _future_day(today, 28)
    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1000.00")
    await _account(session, test_user, name="Poupança", acc_type="savings", opening="5000.00")
    card = await _linked_card(session, test_user, conta)
    session.add(_tx(
        test_user, card, description="Compra", amount=Decimal("250.00"),
        date=due.replace(day=5), type="debit", status="posted",
    ))
    await session.commit()

    month = date(due.year, due.month, 1)
    combined = await _calendar(client, auth_headers, month)
    assert combined["actual_balance"] == 1000.0
    assert combined["account_ids"] is None
    for row in combined["days"]:
        current = date.fromisoformat(row["date"])
        expected = 750.0 if current >= due else 1000.0
        assert row["ending_balance"] == expected, (current, row["ending_balance"])

    filtered = await _calendar(client, auth_headers, month, conta.id)
    assert filtered["actual_balance"] == 1000.0
    assert _on(filtered, due)["ending_balance"] == 750.0
    assert any(item["description"] == "Nubank" for item in _on(filtered, due)["items"])


@pytest.mark.asyncio
async def test_bill_converts_with_fx_convert_and_falls_back_one_to_one(
    client: AsyncClient, auth_headers, session: AsyncSession, test_user,
):
    """C17: 100 USD viram 500 com a taxa, e 100 quando get_rate cai no 1:1."""
    today = app_today()
    due = _future_day(today, 28)
    conta = await _account(session, test_user, name="Conta", acc_type="checking", opening="1000.00")
    card = await _linked_card(session, test_user, conta, currency="USD")
    session.add(CreditCardBill(
        id=uuid.uuid4(), user_id=test_user.id, account_id=card.id,
        external_id="bill-usd", due_date=due, total_amount=Decimal("100.00"),
        currency="USD",
    ))
    session.add(FxRate(
        base_currency="USD", quote_currency="BRL", date=today,
        rate=Decimal("5"), source="test",
    ))
    await session.commit()

    month = date(due.year, due.month, 1)
    converted = await _calendar(client, auth_headers, month, conta.id)
    assert converted["actual_balance"] == 1000.0
    bill = next(item for item in _on(converted, due)["items"] if item["description"] == "Nubank")
    assert bill["amount"] == 100.0
    assert bill["currency"] == "USD"
    assert bill["amount_primary"] == 500.0
    assert _on(converted, due)["ending_balance"] == 500.0

    await session.execute(delete(FxRate))
    await session.commit()
    fallback = await _calendar(client, auth_headers, month, conta.id)
    plain = next(item for item in _on(fallback, due)["items"] if item["description"] == "Nubank")
    assert plain["amount"] == 100.0
    assert plain["currency"] == "USD"
    assert plain["amount_primary"] == 100.0
    assert fallback["actual_balance"] == 1000.0
    assert _on(fallback, due)["ending_balance"] == 900.0
