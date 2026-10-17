"""Month category flows (.checks/categorias-do-mes.md, S1).

Outflows are the posted totals ``get_spending_by_category`` already returns.
Inflows use those filters with type credit. Pending rows, transfer pairs, and
closed accounts stay out.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.services import admin_service

# The posted card purchase in the October scenario is 2026-10-12. The spending
# query drops a reporting date after app today, so the clock is pinned inside
# October and after that purchase. Otherwise a run on the 8th would agree with
# spending-by-category on 100.00 and miss the 140.00 the criterion names.
OCTOBER_TODAY = date(2026, 10, 31)
MODE_TODAY = date(2026, 12, 1)


def _flow(items: list[dict], category_id: str | None) -> dict:
    return next(item for item in items if item["category_id"] == category_id)


async def _account(
    session: AsyncSession,
    user_id,
    *,
    name: str,
    account_type: str,
    is_closed: bool = False,
) -> Account:
    account = Account(
        id=uuid.uuid4(),
        user_id=user_id,
        name=name,
        type=account_type,
        balance=Decimal("0"),
        currency="BRL",
        is_closed=is_closed,
    )
    session.add(account)
    await session.flush()
    return account


async def _category(
    session: AsyncSession,
    user_id,
    name: str,
    *,
    is_hidden: bool = False,
    treat_as_transfer: bool = False,
    icon: str = "tag",
    color: str = "#111111",
) -> Category:
    category = Category(
        id=uuid.uuid4(),
        user_id=user_id,
        name=name,
        icon=icon,
        color=color,
        is_system=False,
        is_hidden=is_hidden,
        treat_as_transfer=treat_as_transfer,
    )
    session.add(category)
    await session.flush()
    return category


async def _tx(
    session: AsyncSession,
    user_id,
    account_id,
    tx_date: date,
    amount: str,
    *,
    tx_type: str = "debit",
    category_id=None,
    status: str = "posted",
    effective_date: date | None = None,
    transfer_pair_id=None,
    is_ignored: bool = False,
) -> Transaction:
    tx = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        account_id=account_id,
        description="flow",
        amount=Decimal(amount),
        amount_primary=Decimal(amount),
        currency="BRL",
        date=tx_date,
        effective_date=effective_date if effective_date is not None else tx_date,
        type=tx_type,
        source="manual",
        status=status,
        category_id=category_id,
        transfer_pair_id=transfer_pair_id,
        is_ignored=is_ignored,
        created_at=datetime.now(timezone.utc),
    )
    session.add(tx)
    await session.flush()
    return tx


async def _seed_october(session, test_user, test_categories):
    food = test_categories[0]
    salary = await _category(session, test_user.id, "Salário", icon="briefcase", color="#22C55E")
    checking = await _account(session, test_user.id, name="Corrente", account_type="checking")
    card = await _account(session, test_user.id, name="Cartão", account_type="credit_card")
    pair = uuid.uuid4()
    await _tx(
        session, test_user.id, checking.id, date(2026, 10, 5), "100.00", category_id=food.id,
    )
    await _tx(
        session, test_user.id, card.id, date(2026, 10, 12), "40.00", category_id=food.id,
    )
    await _tx(
        session, test_user.id, card.id, date(2026, 10, 12), "25.00",
        category_id=food.id, status="pending",
    )
    await _tx(session, test_user.id, checking.id, date(2026, 10, 8), "10.00")
    await _tx(
        session, test_user.id, checking.id, date(2026, 10, 3), "80.00",
        tx_type="credit", category_id=salary.id,
    )
    await _tx(
        session, test_user.id, checking.id, date(2026, 10, 10), "200.00",
        tx_type="credit", transfer_pair_id=pair,
    )
    await _tx(
        session, test_user.id, checking.id, date(2026, 10, 10), "500.00",
        transfer_pair_id=pair,
    )
    await session.commit()
    return food, salary


@pytest.mark.asyncio
async def test_october_posted_flows_match_spending_and_drop_pending_and_pairs(
    client, auth_headers, session, test_user, test_categories,
):
    food, salary = await _seed_october(session, test_user, test_categories)
    assert test_user.primary_currency == "BRL"

    with patch("app.services.dashboard_service.app_today", return_value=OCTOBER_TODAY):
        response = await client.get(
            "/api/dashboard/category-flows",
            params={"month": "2026-10-01"},
            headers=auth_headers,
        )
        spending = await client.get(
            "/api/dashboard/spending-by-category",
            params={"month": "2026-10-01"},
            headers=auth_headers,
        )
        default_month = await client.get(
            "/api/dashboard/category-flows",
            headers=auth_headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"outflows", "inflows"}
    food_id = str(food.id)
    salary_id = str(salary.id)

    assert [item["category_id"] for item in body["outflows"]] == [food_id, None]
    food_flow = body["outflows"][0]
    uncategorized = body["outflows"][1]
    assert food_flow["category_name"] == "Alimentação"
    assert food_flow["total"] == 140.0
    assert uncategorized["category_id"] is None
    assert uncategorized["total"] == 10.0
    assert set(food_flow) == {
        "category_id", "category_name", "category_icon", "category_color", "total", "percentage",
    }

    assert [item["category_id"] for item in body["inflows"]] == [salary_id]
    assert body["inflows"][0]["category_name"] == "Salário"
    assert body["inflows"][0]["total"] == 80.0

    assert spending.status_code == 200
    spending_body = spending.json()
    assert isinstance(spending_body, list)
    food_spend = _flow(spending_body, food_id)
    assert food_flow["total"] == food_spend["total"]
    assert salary_id not in {item["category_id"] for item in spending_body}

    assert default_month.status_code == 200
    assert default_month.json() == body


@pytest.mark.asyncio
async def test_outflows_follow_credit_card_accounting_mode(
    client, auth_headers, session, test_user, test_categories,
):
    food = test_categories[0]
    card = await _account(session, test_user.id, name="gold", account_type="credit_card")
    await _tx(
        session, test_user.id, card.id, date(2026, 3, 30), "100.00",
        category_id=food.id, effective_date=date(2026, 4, 16),
    )
    await session.commit()

    async def flows_for(month: str) -> list[dict]:
        response = await client.get(
            "/api/dashboard/category-flows",
            params={"month": month},
            headers=auth_headers,
        )
        assert response.status_code == 200
        return response.json()["outflows"]

    async def spending_total(month: str) -> float:
        response = await client.get(
            "/api/dashboard/spending-by-category",
            params={"month": month},
            headers=auth_headers,
        )
        assert response.status_code == 200
        row = next(
            (item for item in response.json() if item["category_id"] == str(food.id)),
            None,
        )
        return 0.0 if row is None else row["total"]

    with patch("app.services.dashboard_service.app_today", return_value=MODE_TODAY):
        await admin_service.set_app_setting(session, "credit_card_accounting_mode", "cash")
        cash_march = await flows_for("2026-03-01")
        cash_april = await flows_for("2026-04-01")
        cash_march_spend = await spending_total("2026-03-01")
        cash_april_spend = await spending_total("2026-04-01")

        await admin_service.set_app_setting(session, "credit_card_accounting_mode", "accrual")
        accrual_march = await flows_for("2026-03-01")
        accrual_april = await flows_for("2026-04-01")
        accrual_march_spend = await spending_total("2026-03-01")
        accrual_april_spend = await spending_total("2026-04-01")

    assert [item["total"] for item in cash_march if item["category_id"] == str(food.id)] == [100.0]
    assert all(item["category_id"] != str(food.id) for item in cash_april)
    assert cash_march[0]["total"] == cash_march_spend
    assert cash_april_spend == 0.0

    assert all(item["category_id"] != str(food.id) for item in accrual_march)
    assert [item["total"] for item in accrual_april if item["category_id"] == str(food.id)] == [100.0]
    assert accrual_april[0]["total"] == accrual_april_spend
    assert accrual_march_spend == 0.0


@pytest.mark.asyncio
async def test_hidden_category_counts_closed_account_does_not(
    client, auth_headers, session, test_user, test_categories,
):
    food = test_categories[0]
    hidden = await _category(session, test_user.id, "Lazer", is_hidden=True)
    open_account = await _account(session, test_user.id, name="Aberta", account_type="checking")
    closed = await _account(
        session, test_user.id, name="Encerrada", account_type="checking", is_closed=True,
    )
    await _tx(
        session, test_user.id, open_account.id, date(2026, 8, 4), "30.00", category_id=hidden.id,
    )
    await _tx(
        session, test_user.id, closed.id, date(2026, 8, 4), "999.00", category_id=hidden.id,
    )
    await _tx(
        session, test_user.id, open_account.id, date(2026, 8, 2), "15.00", category_id=food.id,
    )
    await session.commit()

    with patch("app.services.dashboard_service.app_today", return_value=MODE_TODAY):
        response = await client.get(
            "/api/dashboard/category-flows",
            params={"month": "2026-08-01"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    by_id = {item["category_id"]: item["total"] for item in response.json()["outflows"]}
    assert by_id[str(hidden.id)] == 30.0
    assert by_id[str(food.id)] == 15.0
    assert 999.0 not in by_id.values()


@pytest.mark.asyncio
async def test_month_without_pnl_rows_returns_empty_lists(
    client, auth_headers, session, test_user,
):
    checking = await _account(session, test_user.id, name="Corrente", account_type="checking")
    transfer = await _category(session, test_user.id, "Aplicação", treat_as_transfer=True)
    pair = uuid.uuid4()
    await _tx(
        session, test_user.id, checking.id, date(2026, 11, 2), "50.00", is_ignored=True,
    )
    await _tx(
        session, test_user.id, checking.id, date(2026, 11, 3), "20.00",
        tx_type="credit", transfer_pair_id=pair,
    )
    await _tx(
        session, test_user.id, checking.id, date(2026, 11, 3), "20.00",
        transfer_pair_id=pair,
    )
    await _tx(
        session, test_user.id, checking.id, date(2026, 11, 4), "70.00",
        category_id=transfer.id,
    )
    await session.commit()

    with patch("app.services.dashboard_service.app_today", return_value=MODE_TODAY):
        response = await client.get(
            "/api/dashboard/category-flows",
            params={"month": "2026-11-01"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["outflows"] == []
    assert body["inflows"] == []


@pytest.mark.asyncio
async def test_flows_sorted_by_total_with_share_of_list(
    client, auth_headers, session, test_user, test_categories,
):
    food, salary = await _seed_october(session, test_user, test_categories)

    with patch("app.services.dashboard_service.app_today", return_value=OCTOBER_TODAY):
        response = await client.get(
            "/api/dashboard/category-flows",
            params={"month": "2026-10-01"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    body = response.json()
    outflow_totals = [item["total"] for item in body["outflows"]]
    inflow_totals = [item["total"] for item in body["inflows"]]
    assert outflow_totals == sorted(outflow_totals, reverse=True)
    assert inflow_totals == sorted(inflow_totals, reverse=True)

    food_flow = _flow(body["outflows"], str(food.id))
    uncategorized = _flow(body["outflows"], None)
    salary_flow = _flow(body["inflows"], str(salary.id))
    assert food_flow["percentage"] == 93.33
    assert uncategorized["percentage"] == 6.67
    assert salary_flow["percentage"] == 100.0
    assert round(food_flow["percentage"] + uncategorized["percentage"], 2) == 100.0
