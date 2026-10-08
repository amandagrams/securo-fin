Verdict: PASS
Profile: light
Diff range: da1a2ab..8ddb587
Round: 2 - scoped
Verifier: independent

HEAD `8ddb587`. Proofs deste HEAD (um pytest com os arquivos nomeados, um vitest com os arquivos e um `-t` alternado). Exit 0. Um proof verde antigo não entra.

- Backend: `cd backend && uv sync --all-extras && uv run pytest -v tests/test_upcoming_bills_api.py` — os 10 testes nomeados PASSED (C4 nos params `fingerprint` e `series_id`; C5 nos três casos de conta; C8 nos params `0` e `25`).
- Frontend: `cd frontend && npx vitest run src/components/upcoming-bills-section.test.tsx -t "<nomes alternados>"` — os 7 `it` nomeados apareceram como passed.

17/17 PASS. C17 tem evidência nova. O resto não mudou de asserção.

**C1** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_synced_series_projects_next_parcels_at_last_amount` PASSED.

**C2** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_future_committed_total_ignores_cycles_cutoff` PASSED.

**C3** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_complete_series_projects_nothing_and_only_bill_rows_sum` PASSED.

**C4** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_ignored_latest_parcel_suppresses_projection[fingerprint]` e `[series_id]` PASSED.

**C5** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_unconfigured_or_non_card_returns_empty` PASSED para `credit_card-None-17`, `credit_card-10-None` e `checking-10-17`.

**C6** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_other_workspace_upcoming_bills_404` PASSED.

**C7** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_cycles_defaults_to_six` PASSED.

**C8** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_cycles_out_of_range_422[0]` e `[25]` PASSED.

**C9** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_cycles_bounds_keep_future_total` PASSED.

**C10** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_primary_totals_use_stored_amount_primary` PASSED.

**C11** — PASS, carried from 9a7cb44. Proof neste HEAD: `lists each upcoming cycle with the bill month and the estimate note in pt-BR` passed.

**C12** — PASS, carried from 9a7cb44. Proof neste HEAD: `lists upcoming bills in English` passed.

**C13** — PASS, carried from 9a7cb44. Proof neste HEAD: `hides the section when every committed total is zero and the future total is zero or null` passed.

**C14** — PASS, carried from 9a7cb44. Proof neste HEAD: `shows the section when future commitments sit past the returned cycles` passed.

**C15** — PASS, carried from 9a7cb44. Proof neste HEAD: `renders nothing and no skeleton while upcoming bills load` passed.

**C16** — PASS, carried from 9a7cb44. Proof neste HEAD: `does not render or fetch upcoming bills for a non credit card` passed.

**C17** — PASS. Evidência nova. `14`/`USD` e `77`/`BRL` estão dentro do `expect`, não numa variável anterior:

- `frontend/src/components/upcoming-bills-section.test.tsx:165` — `expect(lineParts(accountLine)[1]).toBe(formatCurrency(14, 'USD', 'en-US'))`
- `frontend/src/components/upcoming-bills-section.test.tsx:166` — `.not.toBe(formatCurrency(77, 'BRL', 'en-US'))`
- `frontend/src/components/upcoming-bills-section.test.tsx:176` — `expect(lineParts(primaryLine)[1]).toBe(formatCurrency(77, 'BRL', 'en-US'))`
- `frontend/src/components/upcoming-bills-section.test.tsx:177` — `.not.toBe(formatCurrency(14, 'USD', 'en-US'))`

Seletor na moeda da conta afirma o `committed_total` em USD e recusa o número em BRL. Seletor na primária afirma o `committed_total_primary` em BRL e recusa o número em USD. Proof neste HEAD: `shows account currency totals or primary totals with the currency selector` passed.
