# Categorias do mês — verified

- Verdict: **PASS**
- Profile: light
- Diff range: `da1a2ab..9a7cb44` (HEAD de `integrate/onda-1`; proofs no HEAD integrado)
- Round: 1
- Verifier: independent

## Checks

| Check | Claim | Proof run | Evidência | Resultado |
| --- | --- | --- | --- | --- |
| C1 | Outubro: saídas Alimentação `140.0` e sem categoria `10.0`; entrada Salário `80.0`. Pending e pares ficam de fora. O total de Alimentação é o de spending-by-category. Sem `month`, o mesmo corpo | pytest exit 0, `test_october_posted_flows_match_spending_and_drop_pending_and_pairs` PASSED | `backend/tests/test_category_flows_api.py:172` `status_code == 200`; `:181` `"Alimentação"`; `:182` `140.0`; `:183` `category_id is None`; `:184` `10.0`; `:190` `"Salário"`; `:191` `80.0`; `:197` `food_flow["total"] == food_spend["total"]`; `:198` `salary_id not in`; `:201` `default_month.json() == body` | PASS |
| C2 | Cash: março `100.0` e abril `0.0`. Accrual: abril `100.0` e março `0.0`. Cada valor iguala spending-by-category | pytest exit 0, `test_outflows_follow_credit_card_accounting_mode` PASSED | `backend/tests/test_category_flows_api.py:251` `== [100.0]`; `:253` `== cash_march_spend`; `:254` `cash_april_spend == 0.0`; `:257` `== [100.0]`; `:258` `== accrual_april_spend`; `:259` `accrual_march_spend == 0.0` | PASS |
| C3 | Categoria oculta entra (`30.0`). Conta encerrada não (`999.0` ausente) | pytest exit 0, `test_hidden_category_counts_closed_account_does_not` PASSED | `backend/tests/test_category_flows_api.py:292` `== 30.0`; `:293` `== 15.0`; `:294` `999.0 not in by_id.values()` | PASS |
| C4 | Mês sem P&L: `200`, as duas listas `[]` | pytest exit 0, `test_month_without_pnl_rows_returns_empty_lists` PASSED | `backend/tests/test_category_flows_api.py:328` `status_code == 200`; `:330` `outflows == []`; `:331` `inflows == []` | PASS |
| C5 | Total decrescente. Percentuais `93.33`, `6.67`, `100.0` | pytest exit 0, `test_flows_sorted_by_total_with_share_of_list` PASSED | `backend/tests/test_category_flows_api.py:351` `sorted(..., reverse=True)`; `:357` `== 93.33`; `:358` `== 6.67`; `:359` `== 100.0` | PASS |
| C6 | pt-BR: `Saídas por categoria`, Alimentação `R$ 140,00`, depois `Sem categoria` `R$ 10,00`, Salário `R$ 80,00`. en: `Outflows by category`, `Uncategorized`, `Inflows by category`. Catálogo abaixo | vitest exit 0, ✓ | `frontend/src/pages/categories-month-flows.test.tsx:164` `Saídas por categoria`; `:171` Alimentação antes de `Sem categoria`; `:172` `R$ 140,00`; `:173` `R$ 10,00`; `:175` `R$ 80,00`; `:180` `Outflows by category`; `:181` `Uncategorized`; `:183` `Inflows by category` | PASS |
| C7 | Mês inicial é o corrente (outubro de 2026). Avançar tira `R$ 140,00` e pede `2026-11-01`. Voltar devolve Alimentação | vitest exit 0, ✓ | `frontend/src/pages/categories-month-flows.test.tsx:198` `/outubro de 2026/i`; `:202` `R$ 140,00` ausente; `:203` `R$ 50,00`; `:204` `'2026-11-01'`; `:209` `Alimentação` | PASS |
| C8 | Busca `ali` deixa Alimentação e tira Salário. Vazia volta ao critério 6. `zzz`: `Nenhuma categoria encontrada` / `No category found`, sem o texto de mês vazio | vitest exit 0, ✓ | `frontend/src/pages/categories-month-flows.test.tsx:220` `Alimentação`; `:222` Salário ausente; `:231` `Nenhuma categoria encontrada`; `:233` `Nenhuma saída neste mês` ausente; `:237` `No category found` `toHaveLength(2)`; `:238` `No outflows this month` ausente | PASS |
| C9 | Listas vazias: as seções ficam, com `Nenhuma saída neste mês` / `Nenhuma entrada neste mês` e o par em inglês | vitest exit 0, ✓ | `frontend/src/pages/categories-month-flows.test.tsx:249` `Nenhuma saída neste mês`; `:250` `Nenhuma entrada neste mês`; `:255` `No outflows this month`; `:256` `No inflows this month` | PASS |
| C10 | Mês seguinte ainda carregando: skeletons nas duas seções, sem o valor anterior | vitest exit 0, ✓ | `frontend/src/pages/categories-month-flows.test.tsx:274` `R$ 140,00` `not.toBeInTheDocument()`; `:276` skeleton em `Saídas por categoria`; `:277` skeleton em `Entradas por categoria` | PASS |
| C11 | Alimentação: `category_id=food`, `from=2026-10-01`, `to=2026-10-31`, `type=debit`. Sem categoria: `uncategorized=1` sem `category_id`. Salário: `type=credit` | vitest exit 0, ✓ | `frontend/src/pages/categories-month-flows.test.tsx:292` `category_id: 'food'`; `:293` `from: '2026-10-01'`; `:295` `type: 'debit'`; `:302` `uncategorized: '1'`; `:310` `category_id: 'salary'`; `:314` `type: 'credit'` | PASS |
| C12 | `Regras automáticas` / `Automatic rules` aponta para `/rules` com `canWrite` verdadeiro e falso | vitest exit 0, ✓ | `frontend/src/pages/categories-month-flows.test.tsx:321` `name: 'Regras automáticas'`; `:322` `href` `'/rules'`; `:327` de novo `'/rules'` depois de `canWrite = false` em `:325`; `:330` `Automatic rules` | PASS |
| C13 | `canWrite` verdadeiro abre `Nova Categoria`. Falso: o botão `Nova categoria` não aparece | vitest exit 0, ✓ | `frontend/src/pages/categories-month-flows.test.tsx:337` `name: 'Nova categoria'`; `:338` `Nova Categoria`; `:344` `queryByRole('button', { name: 'Nova categoria' })` `not.toBeInTheDocument()` | PASS |
| C14 | Regra `UBER` põe Transporte na corrente e no cartão, mesmo com categoria do provedor. Regra por `account_id` não categoriza o cartão | pytest exit 0, `test_sync_description_rule_categorizes_checking_and_card_and_account_rule_skips_card` PASSED | `backend/tests/test_sync_category_rule_lock.py:136` `uber-checking == transport.id`; `:137` `uber-card == transport.id`; `:138` `!= provider_category`; `:140` `padaria-checking == home.id`; `:141` `padaria-card == provider_category`; `:142` `!= home.id` | PASS |

14 PASS, 0 FAIL.

## Swept `existing`

- observability: `GET /category-flows` em `backend/app/api/dashboard.py:109` usa `Depends(current_workspace)` na linha 112, no mesmo router de `backend/app/main.py:189`. Uvicorn sem `--no-access-log` (`docker-compose.yml:125`). Nenhuma chamada `logger.` nova no diff.

## Gate

Mesmo pytest da onda: exit 0, `61 passed`. C1–C5 e C14 apareceram PASSED.

Mesmo vitest da onda: exit 0, `42 passed`. C6–C13 apareceram com `✓`.

Contagem deste checklist: 6 pytest PASSED, 8 vitest ✓. 14/14 com o valor do checklist legível na linha citada.
