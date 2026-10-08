Verdict: PASS
Profile: light
Diff range: da1a2ab..8ddb587
Round: 2 - scoped
Verifier: independent

HEAD `8ddb587`. Proofs deste HEAD (um pytest com os arquivos nomeados, um vitest com os arquivos e um `-t` alternado). Exit 0. Um proof verde antigo não entra.

- Backend: `cd backend && uv sync --all-extras && uv run pytest -v tests/test_dashboard_credit_card_bills.py` — os 7 testes nomeados PASSED.
- Frontend: `cd frontend && npx vitest run src/pages/dashboard-open-bills.test.tsx -t "<nomes alternados>"` — os 6 `it` nomeados apareceram como passed.

13/13 PASS. C8, C9 e C13 têm evidência nova. O resto não mudou de asserção.

**C1** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_two_open_cards_ordered_by_due_date_match_account_summary` PASSED.

**C2** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_aggregates_sum_amount_primary_count_and_earliest_due` PASSED.

**C3** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_card_without_bills_uses_get_cycle_dates_window` PASSED.

**C4** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_cards_without_cycle_and_closed_accounts_are_excluded` PASSED.

**C5** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_shared_balance_group_counts_once_first_by_name` PASSED.

**C6** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_no_eligible_cards_returns_empty_aggregates` PASSED.

**C7** — PASS, carried from 9a7cb44. Proof neste HEAD: `test_past_due_bill_falls_back_to_current_cycle` PASSED.

**C8** — PASS. Evidência nova. Subtítulo e `due` estão no `expect`, com contagem, data e `dd MMM` legíveis. Os outros valores do critério também estão em `expect` ou no `findByRole` que falha se o nome não existir:

- `frontend/src/pages/dashboard-open-bills.test.tsx:139` — `findByRole('region', { name: 'Open bills' })`
- `frontend/src/pages/dashboard-open-bills.test.tsx:141` — `findByText(formatCurrency(140, 'USD', 'en-US'))`
- `frontend/src/pages/dashboard-open-bills.test.tsx:142` — `` getByText(`2 cards · due ${format(parseISO('2026-10-15'), 'dd MMM', { locale: resolveDateFnsLocale('en') })}`) ``
- `frontend/src/pages/dashboard-open-bills.test.tsx:145` — `toHaveTextContent('•••• 1234')`
- `frontend/src/pages/dashboard-open-bills.test.tsx:146` — `` toHaveTextContent(`due ${format(parseISO('2026-10-15'), 'dd MMM', { locale: resolveDateFnsLocale('en') })}`) ``
- `frontend/src/pages/dashboard-open-bills.test.tsx:147` — `toHaveTextContent(formatCurrency(80, 'EUR', 'en-US'))`
- `frontend/src/pages/dashboard-open-bills.test.tsx:148` — `toHaveAttribute('href', '/accounts/card-a')`
- `frontend/src/pages/dashboard-open-bills.test.tsx:152` — `` toHaveTextContent(`due ${format(parseISO('2026-11-20'), 'dd MMM', { locale: resolveDateFnsLocale('en') })}`) ``
- `frontend/src/pages/dashboard-open-bills.test.tsx:153` — `toHaveTextContent(formatCurrency(40, 'USD', 'en-US'))`
- `frontend/src/pages/dashboard-open-bills.test.tsx:154` — `toHaveAttribute('href', '/accounts/card-b')`
- `frontend/src/pages/dashboard-open-bills.test.tsx:157` — `toHaveTextContent('/accounts/card-a')` depois do clique

Proof neste HEAD: `shows open bills in English with mask, due date, account currency and a link` passed.

**C9** — PASS. Evidência nova. Título, subtítulo e `vence` com a data em `dd MMM` estão legíveis:

- `frontend/src/pages/dashboard-open-bills.test.tsx:163` — `findByRole('region', { name: 'Faturas em aberto' })`
- `frontend/src/pages/dashboard-open-bills.test.tsx:165` — `` findByText(`2 cartões · vence ${format(parseISO('2026-10-15'), 'dd MMM', { locale: resolveDateFnsLocale('pt-BR') })}`) ``
- `frontend/src/pages/dashboard-open-bills.test.tsx:166` — `` toHaveTextContent(`vence ${format(parseISO('2026-10-15'), 'dd MMM', { locale: resolveDateFnsLocale('pt-BR') })}`) ``

Proof neste HEAD: `shows the open bills copy in Portuguese` passed.

**C10** — PASS, carried from 9a7cb44. Proof neste HEAD: `hides the block when there are no open bills` passed.

**C11** — PASS, carried from 9a7cb44. Proof neste HEAD: `shows neighbor-style skeletons while open bills load` passed.

**C12** — PASS, carried from 9a7cb44. Proof neste HEAD: `keeps open bills when the dashboard month changes` passed.

**C13** — PASS. Evidência nova. Os três agregados visíveis (total, contagem no subtítulo, data no subtítulo) estão no `expect`, e os agregados crus da resposta são recusados:

- `frontend/src/pages/dashboard-open-bills.test.tsx:219` — Alpha ausente
- `frontend/src/pages/dashboard-open-bills.test.tsx:220` — `toHaveAttribute('href', '/accounts/card-b')`
- `frontend/src/pages/dashboard-open-bills.test.tsx:221` — `queryByText(formatCurrency(140, 'USD', 'en-US'))` ausente
- `frontend/src/pages/dashboard-open-bills.test.tsx:222` — `queryByText(formatCurrency(80, 'EUR', 'en-US'))` ausente
- `frontend/src/pages/dashboard-open-bills.test.tsx:223` — `getAllByText(formatCurrency(40, 'USD', 'en-US'))`
- `frontend/src/pages/dashboard-open-bills.test.tsx:224` — `` getByText(`1 cards · due ${format(parseISO('2026-11-20'), 'dd MMM', { locale: resolveDateFnsLocale('en') })}`) ``

Proof neste HEAD: `recalculates open bill aggregates from the visible accounts` passed.
