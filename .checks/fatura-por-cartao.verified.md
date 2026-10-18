# Fatura do cartão por cartão Verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 4acac1c..da1a2abeae4b88ee4fba63ac1e591d2a702114fd
**Round**: 2 - scoped (full proof re-run at HEAD; prior FAIL C10 only)
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

| Source | Opened | Contradiction | Uncovered |
|---|---|---|---|
| `.tasks/fatura-por-cartao.md` | yes | none observed (checks map to criteria 1–24) | step 1 UI enumeration skipped (`light` profile) |

## Checks

| Check | Claim | Proof run | Evidence | Result |
|---|---|---|---|---|
| C1 | `card_number` `"0597"` em lista e detalhe | `uv run pytest tests/test_transaction_card_number.py::test_card_number_from_raw_data_in_list_and_detail` exit 0 | `test_transaction_card_number.py:55` — `assert rows[str(tx.id)]["card_number"] == "0597"`; `:59` — `assert detail.json()["card_number"] == "0597"` | PASS |
| C2 | quatro variantes → `card_number` `null` | `uv run pytest tests/test_transaction_card_number.py::test_card_number_null_variants` exit 0 (4 parametrized) | `test_transaction_card_number.py:86` — `assert rows[str(tx.id)]["card_number"] is None`; `:90` — `assert detail.json()["card_number"] is None` | PASS |
| C3 | máscara `•••• 0597` desktop | `npx vitest run src/pages/account-detail-cards.test.tsx -t "shows the card mask on desktop bill rows"` exit 0 | `account-detail-cards.test.tsx:193` — `expect(screen.getByText('•••• 0597')).toBeTruthy()` | PASS |
| C4 | máscara mobile | `npx vitest run ... -t "shows the card mask on mobile bill rows"` exit 0 | `account-detail-cards.test.tsx:205` — `expect(screen.getByText('•••• 0597')).toBeTruthy()` | PASS |
| C5 | sem máscara quando `card_number` null | `npx vitest run ... -t "renders no mask when card_number is null"` exit 0 | `account-detail-cards.test.tsx:216` — `expect(screen.queryByText(/••••/)).toBeNull()` | PASS |
| C6 | conta não `credit_card` sem máscara/grupos | `npx vitest run ... -t "non credit card account shows no mask and no groups"` exit 0 | `account-detail-cards.test.tsx:231` — `expect(screen.queryByText(/••••/)).toBeNull()`; `:232` — `expect(screen.queryAllByTestId('card-group')).toEqual([])` | PASS |
| C7 | grupos/subtotais pt-BR somam Total 135,00 | `npx vitest run ... -t "groups the bill by card with subtotals that sum to the bill total in pt-BR"` exit 0 | `account-detail-cards.test.tsx:245-253` — `expect(headers).toHaveLength(3)`; subtotais `100,00` / `30,00` / `5,00`; `expect(billTotalCard()).toMatch(/135,00/)` | PASS |
| C8 | terceiro grupo `No card` em en | `npx vitest run ... -t "titles the no-card group in English"` exit 0 | `account-detail-cards.test.tsx:262` — `expect(headers[2]).toContain('No card')` | PASS |
| C9 | ignorado e par na lista, fora dos subtotais | `npx vitest run ... -t "keeps ignored and paired rows in the list but out of the subtotals"` exit 0 | `account-detail-cards.test.tsx:285-289` — linhas no grupo; `expect(groups[1].textContent).toMatch(/30,00/)`; `expect(groups[2].textContent).toMatch(/5,00/)` | PASS |
| C10 | ordem dos grupos + ordem relativa das linhas dentro do grupo | `npx vitest run ... -t "orders groups with the account card first then lexicographic then no card"` exit 0 | `account-detail-cards.test.tsx:307-310` — cabeçalhos `1234` → `0444` → `0597` → `No card`; `:314` — `expect(table.indexOf('MAIS NOVA')).toBeLessThan(table.indexOf('MAIS ANTIGA'))` (ordem relativa no grupo da conta) | PASS |
| C11 | `masked_number` null → ordem lexicográfica | `npx vitest run ... -t "starts at lexicographic order when masked_number is null"` exit 0 | `account-detail-cards.test.tsx:331-333` — `expect(headers[0]).toContain('•••• 0444')` … `headers[2]` `1234` | PASS |
| C12 | zero ou um balde → lista plana | `npx vitest run ... -t "renders a flat list when the bill has zero or one bucket"` exit 0 | `account-detail-cards.test.tsx:347` e `:360` — `expect(screen.queryAllByTestId('card-group')).toEqual([])` | PASS |
| C13 | empty state pt-BR e en | `npx vitest run ... -t "keeps the existing empty state copy in both languages"` exit 0 | `account-detail-cards.test.tsx:367` — `findByText('Nenhuma transação para esta conta')`; `:373` — `findByText('No transactions for this account')` | PASS |
| C14 | lançamento da fatura A não vaza na fatura B | `npx vitest run ... -t "does not leak another bill's rows into the visible bill's groups"` exit 0 | `account-detail-cards.test.tsx:404-406` — `expect(screen.queryByText('GASTO FATURA A')).toBeNull()`; `expect(screen.queryAllByTestId('card-group')).toEqual([])` | PASS |
| C15 | loading: 5 skeletons, sem grupos | `npx vitest run ... -t "shows the five skeletons and no groups while loading"` exit 0 | `account-detail-cards.test.tsx:419` — `expect(skeletons).toHaveLength(5)`; `:421` — `expect(screen.queryAllByTestId('card-group')).toEqual([])` | PASS |
| C16 | subtotais além do limit 500 | `npx vitest run ... -t "subtotals cover rows beyond the 500 row page limit"` exit 0 | `account-detail-cards.test.tsx:437-441` — subtotais `500.00` / `1.00`; `expect(billTotalCard()).toMatch(/501\.00/)` | PASS |
| C17 | subtotais seguem toggle de moeda | `npx vitest run ... -t "subtotals follow the foreign currency toggle and still sum to the shown total"` exit 0 | `account-detail-cards.test.tsx:459-461` USD; `:467-470` BRL somando `75.00` no Total | PASS |
| C18 | `GET /cards` distintos ordenados com `name` | `uv run pytest tests/test_account_cards_api.py::test_list_cards_distinct_ordered_with_names` exit 0 | `test_account_cards_api.py:90-96` — `assert response.status_code == 200`; `assert body == [{"card_number": "1234", "name": None}, {"card_number": "0597", "name": None}]` | PASS |
| C19 | `PUT` nome → `200` Amanda | `uv run pytest ...::test_put_card_name_returns_saved_name` exit 0 | `test_account_cards_api.py:111-112` — `assert response.status_code == 200`; `assert response.json() == {"card_number": "0597", "name": "Amanda"}` | PASS |
| C20 | título do grupo `Amanda •••• 0597`, linhas só máscara | `npx vitest run ... -t "shows the card name in the group title but not on the rows"` exit 0 | `account-detail-cards.test.tsx:490-493` — `expect(headers[1]).toContain('Amanda')`; linha `RESTAURANTE DEP` contém `•••• 0597` e `not.toContain('Amanda')` | PASS |
| C21 | nome em branco → `name` null no PUT e GET | `uv run pytest ...::test_put_blank_name_clears_to_null` exit 0 | `test_account_cards_api.py:134-135` — `assert response.json() == {"card_number": "0597", "name": None}`; `:139` — item no GET com `name` null | PASS |
| C22 | sem nome → título só máscara | `npx vitest run ... -t "falls back to the mask when the card has no name"` exit 0 | `account-detail-cards.test.tsx:506-507` — `expect(headers[1]).toContain('•••• 0597')`; `not.toContain('Amanda')` | PASS |
| C23 | 256 chars → `422`; trim `Amanda` | `uv run pytest ...::test_put_name_length_and_trim` exit 0 | `test_account_cards_api.py:154` — `assert too_long.status_code == 422`; `:163` — `assert trimmed.json() == {"card_number": "0597", "name": "Amanda"}` | PASS |
| C24 | cartão desconhecido → `404` | `uv run pytest ...::test_put_unknown_card_number_404` exit 0 | `test_account_cards_api.py:181-182` — `assert response.status_code == 404`; `assert await _card_rows(...) == []` | PASS |
| C25 | outro workspace → `404` GET e PUT | `uv run pytest ...::test_other_workspace_404` exit 0 | `test_account_cards_api.py:206` — `assert listed.status_code == 404`; `:213` — `assert renamed.status_code == 404` | PASS |
| C26 | viewer PUT `403`, GET `200` | `uv run pytest ...::test_viewer_put_403_get_200` exit 0 | `test_account_cards_api.py:228` — `assert denied.status_code == 403`; `:234` — `assert listed.status_code == 200` | PASS |
| C27 | sem campo de nome sem `canWrite` | `npx vitest run ... -t "hides the name fields without write permission"` exit 0 | `account-detail-cards.test.tsx:516-517` — `expect(screen.queryByTestId('card-name-input')).toBeNull()`; `queryByTitle('Edit')` null | PASS |
| C28 | PUT duplo → uma linha `account_cards` | `uv run pytest ...::test_put_is_idempotent_single_row` exit 0 | `test_account_cards_api.py:259` — `assert count == 1` | PASS |
| C29 | PUT concorrente → sem `500`, uma linha, nome Amanda ou Bruno | `uv run pytest ...::test_concurrent_puts_no_500_single_row` exit 0 | `test_account_cards_api.py:285-289` — `assert all(r.status_code != 500 ...)`; `assert len(rows) == 1`; `assert rows[0].name in ("Amanda", "Bruno")` | PASS |
| C30 | delete conta remove `account_cards` | `uv run pytest ...::test_account_delete_removes_cards` exit 0 | `test_account_cards_api.py:306` — `assert await _card_rows(session, cc_account.id) == []` | PASS |
| C31 | nome sobrevive ausência do cartão nos lançamentos | `uv run pytest ...::test_name_survives_card_absence` exit 0 | `test_account_cards_api.py:329` — `assert len(rows) == 1 and rows[0].name == "Amanda"`; `:334` — `{"card_number": "0597", "name": "Amanda"}` no GET após retorno | PASS |
| C32 | sync não altera `account_cards` | `uv run pytest ...::test_sync_does_not_touch_account_cards` exit 0 | `test_account_cards_api.py:402-403` — `assert name_after == "Amanda"`; `assert updated_after == original_updated_at` | PASS |
| C33 | loading da lista de cartões: sem inputs de nome | `npx vitest run ... -t "shows no name fields while the card list loads"` exit 0 | `account-detail-cards.test.tsx:528` — `expect(screen.queryByTestId('card-name-input')).toBeNull()` antes de `resolveCards` | PASS |
| C34 | conta sem cartões vistos → copy dedicada | `npx vitest run ... -t "says no card was seen yet when the account has none"` exit 0 | `account-detail-cards.test.tsx:538` — `findByText('No card has been seen on this account yet.')`; `:539` — sem inputs | PASS |

## Swept (existing rows)

| Row | Constraint cited | Code / deployment evidence | Result |
|---|---|---|---|
| observability | novas rotas entram no log de requisições como as demais | `GET/PUT .../cards` em `backend/app/api/accounts.py:135-152` no mesmo `accounts_router` incluído em `backend/app/main.py:180`; stack sobe via `uvicorn app.main:app` — sem opt-out de access log para essas rotas | PASS (carried from round 1; constraint unchanged at HEAD) |

Fault injection (step 4): skipped — profile `light`.

Coverage / Test policy: skipped — profile `light`.

## Gate

| Command | Result |
|---|---|
| `cd backend && uv run pytest tests/test_transaction_card_number.py tests/test_account_cards_api.py -v` | 17 passed, 0 failed |
| `cd frontend && npx vitest run src/pages/account-detail-cards.test.tsx` | 20 passed, 0 failed |
