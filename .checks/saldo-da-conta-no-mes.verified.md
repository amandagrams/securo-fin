Verdict: PASS
Profile: light
Diff range: da1a2ab..8ddb587
Round: 2 - scoped
Verifier: independent

HEAD `8ddb587`. Proofs deste HEAD (um pytest com os arquivos nomeados, um vitest com os arquivos e um `-t` alternado). Exit 0. Um proof verde antigo não entra.

- Backend: `cd backend && uv sync --all-extras && uv run pytest -v tests/test_payment_account_api.py tests/test_calendar_account_balance.py` — os 17 testes nomeados PASSED.
- Frontend: `cd frontend && npx vitest run src/pages/account-payment-account.test.tsx src/components/transaction-calendar-balance.test.tsx -t "<nomes alternados>"` — os 3 `it` nomeados apareceram como passed.

20/20 PASS. C8, C10, C16, C18 e C20 têm evidência nova. O resto não mudou de asserção.

**C1** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_create_credit_card_requires_payment_account` PASSED.

**C2** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_create_credit_card_returns_payment_account` PASSED.

**C3** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_invalid_payment_account_in_workspace_is_422` PASSED.

**C4** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_payment_account_in_other_workspace_is_404` PASSED.

**C5** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_patch_payment_account_on_existing_and_synced_card` PASSED.

**C6** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_null_payment_account_does_not_move_checking_calendar` PASSED.

**C7** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_delete_checking_nulls_payment_account_keeps_card` PASSED.

**C8** — PASS. Evidência nova. `1000.0`, `920.0`, `1120.0` e `1080.0` estão no `assert`, não numa variável `expected`:

- `backend/tests/test_calendar_account_balance.py:132` — `assert body["actual_balance"] == 1000.0`
- `backend/tests/test_calendar_account_balance.py:134` — `row["ending_balance"] == 1000.0` para dias anteriores a T
- `backend/tests/test_calendar_account_balance.py:139` — `row["ending_balance"] == 920.0` de T até o dia anterior a C
- `backend/tests/test_calendar_account_balance.py:144` — `row["ending_balance"] == 1120.0` de C até o dia anterior a X
- `backend/tests/test_calendar_account_balance.py:149` — `row["ending_balance"] == 1080.0` de X em diante
- `backend/tests/test_calendar_account_balance.py:155` — `assert mercado_item["kind"] == "projected"`
- `backend/tests/test_calendar_account_balance.py:157` — `assert mercado_item["type"] == "debit"`
- `backend/tests/test_calendar_account_balance.py:158` — `assert mercado_item["amount"] == 80.0`
- `backend/tests/test_calendar_account_balance.py:161` — `assert salary_item["kind"] == "projected"`
- `backend/tests/test_calendar_account_balance.py:163` — `assert salary_item["type"] == "credit"`
- `backend/tests/test_calendar_account_balance.py:164` — `assert salary_item["amount"] == 200.0`
- `backend/tests/test_calendar_account_balance.py:168` — a diferença de `ending_balance` em X é `== -40.0`

`Mercado` e `Salário` estão nos predicados de `next` nas linhas 154 e 160, imediatamente antes desses `assert`. `is_transfer` está no predicado da linha 166. Proof neste HEAD: `test_projected_walk_pending_future_posted_and_transfer` PASSED.

**C9** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_recurring_projects_once_and_past_posted_stay_actual` PASSED.

**C10** — PASS. Evidência nova. `1000.0`, `750.0` e `Nubank` estão no `assert`:

- `backend/tests/test_calendar_account_balance.py:253` — `assert body["actual_balance"] == 1000.0`
- `backend/tests/test_calendar_account_balance.py:255` — `row["ending_balance"] == (750.0 if date.fromisoformat(row["date"]) >= due else 1000.0)`
- `backend/tests/test_calendar_account_balance.py:260` — `assert any(item["description"] == "Nubank" for item in due_row["items"])`
- `backend/tests/test_calendar_account_balance.py:262` — `assert bill["kind"] == "projected"`
- `backend/tests/test_calendar_account_balance.py:263` — `assert bill["id"] is None`
- `backend/tests/test_calendar_account_balance.py:264` — `assert bill["recurring_id"] is None`
- `backend/tests/test_calendar_account_balance.py:265` — `assert bill["type"] == "debit"`
- `backend/tests/test_calendar_account_balance.py:266` — `assert bill["amount"] == 250.0`
- `backend/tests/test_calendar_account_balance.py:267` — `assert bill["currency"] == "BRL"`
- `backend/tests/test_calendar_account_balance.py:269` — `assert due_row["projected_expense"] == 250.0`
- `backend/tests/test_calendar_account_balance.py:270` — `assert due_row["projected_count"] == 1`

