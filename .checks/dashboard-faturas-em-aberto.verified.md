# Dashboard — faturas em aberto — verified

- Verdict: **FAIL**
- Profile: light
- Diff range: `da1a2ab..9a7cb44` (HEAD de `integrate/onda-1`; proofs no HEAD integrado)
- Round: 1
- Verifier: independent

## Checks

| Check | Claim | Proof run | Evidência | Resultado |
| --- | --- | --- | --- | --- |
| C1 | Duas contas, `200`, `due_date` crescente, status `closed` / `open`, amounts `145.0` e `40.0` iguais ao `projected_expenses` do summary | pytest exit 0, `test_two_open_cards_ordered_by_due_date_match_account_summary` PASSED | `backend/tests/test_dashboard_credit_card_bills.py:256` `status_code == 200`; `:268` `== "closed"`; `:271` `== pytest.approx(145.0)`; `:280` `== "open"`; `:283` `== pytest.approx(40.0)` | PASS |
| C2 | `total_primary` soma `amount_primary` (`300.0`, não a soma dos `amount` `140.0`); `accounts_count` é o número de itens; `earliest_due_date` é o menor vencimento | pytest exit 0, `test_aggregates_sum_amount_primary_count_and_earliest_due` PASSED | `backend/tests/test_dashboard_credit_card_bills.py:319` primário USD `200.0`; `:322` `sum(item["amount_primary"] ...)`; `:323` `300.0`; `:324` soma dos `amount` `140.0`; `:325` `accounts_count == len(items)`; `:327` `== usd_due.isoformat()` | PASS |
| C3 | Sem bills, com os dois dias: amount `80.0`, due/close de `get_cycle_dates`, status pelo `close_date` | pytest exit 0, `test_card_without_bills_uses_get_cycle_dates_window` PASSED | `backend/tests/test_dashboard_credit_card_bills.py:366` `== pytest.approx(80.0)`; `:362` `due.isoformat()`; `:363` `close.isoformat()`; `:364` `"open" if close >= today else "closed"` | PASS |
| C4 | Sem ciclo, um dia só, encerrada e não-cartão ficam de fora. A elegível é a única, amount `10.0` | pytest exit 0, `test_cards_without_cycle_and_closed_accounts_are_excluded` PASSED | `backend/tests/test_dashboard_credit_card_bills.py:400` `ids == {str(eligible.id)}`; `:401`–`:405` os outros `not in ids`; `:406` `10.0`; `:408` `accounts_count == 1` | PASS |
| C5 | Grupo compartilhado: um item, o de `name` Alpha (visto como `Zeta Card`), `total_primary` `100.0`, o outro não entra | pytest exit 0, `test_shared_balance_group_counts_once_first_by_name` PASSED | `backend/tests/test_dashboard_credit_card_bills.py:440` `len == 1`; `:442` `account_id == str(alpha.id)`; `:443` `== "Zeta Card"`; `:445` `100.0`; `:447` `total_primary` `100.0`; `:450` beta `not in` | PASS |
| C6 | Nenhuma elegível: `200`, `items` `[]`, `total_primary` `0`, `accounts_count` `0`, `earliest_due_date` `null` | pytest exit 0, `test_no_eligible_cards_returns_empty_aggregates` PASSED | `backend/tests/test_dashboard_credit_card_bills.py:470` `"items": []`; `:471` `0.0`; `:472` `0`; `:473` `None` | PASS |
| C7 | Só bill vencida: ciclo que contém hoje, status `open`, amount `42.0`, vencimento diferente do da bill vencida | pytest exit 0, `test_past_due_bill_falls_back_to_current_cycle` PASSED | `backend/tests/test_dashboard_credit_card_bills.py:513` `due_date != overdue_due.isoformat()`; `:517` `== "open"`; `:519` `== pytest.approx(42.0)` | PASS |
| C8 | en: `Open bills`, subtítulo `{count} cards · due {date}`, máscara, `due {dd MMM}`, amount na moeda da conta, clique em `/accounts/{id}` | vitest exit 0, ✓ | Título em `frontend/src/pages/dashboard-open-bills.test.tsx:143` `name: 'Open bills'`. Máscara `:151` `'•••• 1234'`. Amount `:153` `formatCurrency(80, 'EUR', 'en-US')`. Link `:154` `'/accounts/card-a'`. O subtítulo `:148` e o `due` `:152` são `t('dashboard.openBillsSubtitle', ...)` e `t('dashboard.openBillsDue', ...)`. A copy `cards · due` / `due` não se lê na linha | FAIL |
| C9 | pt-BR: `Faturas em aberto`, `{count} cartões · vence {date}`, linha `vence {dd MMM}` | vitest exit 0, ✓ | Título em `:169` `name: 'Faturas em aberto'`. Subtítulo `:172` e linha `:174` usam `t('dashboard.openBillsSubtitle')` e `t('dashboard.openBillsDue')`. `cartões · vence` e `vence` não se lêem na linha | FAIL |
| C10 | `items` vazio: o bloco não aparece | vitest exit 0, ✓ | `frontend/src/pages/dashboard-open-bills.test.tsx:187` `queryByRole('region', { name: 'Open bills' })` `not.toBeInTheDocument()`; `:188` `queryByText('Open bills')` | PASS |
| C11 | Carregando: um `.h-9.w-40`, quatro `.h-12.w-full`, nenhuma linha de fatura | vitest exit 0, ✓ | `frontend/src/pages/dashboard-open-bills.test.tsx:195` `.h-9.w-40` `toHaveLength(1)`; `:196` `.h-12.w-full` `toHaveLength(4)`; `:197` `Alpha` ausente; `:198` sem link | PASS |
| C12 | Mudar o mês não refaz a leitura das faturas; o gasto por categoria muda | vitest exit 0, ✓ | `frontend/src/pages/dashboard-open-bills.test.tsx:205` `toHaveBeenCalledWith()`; `:213` `toHaveBeenCalledTimes(1)`; `:214` `call.length === 0`; `:210` `spendingByCategory` `toHaveBeenCalledWith(nextFrom, undefined)` | PASS |
| C13 | Filtro de contas: o item de fora sai; total, contagem e data do subtítulo são só os visíveis | vitest exit 0, ✓ | `frontend/src/pages/dashboard-open-bills.test.tsx:229` Alpha ausente; `:231` `formatCurrency(140, 'USD', 'en-US')` ausente; `:233` `formatCurrency(40, 'USD', 'en-US')`; `:234` `count: 1` mas `date: later`. `2026-11-20` está na atribuição `:228`, não na asserção | FAIL |

10 PASS, 3 FAIL.

## Swept `existing`

- observability: `GET /credit-card-bills` em `backend/app/api/dashboard.py:99` usa `Depends(current_workspace)` na linha 101, no router incluído em `backend/app/main.py:189`. Uvicorn sem `--no-access-log` (`docker-compose.yml:125`). Nenhuma chamada `logger.` nova no diff.

## Gate

Mesmo pytest da onda: exit 0, `61 passed`. C1–C7 apareceram PASSED.

Mesmo vitest da onda: exit 0, `42 passed`. C8–C13 apareceram com `✓`.

Contagem deste checklist: 7 pytest PASSED, 6 vitest ✓. O veredito é FAIL por C8, C9 e C13.
