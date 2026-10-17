"""Lock the categorization sync already does (.checks/categorias-do-mes.md, C14).

Does not change the rule engine. ``sync_connection`` calls
``apply_rules_to_transaction`` and only then falls back to the provider
category when the rule left ``category_id`` empty.
"""
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.providers.base import AccountData, TransactionData
from app.schemas.rule import RuleAction, RuleCondition, RuleCreate
from app.services.admin_service import set_app_setting
from app.services.connection_service import sync_connection
from app.services.rule_service import create_rule
from tests.test_connection_service import _make_category, _make_connection


async def _transactions(credentials, external_id, *args, **kwargs):
    shared = dict(
        amount=Decimal("32.00"),
        date=date.today(),
        type="debit",
        currency="BRL",
        pluggy_category="Eating out",
    )
    if external_id == "checking-ext":
        return [
            TransactionData(external_id="uber-checking", description="UBER * TRIP", **shared),
            TransactionData(external_id="padaria-checking", description="PADARIA", **shared),
        ]
    return [
        TransactionData(external_id="uber-card", description="UBER * TRIP", **shared),
        TransactionData(external_id="padaria-card", description="PADARIA", **shared),
    ]


@pytest.mark.asyncio
async def test_sync_description_rule_categorizes_checking_and_card_and_account_rule_skips_card(
    session: AsyncSession, test_user, test_workspace,
):
    await set_app_setting(session, "use_provider_categories", "true")
    conn = await _make_connection(session, test_user.id, "Rule Lock Bank")
    checking = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=test_workspace.id,
        connection_id=conn.id,
        external_id="checking-ext",
        name="Conta corrente",
        type="checking",
        balance=Decimal("100"),
        currency="BRL",
    )
    session.add(checking)
    await session.commit()
    await session.refresh(checking)

    await _make_category(session, test_user.id, "Alimentação")
    transport = await _make_category(session, test_user.id, "Transporte")
    home = await _make_category(session, test_user.id, "Casa")
    await create_rule(
        session,
        test_workspace.id,
        test_user.id,
        RuleCreate(
            name="UBER para Transporte",
            conditions=[RuleCondition(field="description", op="contains", value="UBER")],
            actions=[RuleAction(op="set_category", value=str(transport.id))],
            priority=0,
            apply_to_existing=False,
        ),
    )
    await create_rule(
        session,
        test_workspace.id,
        test_user.id,
        RuleCreate(
            name="Só a conta corrente",
            conditions=[
                RuleCondition(field="account_id", op="equals", value=str(checking.id)),
            ],
            actions=[RuleAction(op="set_category", value=str(home.id))],
            priority=10,
            apply_to_existing=False,
        ),
    )

    mock_provider = AsyncMock()
    mock_provider.refresh_credentials = AsyncMock(return_value={"token": "t"})
    mock_provider.get_institution_logo = AsyncMock(return_value=None)
    mock_provider.get_bills = AsyncMock(return_value=[])
    mock_provider.get_accounts = AsyncMock(return_value=[
        AccountData(
            external_id="checking-ext",
            name="Conta corrente",
            type="checking",
            balance=Decimal("100"),
            currency="BRL",
        ),
        AccountData(
            external_id="card-ext",
            name="Cartão",
            type="credit_card",
            balance=Decimal("0"),
            currency="BRL",
        ),
    ])
    mock_provider.get_transactions = _transactions

    with patch("app.services.connection_service.get_provider", return_value=mock_provider), \
         patch("app.services.connection_service.detect_transfer_pairs", new_callable=AsyncMock), \
         patch("app.services.connection_service.stamp_primary_amount", new_callable=AsyncMock):
        await sync_connection(session, conn.id, test_workspace.id, test_user.id)

    async def category_of(external_id: str):
        tx = (
            await session.execute(
                select(Transaction).where(Transaction.external_id == external_id)
            )
        ).scalar_one()
        return tx.category_id

    provider_category = (
        await session.execute(select(Category.id).where(Category.name == "Alimentação"))
    ).scalar_one()

    assert await category_of("uber-checking") == transport.id
    assert await category_of("uber-card") == transport.id
    assert await category_of("uber-checking") != provider_category
    assert await category_of("uber-card") != provider_category
    assert await category_of("padaria-checking") == home.id
    assert await category_of("padaria-card") == provider_category
    assert await category_of("padaria-card") != home.id