Proof neste HEAD: `test_card_cycle_drops_checking_on_due_date_once` PASSED.

**C11** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_bill_row_total_replaces_cycle_sum` PASSED.

**C12** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_payment_transfer_on_due_date_suppresses_bill_line` PASSED.

**C13** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_bill_does_not_leave_the_other_checking` PASSED.

**C14** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_bill_before_grid_is_carried_in_the_seed` PASSED.

**C15** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_due_today_or_earlier_does_not_move_balances` PASSED.

**C16** — PASS. Evidência nova. Sem filtro, `1000.0` e `750.0` estão no `assert`; com `account_id` da Conta, o mesmo par e `Nubank`:

- `backend/tests/test_calendar_account_balance.py:447` — `assert combined["actual_balance"] == 1000.0`
- `backend/tests/test_calendar_account_balance.py:448` — `assert combined["account_ids"] is None`
- `backend/tests/test_calendar_account_balance.py:450` — `row["ending_balance"] == (750.0 if date.fromisoformat(row["date"]) >= due else 1000.0)`
- `backend/tests/test_calendar_account_balance.py:455` — `assert filtered["actual_balance"] == 1000.0`
- `backend/tests/test_calendar_account_balance.py:456` — `assert _on(filtered, due)["ending_balance"] == 750.0`
- `backend/tests/test_calendar_account_balance.py:457` — `assert any(item["description"] == "Nubank" for item in _on(filtered, due)["items"])`

O real `1000.0` é a soma das checking abertas: a poupança semeada com 5000 e o saldo do cartão não entram nesse literal. A queda 1000 → 750 em D é a fatura de 250. Proof neste HEAD: `test_unfiltered_sum_is_open_checking_plus_the_bill` PASSED.

**C17** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_bill_converts_with_fx_convert_and_falls_back_one_to_one` PASSED.

**C18** — PASS. Evidência nova. Os dois rótulos estão no `expect`:

- `frontend/src/pages/account-payment-account.test.tsx:176` — `expect(screen.getByText(language === 'pt-BR' ? 'Conta que paga a fatura' : 'Account that pays the bill'))`
- `frontend/src/pages/account-payment-account.test.tsx:177` — `expect.arrayContaining(['Conta', 'Outra'])`
- `frontend/src/pages/account-payment-account.test.tsx:178` — `not.toEqual(expect.arrayContaining(['Poupança', 'Fechada']))`
- `frontend/src/pages/account-payment-account.test.tsx:181` — `expect(api.accounts.create).not.toHaveBeenCalled()` sem checking selecionada
- `frontend/src/pages/account-payment-account.test.tsx:185` — o POST leva `payment_account_id: conta.id` junto com `name: 'Nubank'` e `type: 'credit_card'`

Proof neste HEAD: `create card dialog requires the checking account that pays the bill` passed.

**C19** — PASS, carried from 9a7cb44. Proof neste HEAD: `card settings selector patches the payment account and can be cleared` passed.

**C20** — PASS. Evidência nova. `Saldo real` / `Actual balance` e `Saldo previsto` / `Projected balance` estão no `expect`, com 1000, 750, `Nubank` e 250:

- `frontend/src/components/transaction-calendar-balance.test.tsx:122` — `toContain(language === 'pt-BR' ? 'Saldo real' : 'Actual balance')`
- `frontend/src/components/transaction-calendar-balance.test.tsx:123` — `toContain(formatCurrency(1000, 'BRL', displayLocale))`
- `frontend/src/components/transaction-calendar-balance.test.tsx:126` — `text.includes(language === 'pt-BR' ? 'Saldo previsto' : 'Projected balance')`
- `frontend/src/components/transaction-calendar-balance.test.tsx:127` — `formatCurrency(1000, 'BRL', displayLocale)` em 2 legendas
- `frontend/src/components/transaction-calendar-balance.test.tsx:128` — `formatCurrency(750, 'BRL', displayLocale)` em 6 legendas
- `frontend/src/components/transaction-calendar-balance.test.tsx:132` — `toContain('border-dashed')`
- `frontend/src/components/transaction-calendar-balance.test.tsx:133` — `toContain('Nubank')`
- `frontend/src/components/transaction-calendar-balance.test.tsx:134` — `toContain(formatCurrency(250, 'BRL', displayLocale))`
- `frontend/src/components/transaction-calendar-balance.test.tsx:136` — `expect(onOpenTransaction).not.toHaveBeenCalled()`

Proof neste HEAD: `shows actual and projected balances and does not open a bill line` passed.
