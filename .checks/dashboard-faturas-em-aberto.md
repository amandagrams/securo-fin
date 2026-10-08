# Dashboard — faturas em aberto

Profile: `light` (nenhuma declaração em AGENTS.md ou equivalente; default). A copy do bloco
(`Open bills` / `Faturas em aberto`, subtítulo e `vence`/`due`) está nos critérios e entra nos
checks. Espaçamento, cor e peso ficam de fora: isso seria o profile `ui`.

Sources:

- A tarefa desta run — única fonte: porta `GET /api/dashboard/credit-card-bills`, 11 critérios,
  escopo negativo, e a questão aberta já decidida (bill mais nova vencida e sem bill futura →
  ciclo em curso, não a vencida).

## Out of scope

Herdado da task, sem acréscimos: registrar pagamento; hero "A entrar/Comprometido/Saldo previsto";
notificações; tooltip de patrimônio; `category-flows`; engordar `DashboardSummary`; agregar no
cliente com N chamadas de summary; reescrever `get_account_summary`; Playwright.

## Landing

Toca: função nova no final de `backend/app/services/dashboard_service.py`, rota nova no final de
`backend/app/api/dashboard.py`, schemas no final de `backend/app/schemas/dashboard.py`,
`frontend/src/components/open-bills-card.tsx`, o mount em `dashboard.tsx`, `api.ts`, `types`,
locales. Reusa: `get_account_summary` (não o filtro reescrito), `get_cycle_dates`,
`current_workspace`, `get_account_name`, a derivação de close de `closeDateForBill` /
`_compute_bill_close_date`, e a regra de `sumAccountBalances` (primeira conta do grupo na ordem
em que a lista de contas chega — `Account.name`). O teste de paridade `i18n.test.ts` exige toda
chave nova de `en.json` nos 15 locales.

| One-way door (decidida na task) | Literal shape | Alternative rejected |
| --- | --- | --- |
| Fatura corrente | bill de menor `due_date >= hoje`; janela = a da página da conta (`rangeForBill`: fim = `due_date`, início = dia seguinte ao `due_date` da bill anterior, ou `due_date - 45 dias` se não houver anterior). `get_account_summary(bill_id, from, to)` e `amount` = `projected_expenses` | `bill.total_amount`, ou reimplementar o filtro de lançamentos |
| Bill mais nova já vencida, sem bill futura | ciclo que contém hoje (`creditCardCycleBoundaries`), `unbilled_only` como `isOpenCycleWindow`, não a bill vencida | repetir a bill vencida; usar `get_cycle_dates` nesse caso (esse helper é o ciclo do próximo vencimento, que não é o ciclo em curso quando o fechamento já passou e o vencimento ainda não) |
| Sem bills, com `statement_close_day` e `payment_due_day` | `due_date`/`close_date` de `get_cycle_dates`; janela = a de `defaultCycleForCreditCard` (ciclo cujo fechamento é esse `next_close_date`); `unbilled_only` falso | ciclo que contém hoje quando ele diverge do próximo vencimento |
| `status` | `open` quando `close_date >= hoje`, `closed` quando menor. `close_date` da bill = ocorrência de `statement_close_day` mais recente em ou antes do `due_date`; sem dia de fechamento, `close_date = due_date` | status a partir do `due_date` |
| Grupo `shared_balance_group` não nulo | uma entrada, a primeira conta do grupo na ordem `Account.name` (a ordem que `accounts.list` entrega a `sumAccountBalances`); `total_primary` soma `amount_primary` dessa entrada uma vez | somar as duas faturas; escolher a de menor `due_date` |
| Filtro do dashboard | a rota não recebe `account_ids` nem mês; o cliente tira da resposta os itens fora do filtro e recalcula `total_primary`, `accounts_count` e `earliest_due_date` só com os visíveis | filtrar no servidor, ou manter os agregados da resposta |
| Fora do `DashboardSummary` | rota própria `GET /api/dashboard/credit-card-bills` | campos novos no summary |

