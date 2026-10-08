# Composição e status da fatura — verified

- Verdict: **FAIL**
- Profile: light
- Diff range: `da1a2ab..9a7cb44` (HEAD de `integrate/onda-1`; proofs no HEAD integrado)
- Round: 1
- Verifier: independent

## Checks

| Check | Claim | Proof run | Evidência | Resultado |
| --- | --- | --- | --- | --- |
| C1 | Fatura selecionada: `bill_purchases` 150.00, `bill_refunds` 30.00, diferença = `projected_expenses` 120.00. `unbilled_only` mantém a mesma igualdade | pytest exit 0, `test_bill_purchases_and_refunds_for_selected_bill` PASSED | `backend/tests/test_bill_composition_api.py:210` `== pytest.approx(150.00)`; `:211` `== pytest.approx(30.00)`; `:215` `== pytest.approx(120.00)`; `:259` `== pytest.approx(57.00)`; `:261` diferença `== pytest.approx(open_body["projected_expenses"])` | PASS |
| C2 | Conta que não é `credit_card`: os quatro campos de composição são `null` | pytest exit 0, `test_bill_composition_null_for_non_credit_card` PASSED | `backend/tests/test_bill_composition_api.py:282` `bill_purchases is None`; `:283` `bill_refunds is None`; `:284` `bill_purchases_primary is None`; `:285` `bill_refunds_primary is None` | PASS |
| C3 | USD com taxa 5: compras 100.00 / 500.00, estornos 20.00 / 100.00, projetado 80.00 / 400.00 | pytest exit 0, `test_bill_composition_primary_converted_like_other_primary` PASSED | `backend/tests/test_bill_composition_api.py:318` `100.00`; `:319` `20.00`; `:320` `500.00`; `:321` `100.00`; `:325` `80.00`; `:326` `400.00` | PASS |
| C4 | Bloco em en: Purchases `R$150.00`, Refunds `R$30.00`, Bill `R$120.00` igual ao Total; `999` não entra | vitest exit 0, o `-t` marcou o teste ✓ | `frontend/src/pages/account-detail-composition.test.tsx:184` `Where this amount comes from`; `:186` `R$150.00`; `:187` `− Refunds`; `:188` `R$30.00`; `:190` `R$120.00`; `:191` `not.toContain('999')`; `:192` Total `R$120.00` | PASS |
| C5 | Estornos 0: linha `Refunds` ausente; Purchases e Bill no mesmo valor, igual ao Total | vitest exit 0, ✓ | `frontend/src/pages/account-detail-composition.test.tsx:200` `not.toContain('Refunds')`; `:204` `toHaveLength(2)` sobre `R$80.00`; `:205` Total `R$80.00` | PASS |
| C6 | pt-BR, fatura vazia: título, Compras e Fatura em `R$ 0,00`; Estornos ausente | vitest exit 0, ✓ | `frontend/src/pages/account-detail-composition.test.tsx:215` `De onde vem esse valor`; `:216` `Compras`; `:217` `Fatura`; `:218` `not.toContain('Estornos')`; `:219` `R$ 0,00` com `toHaveLength(2)` | PASS |
| C7 | Seletor na conta: `$10.00`, `$4.00`, `$6.00`. Na primária: `R$50.00`, `R$20.00`, `R$30.00`. Bill igual ao Total de cada modo | vitest exit 0, ✓ | `frontend/src/pages/account-detail-composition.test.tsx:235` `$10.00`; `:236` `$4.00`; `:237` `$6.00`; `:238` `not.toContain('R$50.00')`; `:244` `R$50.00`; `:245` `R$20.00`; `:246` `R$30.00`; `:247` `not.toContain('$10.00')` | PASS |
| C8 | Conta que não é cartão: o bloco não aparece | vitest exit 0, ✓ | `frontend/src/pages/account-detail-composition.test.tsx:257` `queryByText('Where this amount comes from')` `toBeNull()`; `:258` `De onde vem esse valor` `toBeNull()` | PASS |
| C9 | Ciclo em curso: `Open bill · closes 9/30/2026 · due 10/10/2026`, o mesmo fechamento do card de limite | vitest exit 0, ✓ | A frase está em `frontend/src/pages/account-detail-composition.test.tsx:267` `const sentence = 'Open bill · closes 9/30/2026 · due 10/10/2026'`. A asserção `:268` é `getByText(sentence)`. O valor do checklist não se lê na linha da asserção | FAIL |
| C10 | Bill que ancora: `Closed bill · closed 9/30/2026 · due 10/10/2026` e, no ciclo anterior, `closed 4/30/2026 · was due 5/10/2026` | vitest exit 0, ✓ | `frontend/src/pages/account-detail-composition.test.tsx:281` `getByText('Closed bill · closed 9/30/2026 · due 10/10/2026')`; `:285` `getByText('Closed bill · closed 4/30/2026 · was due 5/10/2026')` | PASS |
| C11 | Sem close day, nenhum estado. Com close day, o estado aparece. Janela editada à mão, nenhum estado | vitest exit 0, ✓ | `frontend/src/pages/account-detail-composition.test.tsx:293` `queryByText(/Open bill\|Closed bill/)` `toBeNull()`; `:298` `getByText('Open bill · closes 9/30/2026 · due 10/10/2026')`; `:305` de novo `toBeNull()` | PASS |
| C12 | Abaixo do Total: `Estimated — the bank hasn't closed this bill yet; we add up the charges it has sent` | vitest exit 0, ✓ | A frase está em `:314` `const estimate = "..."`. A asserção `:316` é `card.indexOf(estimate)`. O texto do checklist não se lê na linha da asserção | FAIL |
| C13 | Com bill ancorando, o aviso estimado não aparece | vitest exit 0, ✓ | `frontend/src/pages/account-detail-composition.test.tsx:326` `queryByText(/Estimated — the bank hasn't closed this bill yet/)` `toBeNull()` | PASS |

