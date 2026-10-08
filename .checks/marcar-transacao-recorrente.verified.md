# Marcar transação como recorrente — verified

- Verdict: **FAIL**
- Profile: light
- Diff range: `da1a2ab..9a7cb44` (HEAD de `integrate/onda-1`; proofs no HEAD integrado)
- Round: 1
- Verifier: independent

## Checks

| Check | Claim | Proof run | Evidência | Resultado |
| --- | --- | --- | --- | --- |
| C1 | Sem vínculo, par, parcela ou série: checkbox `Make recurring` / `Tornar recorrente` desmarcado na criação e na edição. A lista não mostra `Recurring` / `Recorrente` | vitest exit 0, ✓ | `frontend/src/pages/transactions-make-recurring.test.tsx:220` `queryByText('Recurring')` ausente; `:221` `Recorrente` ausente; `:224` `'Make recurring'` e `'Tornar recorrente'`; `:232` `not.toBeChecked()`; `:238` `not.toBeChecked()` em cada linha | PASS |
| C2 | Cartão sincronizado, `frequency=monthly`: `201`, `recurring_transaction_id` preenchido, `date` `2026-10-07`, `amount` `49.90`, `status` `posted`, `source` `sync`, `bill_id` o de antes | pytest exit 0, `test_synced_credit_card_links_without_changing_posted_fields` PASSED | `backend/tests/test_transaction_make_recurring.py:157` `status_code == 201`; `:160` `== "2026-10-07"`; `:161` `Decimal("49.90")`; `:162` `== "posted"`; `:163` `== "sync"`; `:164` `bill_id == str(bill.id)` | PASS |
| C3 | Salvar monthly mostra o badge `Recurring`. Reabrir mostra a frase de vínculo e o botão `Unlink` | vitest exit 0, ✓ | `frontend/src/pages/transactions-make-recurring.test.tsx:269` `{ frequency: 'monthly' }`; `:270` `'Recurring'`; `:273` `'This transaction is linked to a recurring bill.'`; `:274` `name: 'Unlink'` | PASS |
| C4 | Criação manual com o checkbox: a transação fica com `recurring_transaction_id` e a lista mostra `Recurring` | vitest exit 0, ✓ | `frontend/src/pages/transactions-make-recurring.test.tsx:310` `{ frequency: 'monthly' }`; `:315` `'Recurring'`; `:316` `recurring_transaction_id` `=== 'rec-1'` | PASS |
| C5 | A regra copia `description`, `amount`, `currency`, `type`, `account_id`, `category_id`. `start_date` é a data. `end_date` null ou a data escolhida. `auto_generate` true, `is_active` true, `weekend_adjustment` `none`. O GET lista a linha | pytest exit 0, `test_rule_copies_the_transaction_and_is_listed` PASSED | Amount, moeda, tipo, conta, categoria, `start_date` `"2026-10-07"`, `frequency` `"monthly"`, `end_date is None`, `auto_generate is True`, `is_active is True` e `weekend_adjustment == "none"` estão em `backend/tests/test_transaction_make_recurring.py:238`–`:248` e `:252`–`:262` (`end_date == "2027-06-01"`). `description` só entra em `:236` `by_description["Open ended"]`, que não é asserção | FAIL |
| C6 | Weekly em `2026-10-07`: `next_occurrence` `2026-10-14`, `day_of_month` null | pytest exit 0, `test_weekly_next_occurrence_is_seven_days_later` PASSED | `backend/tests/test_transaction_make_recurring.py:275` `== date(2026, 10, 14)`; `:276` `day_of_month is None` | PASS |
| C7 | Monthly sem dia: `next_occurrence` `2026-11-07`, `day_of_month` null. Continua uma transação em `2026-10-07`. A projeção traz `2026-11-07`, a descrição e `49.90`, e não traz `2026-10-07` | pytest exit 0, `test_monthly_without_day_projects_only_the_next_month` PASSED | `backend/tests/test_transaction_make_recurring.py:297` `== date(2026, 11, 7)`; `:298` `is None`; `:311` `len(charges) == 1`; `:321` `"2026-11-07"`; `:322` `"Streaming"`; `:323` `Decimal("49.90")`; `:326` `!= "2026-10-07"` | PASS |
| C8 | Monthly, dia 15: `next_occurrence` `2026-11-15`, `day_of_month` `15` | pytest exit 0, `test_monthly_day_15_lands_on_the_fifteenth` PASSED | `backend/tests/test_transaction_make_recurring.py:341` `== date(2026, 11, 15)`; `:342` `== 15` | PASS |
| C9 | Monthly, dia 31 a partir de `2026-01-31`: `next_occurrence` `2026-02-28`, `day_of_month` `31` | pytest exit 0, `test_monthly_day_31_clamps_to_february_28` PASSED | `backend/tests/test_transaction_make_recurring.py:359` `== date(2026, 2, 28)`; `:360` `== 31` | PASS |
| C10 | Quarterly sem dia: `next_occurrence` `2027-01-07` | pytest exit 0, `test_quarterly_without_day_advances_three_months` PASSED | `backend/tests/test_transaction_make_recurring.py:373` `== date(2027, 1, 7)` | PASS |
| C11 | Com o checkbox: ordem Monthly…Yearly e Mensal…Anual, dia do mês só em monthly/quarterly/semiannual/yearly, fim opcional. Dia 15 vai no save; weekly não manda `day_of_month` | vitest exit 0, ✓ | `frontend/src/pages/transactions-make-recurring.test.tsx:331` `['monthly', 'Monthly']` … `:336` `['yearly', 'Yearly']`; `:339` `'Day of month'`; `:340` `'End date (optional)'`; `:348` `'weekly'` esconde o dia; `:353` `'Mensal'`; `:361` `'Data de fim (opcional)'`; `:377` `day_of_month: 15`; `:387` `{ frequency: 'weekly' }` | PASS |
| C12 | Já vinculada: `400` `Transaction is already linked to a recurring bill`. A contagem continua 1 | pytest exit 0, `test_already_linked_is_400_and_count_stays_one` PASSED | `backend/tests/test_transaction_make_recurring.py:387` `status_code == 400`; `:388` `== "Transaction is already linked to a recurring bill"`; `:390` `len(rules) == 1` | PASS |
| C13 | A transação já vinculada não mostra o checkbox | vitest exit 0, ✓ | `frontend/src/pages/transactions-make-recurring.test.tsx:397` `queryByRole('checkbox', { name: 'Make recurring' })` `not.toBeInTheDocument()` | PASS |
| C14 | Transferência: `400` `A transfer cannot be marked recurring`. Não cria regra | pytest exit 0, `test_transfer_cannot_be_marked_recurring` PASSED | `backend/tests/test_transaction_make_recurring.py:407` `status_code == 400`; `:408` `== "A transfer cannot be marked recurring"`; `:409` `_rules(...) == []` | PASS |
| C15 | A transferência não mostra o checkbox | vitest exit 0, ✓ | `frontend/src/pages/transactions-make-recurring.test.tsx:404` `name: 'Make recurring'` `not.toBeInTheDocument()` | PASS |
| C16 | `installment_number` ou `installment_series_id`: `400` `An installment cannot be marked recurring`. Não cria | pytest exit 0, `test_installment_cannot_be_marked_recurring` PASSED | `backend/tests/test_transaction_make_recurring.py:426` `status_code == 400`; `:427` `== "An installment cannot be marked recurring"`; `:428` `_rules(...) == []` | PASS |
| C17 | Os dois casos de parcela não mostram o checkbox | vitest exit 0, ✓ | `frontend/src/pages/transactions-make-recurring.test.tsx:415` `name: 'Make recurring'` `not.toBeInTheDocument()` | PASS |
| C18 | Frequência fora do conjunto, dia fora de 1–31, ou dia com weekly/biweekly: `422` e não cria | pytest exit 0, `test_invalid_frequency_or_day_is_422_and_creates_nothing` PASSED | `backend/tests/test_transaction_make_recurring.py:452` `status_code == 422`; `:453` `_rules(...) == []` | PASS |
| C19 | Transação de outro workspace: `404` `Transaction not found` | pytest exit 0, `test_transaction_absent_from_workspace_is_404` PASSED | `backend/tests/test_transaction_make_recurring.py:479` `status_code == 404`; `:480` `== "Transaction not found"` | PASS |
| C20 | Papel de leitura: `403` `Read-only role`. Nenhuma regra criada | pytest exit 0, `test_viewer_is_403_and_creates_nothing` PASSED | `backend/tests/test_transaction_make_recurring.py:500` `status_code == 403`; `:501` `== "Read-only role"`; `:502` `_rules(...) == []` | PASS |
| C21 | Commit do vínculo que falha: `recurring_transaction_id` continua `null` e não resta linha em `recurring_transactions` | pytest exit 0, `test_failed_link_leaves_no_recurring_row` PASSED | `backend/tests/test_transaction_make_recurring.py:533` `pytest.raises(IntegrityError)`; `:539` `recurring_transaction_id is None`; `:540` `_rules(...) == []` | PASS |
| C22 | Num `400`, o toast mostra o `detail` e o badge `Recurring` não aparece | vitest exit 0, ✓ | `frontend/src/pages/transactions-make-recurring.test.tsx:437` `toast.error` `'Transaction is already linked to a recurring bill'`; `:439` `queryByText('Recurring')` `not.toBeInTheDocument()` | PASS |

21 PASS, 1 FAIL.

## Swept `existing`

- observability: `POST /{transaction_id}/make-recurring` em `backend/app/api/transactions.py:531` está no `transactions_router` incluído em `backend/app/main.py:177`. Uvicorn sem `--no-access-log` (`docker-compose.yml:125`). O diff não acrescenta `logger.`.

## Gate

Mesmo pytest da onda: exit 0, `61 passed`. Os 14 testes de C2 e C5–C12, C14, C16, C18–C21 apareceram PASSED.

Mesmo vitest da onda: exit 0, `42 passed`. Os 8 testes de C1, C3, C4, C11, C13, C15, C17 e C22 apareceram com `✓`.

Contagem deste checklist: 14 pytest PASSED, 8 vitest ✓. O veredito é FAIL por C5.