- Nada mais aqui é difícil de reverter.

## Checks

Proofs backend rodam de `backend/` (`uv run pytest tests/...`); frontend de `frontend/`
(`npx vitest run ... -t`). Critério da task entre parênteses. A questão aberta decidida é o
check C7.

### S1 - Leitura das faturas · `tests/test_dashboard_credit_card_bills.py`

**C1** (1) - Duas contas `credit_card` não encerradas, cada uma com bill `due_date >= hoje`.
`200`. Um item por conta, `due_date` crescente, com `account_id`, `account_name` (nome visto:
`display_name` senão `name`), `masked_number`, `institution_logo_url`, `due_date`, `close_date`,
`status`, `amount`, `amount_primary`, `currency`. `status` `closed` quando `close_date < hoje` e
`open` quando `close_date >= hoje`. `amount` de cada item é o `projected_expenses` de
`GET /api/accounts/{id}/summary` com o `bill_id` e a janela dessa fatura corrente — e o valor
absoluto do cenário (145 e 40), que só fecha se o `bill_id` e a janela entrarem juntos.
Proof: `uv run pytest tests/test_dashboard_credit_card_bills.py::test_two_open_cards_ordered_by_due_date_match_account_summary`

**C2** (2) - `total_primary` é a soma dos `amount_primary` (conta USD convertida à primária BRL
pela taxa semeada, não a soma dos `amount`), `accounts_count` é o número de itens,
`earliest_due_date` é o menor `due_date`.
Proof: `uv run pytest tests/test_dashboard_credit_card_bills.py::test_aggregates_sum_amount_primary_count_and_earliest_due`

**C3** (3) - `credit_card` sem bills, com `statement_close_day` e `payment_due_day`: entra com
`due_date` e `close_date` de `get_cycle_dates`, `status` derivado do `close_date`, `amount` igual
ao summary na janela desse ciclo (80) e não na do ciclo em curso quando os dois divergem (o
débito de 500 no dia do fechamento fica de fora).
Proof: `uv run pytest tests/test_dashboard_credit_card_bills.py::test_card_without_bills_uses_get_cycle_dates_window`

**C4** (4) - `credit_card` sem bills e sem os dois dias de ciclo, `credit_card` sem bills com só
um dos dias, conta encerrada com bill futura e lançamento grande, e conta que não é cartão:
fora dos itens e fora de `total_primary` / `accounts_count` / `earliest_due_date`. A conta
elegível que sobra é a única entrada.
Proof: `uv run pytest tests/test_dashboard_credit_card_bills.py::test_cards_without_cycle_and_closed_accounts_are_excluded`

**C5** (5) - Duas contas com o mesmo `shared_balance_group` não nulo: um item só, o da primeira
em ordem de `Account.name` (não o de menor `due_date`, não o de `display_name`), e
`total_primary` igual ao `amount_primary` dessa conta — a outra não entra na soma.
Proof: `uv run pytest tests/test_dashboard_credit_card_bills.py::test_shared_balance_group_counts_once_first_by_name`

**C6** (6) - Nenhuma `credit_card` elegível: `200`, `items` `[]`, `total_primary` `0`,
`accounts_count` `0`, `earliest_due_date` `null`.
Proof: `uv run pytest tests/test_dashboard_credit_card_bills.py::test_no_eligible_cards_returns_empty_aggregates`

**C7** (questão aberta) - A bill mais nova tem `due_date < hoje` e não há bill futura: o item
usa o ciclo que contém hoje (due/close desse ciclo, `status` `open`), `amount` 42. A bill
vencida (999 ligado a ela) não é a fatura corrente; sem `unbilled_only` o total seria 1041.
Proof: `uv run pytest tests/test_dashboard_credit_card_bills.py::test_past_due_bill_falls_back_to_current_cycle`

### S2 - Bloco no dashboard · `src/pages/dashboard-open-bills.test.tsx`