11 PASS, 2 FAIL.

## Swept `existing`

- authorization: `backend/app/api/accounts.py:55` continua `Depends(current_workspace)`, a mesma dependência da assinatura de `get_account_summary` em `da1a2ab`. A rota não troca quem pode ler.
- observability: o summary segue no `accounts_router` incluído em `backend/app/main.py:180`. O processo é `uvicorn app.main:app` sem `--no-access-log` (`docker-compose.yml:125`). O diff `da1a2ab..9a7cb44` não acrescenta `logger.` em `backend/app` nem em `frontend/src`.

## Gate

Um pytest, exit 0, `61 passed`. O teste nomeado de C1–C3 apareceu PASSED.

Um vitest, exit 0, `42 passed` (7 arquivos, um `-t` alternado). Os dez testes nomeados de C4–C13 apareceram com `✓`.

Os dois comandos abaixo são o lote da onda. O `-t` é a alternância `|` dos 42 títulos nomeados nos checklists. Cada um apareceu na saída com `✓`.

```
cd backend && uv run pytest -v --tb=line \
  tests/test_bill_composition_api.py \
  tests/test_upcoming_bills_api.py \
  tests/test_dashboard_credit_card_bills.py \
  tests/test_category_flows_api.py \
  tests/test_sync_category_rule_lock.py \
  tests/test_transaction_make_recurring.py \
  tests/test_payment_account_api.py \
  tests/test_calendar_account_balance.py
```

```
cd frontend && npx vitest run --reporter=verbose \
  src/pages/account-detail-composition.test.tsx \
  src/components/upcoming-bills-section.test.tsx \
  src/pages/dashboard-open-bills.test.tsx \
  src/pages/categories-month-flows.test.tsx \
  src/pages/transactions-make-recurring.test.tsx \
  src/pages/account-payment-account.test.tsx \
  src/components/transaction-calendar-balance.test.tsx \
  -t "<nomes dos 42 testes, unidos por |>"
```

Contagem deste checklist no lote: 3 pytest PASSED, 10 vitest ✓. O veredito é FAIL por C9 e C12: o teste passou e a frase do checklist está na linha de cima, não na asserção.
