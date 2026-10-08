# Próximas faturas — verified

- Verdict: **FAIL**
- Profile: light
- Diff range: `da1a2ab..9a7cb44` (HEAD de `integrate/onda-1`; proofs no HEAD integrado)
- Round: 1
- Verifier: independent

## Checks

| Check | Claim | Proof run | Evidência | Resultado |
| --- | --- | --- | --- | --- |
| C1 | `cycles=3`: vencimentos `2026-11-17`, `2026-12-17`, `2027-01-17`; fechamentos `2026-11-10`, `2026-12-10`, `2027-01-10`; totais `149.00`, `99.00`, `99.00`; moeda BRL; a contagem de transações não muda | pytest exit 0, `test_synced_series_projects_next_parcels_at_last_amount` PASSED | `backend/tests/test_upcoming_bills_api.py:168` `"2026-11-17"`; `:173` `"2026-11-10"`; `:178` `Decimal("149.00")`; `:179` `Decimal("99.00")`; `:187` `{"BRL"}`; `:157` e `:188` `_tx_count(...) == 5` | PASS |
| C2 | `future_committed_total` e o primário são `644.00` com `cycles=1` e sem o corte | pytest exit 0, `test_future_committed_total_ignores_cycles_cutoff` PASSED | `backend/tests/test_upcoming_bills_api.py:211` `Decimal("644.00")`; `:212` primário `644.00`; `:214` `len(...) == 1`; `:215` de novo `644.00` | PASS |
| C3 | Série completa não projeta; o primeiro ciclo soma `42.00` | pytest exit 0, `test_complete_series_projects_nothing_and_only_bill_rows_sum` PASSED | `backend/tests/test_upcoming_bills_api.py:337` `== [Decimal("42.00"), Decimal("0.00"), Decimal("0.00")]` | PASS |
| C4 | Âncora ignorada, nos dois caminhos: três totais `0.00` e futuro `0.00`, não null | pytest exit 0, PASSED `[fingerprint]` e `[series_id]` | `backend/tests/test_upcoming_bills_api.py:383` `Decimal("0.00")` três vezes; `:387` futuro `Decimal("0.00")`; `:388` `is not None` | PASS |
| C5 | Sem close, sem due, ou checking: `200`, `cycles=[]`, futuros `null` | pytest exit 0, PASSED `[credit_card-None-17]`, `[credit_card-10-None]`, `[checking-10-17]` | `backend/tests/test_upcoming_bills_api.py:431` `status_code == 200`; `:433` `cycles == []`; `:434` `future_committed_total is None`; `:435` primário `is None` | PASS |
| C6 | Outro workspace: `404` | pytest exit 0, `test_other_workspace_upcoming_bills_404` PASSED | `backend/tests/test_upcoming_bills_api.py:465` `status_code == 404` | PASS |
| C7 | Sem `cycles`: seis vencimentos de `2026-11-17` a `2027-04-17` e totais `149.00`, depois cinco `99.00` | pytest exit 0, `test_cycles_defaults_to_six` PASSED | `backend/tests/test_upcoming_bills_api.py:484` `"2026-11-17"` … `:489` `"2027-04-17"`; `:492` `Decimal("149.00")`; `:493` `Decimal("99.00")` | PASS |
| C8 | `cycles=0` e `cycles=25`: `422` | pytest exit 0, PASSED `[0]` e `[25]` | `backend/tests/test_upcoming_bills_api.py:517` `status_code == 422`. Os valores 0 e 25 estão no id do teste que passou | PASS |
| C9 | `cycles=1`: um ciclo `149.00` e futuro `644.00`. `cycles=24`: 24 ciclos, os seis primeiros iguais a C7, dezoito `0.00`, futuro continua `644.00` | pytest exit 0, `test_cycles_bounds_keep_future_total` PASSED | `backend/tests/test_upcoming_bills_api.py:531` `len == 1`; `:532` `Decimal("149.00")`; `:533` `Decimal("644.00")`; `:538` `len(totals) == 24`; `:540` `Decimal("149.00")`; `:547` `[Decimal("0.00")] * 18`; `:548` `644.00` | PASS |
| C10 | USD: `committed_total` `14.00`, primário `77.00`, futuros iguais, moeda `USD` | pytest exit 0, `test_primary_totals_use_stored_amount_primary` PASSED | `backend/tests/test_upcoming_bills_api.py:592` `== "USD"`; `:593` `Decimal("14.00")`; `:594` `Decimal("77.00")`; `:595` futuro `14.00`; `:596` futuro primário `77.00` | PASS |
| C11 | pt-BR: `Próximas faturas`, a nota, mês `MMM yyyy` e `committed_total` formatado | vitest exit 0, ✓ | `frontend/src/components/upcoming-bills-section.test.tsx:81` `'Próximas faturas'`; `:82` `'estimativa com as parcelas e lançamentos já conhecidos'`; `:86` `monthLabel('2026-11-17', 'pt-BR')`; `:51` `format(..., 'MMM yyyy')`; `:87` `formatCurrency(149, 'BRL', 'pt-BR')` | PASS |
| C12 | en: `Upcoming bills` e a nota em inglês | vitest exit 0, ✓ | `frontend/src/components/upcoming-bills-section.test.tsx:98` `'Upcoming bills'`; `:99` `'estimate from known installments and charges'` | PASS |
| C13 | Totais 0 e futuro 0, e o mesmo com futuro `null`: a seção não aparece | vitest exit 0, ✓ | `frontend/src/components/upcoming-bills-section.test.tsx:103` `for (const future of [0, null])`; `:112` `queryByRole('heading', { name: 'Upcoming bills' })` `toBeNull()` | PASS |
| C14 | Ciclos em 0 com futuro diferente de 0: a seção aparece | vitest exit 0, ✓ | `frontend/src/components/upcoming-bills-section.test.tsx:125` `findByRole('heading', { name: 'Upcoming bills' })` | PASS |
| C15 | Enquanto carrega: sem seção e sem `.animate-pulse` | vitest exit 0, ✓ | `frontend/src/components/upcoming-bills-section.test.tsx:134` heading `toBeNull()`; `:135` `querySelector('.animate-pulse')` `toBeNull()` | PASS |
| C16 | Tipo diferente de cartão: não renderiza e não chama `upcomingBills` | vitest exit 0, ✓ | `frontend/src/components/upcoming-bills-section.test.tsx:142` `not.toHaveBeenCalled()`; `:143` heading `toBeNull()` | PASS |
| C17 | Seletor na moeda da conta mostra o total USD; na primária, o total BRL. O outro número não aparece | vitest exit 0, ✓ | `formatCurrency(14, 'USD', 'en-US')` e `formatCurrency(77, 'BRL', 'en-US')` estão em `:158` e `:159`. As asserções `:168` e `:179` são `.toBe(usd)` e `.toBe(brl)`. O valor esperado não se lê na linha da asserção | FAIL |

16 PASS, 1 FAIL.

## Swept `existing`

- observability: `GET /{account_id}/upcoming-bills` está em `backend/app/api/accounts.py:145`, no mesmo router incluído em `backend/app/main.py:180`. Uvicorn sem `--no-access-log` em `docker-compose.yml:125`. O diff não acrescenta `logger.`.

## Gate

O mesmo pytest da onda: exit 0, `61 passed`. As dez funções de C1–C10 apareceram PASSED, inclusive as expansões `[fingerprint]`, `[series_id]`, os três cartões de C5 e `[0]` / `[25]` de C8.

O mesmo vitest da onda: exit 0, `42 passed`. Os sete testes de C11–C17 apareceram com `✓`.

Contagem deste checklist: 10 pytest PASSED (14 itens com a parametrização), 7 vitest ✓. O veredito é FAIL por C17.