**C8** (7) - Em en, o bloco `Open bills` mostra `total_primary` na moeda primária, o subtítulo
`{count} cards · due {date}` com a data em `dd MMM`, uma linha por item com `account_name`,
`•••• {masked_number}` quando existe, `due {dd MMM}`, e `amount` na moeda da conta. O clique
navega para `/accounts/{account_id}`.
Proof: `npx vitest run src/pages/dashboard-open-bills.test.tsx -t "shows open bills in English with mask, due date, account currency and a link"`

**C9** (7) - Em pt-BR o título é `Faturas em aberto`, o subtítulo é `{count} cartões · vence {date}`
e a linha diz `vence {dd MMM}`.
Proof: `npx vitest run src/pages/dashboard-open-bills.test.tsx -t "shows the open bills copy in Portuguese"`

**C10** (8) - `items` vazio: o bloco não aparece.
Proof: `npx vitest run src/pages/dashboard-open-bills.test.tsx -t "hides the block when there are no open bills"`

**C11** (9) - Enquanto carrega: o título do bloco e skeletons no padrão dos vizinhos — um `h-9 w-40`
(número do hero) e quatro `h-12 w-full` (lista de categorias). Nenhuma linha de fatura.
Proof: `npx vitest run src/pages/dashboard-open-bills.test.tsx -t "shows neighbor-style skeletons while open bills load"`

**C12** (10) - Mudar o mês do dashboard não muda as faturas e não refaz a leitura com mês: a
chamada segue sem argumento, e o gasto por categoria (que depende do mês) muda.
Proof: `npx vitest run src/pages/dashboard-open-bills.test.tsx -t "keeps open bills when the dashboard month changes"`

**C13** (11) - Com o filtro de contas ativo, o item de fora sai e os três agregados exibidos
(`total_primary`, a contagem no subtítulo, a data do subtítulo) são só os das contas visíveis —
não os agregados crus da resposta.
Proof: `npx vitest run src/pages/dashboard-open-bills.test.tsx -t "recalculates open bill aggregates from the visible accounts"`

Chaves novas de `en.json` (`dashboard.openBills`, `dashboard.openBillsSubtitle`,
`dashboard.openBillsDue`) em todos os locales: o teste de paridade já existente.
Proof: `npx vitest run src/locales/i18n.test.ts`

## Swept

Herdado da task, mapeado para checks:

- validation: C1 (status e campos), C6 (vazio)
- failure modes: C4, C7, C10
- idempotency and retry: n/a — leitura
- authorization: a rota usa `current_workspace`, o mesmo gate das rotas vizinhas de dashboard; a task não abre código novo de papel
- concurrency and ordering: C1 (due_date crescente), C5 (ordem de nome do grupo)
- data lifecycle: C4 (encerrada fora)
- external-dependency failure: n/a — sem chamada externa nova; FX ausente cai no 1:1 que `convert` já usa nas outras leituras
- state transitions: C7 (bill vencida → ciclo em curso)
- observability: existing — a rota nova entra no log de requisições que toda rota já tem

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| status (2) | `open` C1, C3, C7 · `closed` C1, C3 quando o fechamento já passou | - |
| origem do ciclo (3) | bill futura C1 · sem bills, `get_cycle_dates` C3 · só bills vencidas, ciclo em curso C7 | - |
| fora da lista (4) | sem bills e sem dias C4 · só um dia de ciclo C4 · encerrada C4 · não-cartão C4 | - |
| agregados (3) | soma de `amount_primary` C2 · `accounts_count` C2 · `earliest_due_date` C2 · os três recalculados no filtro C13 · zerados C6 | - |
| idiomas com copy nos critérios (2) | en C8 · pt-BR C9 | - |
| estados do bloco (3) | preenchido C8 · vazio C10 · carregando C11 | - |

- Claims que nomeiam status code, rota ou shape de resposta: C1, C2, C3, C4, C5, C6, C7 — todos
  provados via cliente HTTP (httpx ASGI), cruzando a fronteira
- Nenhum outro check afirma mais do que o caso que seu proof exercita
