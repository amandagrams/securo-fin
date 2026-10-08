# Saldo da conta em cada dia do mês — verified

- Verdict: **FAIL**
- Profile: light
- Diff range: `da1a2ab..9a7cb44` (HEAD de `integrate/onda-1`; proofs no HEAD integrado)
- Round: 1
- Verifier: independent

## Checks

| Check | Claim | Proof run | Evidência | Resultado |
| --- | --- | --- | --- | --- |
| C1 | POST de cartão sem `payment_account_id`: `422` e a lista não ganha conta | pytest exit 0, `test_create_credit_card_requires_payment_account` PASSED | `backend/tests/test_payment_account_api.py:57` `status_code == 422`; `:58` `_names(...) == before` | PASS |
| C2 | POST com a Conta: `201` e o GET devolve o mesmo id | pytest exit 0, `test_create_credit_card_returns_payment_account` PASSED | `backend/tests/test_payment_account_api.py:76` `status_code == 201`; `:77` `payment_account_id == conta_id`; `:81` o GET `== conta_id` | PASS |
| C3 | Savings, outro cartão ou checking fechada: `422` em cada um e o cartão não é gravado | pytest exit 0, `test_invalid_payment_account_in_workspace_is_422` PASSED | `backend/tests/test_payment_account_api.py:127` `status_code == 422`; `:128` `_names(...) == before` | PASS |
| C4 | Conta de outro workspace: `404` e nada gravado | pytest exit 0, `test_payment_account_in_other_workspace_is_404` PASSED | `backend/tests/test_payment_account_api.py:165` `status_code == 404`; `:166` `_names(...) == before` | PASS |
| C5 | Cartão existente e o do sync nascem `null`. PATCH grava a Conta. PATCH `null` limpa. Um segundo sync não apaga o vínculo | pytest exit 0, `test_patch_payment_account_on_existing_and_synced_card` PASSED | `backend/tests/test_payment_account_api.py:190` `is None`; `:198` `== conta_id`; `:208` `is None`; `:245` sync `is None`; `:253` `== conta_id`; `:270` depois do segundo sync `== conta_id` | PASS |
| C6 | Com ponteiro null, `actual_balance` e todo `ending_balance` ficam `1000.0`, sem item do cartão | pytest exit 0, `test_null_payment_account_does_not_move_checking_calendar` PASSED | `backend/tests/test_payment_account_api.py:314` `actual_balance == 1000.0`; `:315` endings `{1000.0}`; `:317` `description != "Nubank"` dentro do `assert all` | PASS |
| C7 | Apagar a checking deixa o cartão e `payment_account_id` null | pytest exit 0, `test_delete_checking_nulls_payment_account_keeps_card` PASSED | `backend/tests/test_payment_account_api.py:342` `status_code == 204`; `:346` `name == "Nubank"`; `:347` `payment_account_id is None` | PASS |
| C8 | `actual_balance` `1000.0`. Ending `1000.0` antes de T, `920.0` até C, `1120.0` até X, `1080.0` depois. Mercado `80.0` debit projected. Salário `200.0` credit projected. Transferência cai `40.0` | pytest exit 0, `test_projected_walk_pending_future_posted_and_transfer` PASSED | `1000.0` / `920.0` / `1120.0` / `1080.0` estão nas atribuições `backend/tests/test_calendar_account_balance.py:136`, `:138`, `:140`, `:142`. A asserção `:143` é `ending_balance == expected`. Mercado e Salário têm amount na asserção (`:149` `80.0`, `:155` `200.0`) e a queda da transferência está em `:159` `== -40.0`. Os quatro saldos do critério não se lêem na linha da asserção | FAIL |
| C9 | Recorrência: `actual_balance` `1000.0`, ending `700.0` a partir de R, o dia seguinte repete, os `30.0` passados são `kind=actual` e não geram outro débito | pytest exit 0, `test_recurring_projects_once_and_past_posted_stay_actual` PASSED | `backend/tests/test_calendar_account_balance.py:185` `actual_balance == 1000.0`; `:189` `ending_balance == 700.0`; `:206` `kind == "actual"`; `:207` `amount == 30.0` | PASS |
| C10 | Sem linha de fatura: `actual_balance` `1000`, antes de D ending `1000`, D em diante `750`. Item projected, `id` null, `recurring_id` null, debit, `250.00` BRL, description Nubank, conta da Conta. A compra não aparece na Conta | pytest exit 0, `test_card_cycle_drops_checking_on_due_date_once` PASSED | `750.0` e `1000.0` da caminhada estão na atribuição `:247`. A asserção `:248` é `== expected`. `"Nubank"` está no filtro `:251`, não num `assert`. O amount `250.0`, `currency == "BRL"`, `id is None` e `projected_count == 1` estão em `:253`–`:260` | FAIL |
| C11 | Com linha de `400.00`, D derruba a Conta em 400 uma vez (`ending` `600.0`). O débito de 250 não soma por cima | pytest exit 0, `test_bill_row_total_replaces_cycle_sum` PASSED | `backend/tests/test_calendar_account_balance.py:288` `ending_balance == 600.0`; `:291` `amount == 400.0`; `:292` `projected_expense == 400.0` | PASS |
| C12 | Transferência no vencimento: ending `750.0`, não um segundo item de `250.0` sem id | pytest exit 0, `test_payment_transfer_on_due_date_suppresses_bill_line` PASSED | `backend/tests/test_calendar_account_balance.py:328` `ending_balance == 750.0`; `:329` `is_transfer` e `amount == 250.0`; `:330` `not any(id is None and amount == 250.0)`; `:332` `{750.0}` | PASS |
| C13 | A outra checking fica em `1000.0` e não lista Nubank | pytest exit 0, `test_bill_does_not_leave_the_other_checking` PASSED | `backend/tests/test_calendar_account_balance.py:352` `actual_balance == 1000.0`; `:353` endings `{1000.0}`; `:354` `description != "Nubank"` | PASS |
| C14 | Mês seguinte: nenhum dia lista a fatura, `actual_balance` `1000.0`, todo ending `750.0` | pytest exit 0, `test_bill_before_grid_is_carried_in_the_seed` PASSED | `backend/tests/test_calendar_account_balance.py:382` `actual_balance == 1000.0`; `:383` endings `{750.0}`; `:384` `description != "Nubank"` | PASS |
| C15 | Vencida hoje ou antes: `actual_balance` `1000.0` e ending futuro `1000.0`, sem a linha | pytest exit 0, `test_due_today_or_earlier_does_not_move_balances` PASSED | `backend/tests/test_calendar_account_balance.py:411` `actual_balance == 1000.0`; `:415` `ending_balance == 1000.0`; `:416` `description != "Nubank"` | PASS |
| C16 | Sem `account_id`: `actual_balance` `1000.0` (checking aberta; cartão e savings de fora) e a fatura derruba 250 em D. Com a Conta, vale o critério 7 | pytest exit 0, `test_unfiltered_sum_is_open_checking_plus_the_bill` PASSED | `backend/tests/test_calendar_account_balance.py:437` `actual_balance == 1000.0`. A caminhada `750.0` / `1000.0` está na atribuição `:441`; a asserção `:442` é `== expected`. O filtro da Conta fixa `750.0` em `:446` e `"Nubank"` em `:447` | FAIL |
| C17 | 100 USD com taxa 5: `amount` `100`, `currency` USD, `amount_primary` `500`, ending cai para `500`. Sem taxa, `amount_primary` `100` e ending `900`. `actual_balance` continua `1000` | pytest exit 0, `test_bill_converts_with_fx_convert_and_falls_back_one_to_one` PASSED | `backend/tests/test_calendar_account_balance.py:472` `actual_balance == 1000.0`; `:474` `amount == 100.0`; `:475` `== "USD"`; `:476` `amount_primary == 500.0`; `:477` ending `== 500.0`; `:485` fallback `100.0`; `:487` ending `== 900.0` | PASS |
| C18 | Seletor `Conta que paga a fatura` / `Account that pays the bill` lista a checking, não lista savings, não cria sem uma, e o POST leva o id | vitest exit 0, ✓ | Opções e o POST estão em `frontend/src/pages/account-payment-account.test.tsx:177` `['Conta', 'Outra']`; `:178` não `['Poupança', 'Fechada']`; `:181` `create` `not.toHaveBeenCalled()`; `:189` `payment_account_id: conta.id`. O rótulo `:176` é `i18n.t('accounts.paymentAccount')`. `Conta que paga a fatura` e `Account that pays the bill` não se lêem na linha | FAIL |
| C19 | Nas configurações, o seletor grava o PATCH com a checking e, vazio, grava null | vitest exit 0, ✓ | `frontend/src/pages/account-payment-account.test.tsx:211` `payment_account_id: conta.id`; `:221` `payment_account_id: null` | PASS |
| C20 | Calendário da Conta: `Saldo real` / `Actual balance` com `1000.00`. De hoje em diante, `Saldo previsto` / `Projected balance` com o `ending_balance`. D mostra Nubank e `250.00` tracejado e não abre transação | vitest exit 0, ✓ | Amounts em `frontend/src/components/transaction-calendar-balance.test.tsx:123` `formatCurrency(1000, 'BRL', displayLocale)`; `:129` `formatCurrency(750, ...)`; `:134` `'Nubank'`; `:135` `formatCurrency(250, ...)`; `:133` `'border-dashed'`; `:137` `not.toHaveBeenCalled()`. Os rótulos `:122` e `:126` são `i18n.t('transactions.calendarActualBalance')` e `calendarProjectedBalance`. `Saldo real` e `Saldo previsto` não se lêem na linha | FAIL |

15 PASS, 5 FAIL.

## Swept `existing`

- observability: as rotas de conta e de calendário já estavam nos routers incluídos em `backend/app/main.py:177` e `:180`. O diff `da1a2ab..9a7cb44` não acrescenta `logger.` em `backend/app` nem em `frontend/src`. Uvicorn segue sem `--no-access-log` (`docker-compose.yml:125`). Nenhum evento de log novo.

## Gate

Mesmo pytest da onda: exit 0, `61 passed`. C1–C17 apareceram PASSED.

Mesmo vitest da onda: exit 0, `42 passed`. C18–C20 apareceram com `✓`.

Contagem deste checklist: 17 pytest PASSED, 3 vitest ✓. O veredito é FAIL por C8, C10, C16, C18 e C20.
