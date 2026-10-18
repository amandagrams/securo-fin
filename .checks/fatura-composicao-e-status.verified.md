Verdict: PASS
Profile: light
Diff range: da1a2ab..8ddb587
Round: 2 - scoped
Verifier: independent

HEAD `8ddb587`. Proofs deste HEAD (um pytest com os arquivos nomeados, um vitest com os arquivos e um `-t` alternado). Exit 0. Um proof verde antigo não entra.

- Backend: `cd backend && uv sync --all-extras && uv run pytest -v tests/test_bill_composition_api.py` — `test_bill_purchases_and_refunds_for_selected_bill`, `test_bill_composition_null_for_non_credit_card`, `test_bill_composition_primary_converted_like_other_primary` PASSED.
- Frontend: `cd frontend && npx vitest run src/pages/account-detail-composition.test.tsx -t "<nomes alternados>"` — os 10 `it` nomeados no checklist apareceram como passed.

13/13 PASS. C9 e C12 têm evidência nova. O resto não mudou de asserção.

**C1** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_bill_purchases_and_refunds_for_selected_bill` PASSED.

**C2** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_bill_composition_null_for_non_credit_card` PASSED.

**C3** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_bill_composition_primary_converted_like_other_primary` PASSED.

**C4** — PASS, carried from 9a7cb44. Proof neste HEAD: `shows purchases, refunds, and bill lines that match the bill total` passed.

**C5** — PASS, carried from 9a7cb44. Proof neste HEAD: `hides the refunds line when bill refunds are zero` passed.

**C6** — PASS, carried from 9a7cb44. Proof neste HEAD: `keeps the composition block at zero for an empty bill in pt-BR` passed.

**C7** — PASS, carried from 9a7cb44. Proof neste HEAD: `follows the currency toggle and keeps the bill line equal to the shown total` passed.

**C8** — PASS, carried from 9a7cb44. Proof neste HEAD: `hides the composition block on a non credit card account` passed.

**C9** — PASS. Evidência nova. O literal do checklist está na expressão do `expect`:

- `frontend/src/pages/account-detail-composition.test.tsx:267` — `expect(screen.getByText('Open bill · closes 9/30/2026 · due 10/10/2026'))`
- `frontend/src/pages/account-detail-composition.test.tsx:268` — `toContain('Open bill · closes 9/30/2026 · due 10/10/2026')` no ancestral do cabeçalho do ciclo
- `frontend/src/pages/account-detail-composition.test.tsx:270` — `toContain('9/30/2026')` no card de limite (fechamento = dia seguinte a `filterTo`)

`10/10/2026` está dentro do mesmo literal nas linhas 267 e 268. Proof neste HEAD: `shows the open bill status beside the selector on the in-progress cycle` passed.

**C10** — PASS, carried from 9a7cb44. Proof neste HEAD: `shows closed bill status with due or was due from the anchoring bill` passed.

**C11** — PASS, carried from 9a7cb44. Proof neste HEAD: `shows no bill status without a close day or on a hand-edited window` passed.

**C12** — PASS. Evidência nova. O aviso e o Total estão na mesma expressão do `expect`:

- `frontend/src/pages/account-detail-composition.test.tsx:314` — `expect(card.indexOf("Estimated — the bank hasn't closed this bill yet; we add up the charges it has sent")).toBeGreaterThan(card.indexOf('R$120.00'))`

Proof neste HEAD: `shows the estimated notice below the total on the in-progress cycle` passed.

**C13** — PASS, carried from 9a7cb44. Proof neste HEAD: `hides the estimated notice when a bill anchors the cycle` passed.
