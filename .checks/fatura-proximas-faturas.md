# Próximas faturas

Profile: `light` (nenhuma declaração em AGENTS.md ou equivalente; default). Nota ao usuário: a
seção tem título, nota e uma linha por ciclo — o profile `ui` cobriria espaçamento, cor e peso;
sob `light` isso fica de fora da verificação.

Sources:

- Task «Próximas faturas — parcelas que já comprometem ciclos futuros» — única fonte, é o
  registro de decisão: 12 critérios, 1 porta, escopo e a questão aberta já decidida (valor da
  parcela projetada = valor da parcela existente de maior `installment_number`, não `total/n`).

## Out of scope

Herdado da task, sem acréscimos: materializar a projeção em `transactions`; navegar ao clicar no
ciclo; listar as parcelas dentro do ciclo; parcelas fora de `credit_card`; coluna no CSV de
export; card da lista de Contas (onda 2, consome este contrato); alterar `projected_expenses` ou
`bill_purchases`; Playwright.

## Landing

Toca: rota nova ao lado de `get_account_bills` em `api/accounts.py`, cálculo em
`account_service.get_upcoming_bills`, schema ao lado de `CreditCardBillRead`, cliente em
`api.ts`, tipos em `types/index.ts`, componente `upcoming-bills-section.tsx` e o mínimo de
import/JSX em `account-detail.tsx`, locales. Reusa: `get_cycle_dates`, `compute_effective_date`
via `apply_effective_date`, `counts_on_bill`, os dois caminhos de série de
`_get_series_transactions` (e o fingerprint que o dedup de sync já usa para achar a série, sem
inventar outro), `current_workspace`, o padrão de workspace alheio de
`test_account_cards_api.py`. O teste de paridade `i18n.test.ts` exige toda chave nova em
`en.json` presente nos 15 locales.

| One-way door (decidida na task) | Literal shape | Alternative rejected |
| --- | --- | --- |
| `GET /api/accounts/{account_id}/upcoming-bills` | leitura `current_workspace`, aninhada como `GET /api/accounts/{id}/bills`. `?cycles=` default `6`, `ge=1`, `le=24`. Corpo `{"cycles": [{"due_date", "close_date", "committed_total", "committed_total_primary", "currency"}], "future_committed_total", "future_committed_total_primary"}`. Datas `YYYY-MM-DD`. Valores monetários são número JSON (float), como `CreditCardBillRead.total_amount`. Conta de outro workspace → `404`. Fora de `1..24` → `422` | calcular a série no cliente, ou gravar a projeção como transação |
| Identidade da série | dois caminhos, os de `_get_series_transactions`: (1) `installment_series_id` quando não é null; (2) sem esse id, fingerprint `account_id + installment_purchase_date + total_installments` (o mesmo do fallback do sync, que não inclui `installment_number` nem `installment_series_id`) | um fingerprint novo (por exemplo acrescentar `installment_total_amount`, ou agrupar pelo fingerprint de dedup da parcela individual, que inclui `installment_number` e partiria a série) |
| Valor projetado | cada número ausente acima do maior `installment_number` existente leva o `amount` (e o `amount_primary`) dessa parcela. `total/n` não entra | dividir `installment_total_amount` por `total_installments` |

| `cycles` de um cartão configurado (build) | exatamente `cycles` ocorrências de `payment_due_day` estritamente posteriores ao ciclo em curso (`get_cycle_dates` com `app_today`), em ordem crescente de `due_date`, incluindo total `0`. `close_date` é o `statement_close_day` desse mesmo ciclo (o `next_close_date` que `get_cycle_dates` devolve para aquele vencimento). `future_committed_total` soma todo o futuro, sem cortar em `cycles` e sem incluir o ciclo em curso | omitir ciclos com total zero — esconde um mês vazio no meio da série e faz `len(cycles)` depender dos dados |
| Soma do ciclo (build) | soma com sinal da fatura: débito soma `abs`, crédito que `counts_on_bill` aceita subtrai `abs`. Entram só linhas que `counts_on_bill` aceita; `source='opening_balance'` fica de fora, como no total da fatura. A projeção entra com o sinal do tipo da parcela-âncora. `committed_total_primary` soma `amount_primary` gravado (na projeção, o da âncora); se `amount_primary` é null e a moeda da conta é a primária, usa `amount` | somar módulos — um estorno aumentaria a fatura futura; converter por câmbio ao vivo — uma taxa ausente zeraria o campo que o seletor lê |
| Ciclo de uma linha (build) | sem `bill_id` e sem `effective_bill_date`: o `effective_date` que `apply_effective_date` grava, isto é `compute_effective_date(date, statement_close_day, payment_due_day)`. Com `bill_id`: o `effective_date` já gravado (vencimento do banco). `effective_bill_date` ganha dos dois. A linha soma no ciclo cujo `due_date` é essa data | fatiar por `date` — as parcelas sincronizadas que compartilham a data da compra cairiam todas no mesmo ciclo |
| Cartão sem ciclo, ou que não é cartão (build) | `type != credit_card`, ou `statement_close_day` null, ou `payment_due_day` null → `200`, `cycles: []`, `future_committed_total: null`, `future_committed_total_primary: null` | devolver `0` — a onda 2 não distinguiria «não dá para projetar» de «não há nada comprometido» |
| Seção na página (build) | `UpcomingBillsSection` busca e renderiza; `account-detail.tsx` só monta o componente com `accountId`, `accountType`, `currency`, `showPrimary` e a moeda primária do usuário. Some (sem skeleton novo) enquanto o fetch não resolveu, quando todo `committed_total` é `0` e `future_committed_total` é `0` ou `null`, e quando `type != credit_card` (nesse caso o endpoint não é chamado). O mês é `format(due_date, 'MMM yyyy')` com o locale date-fns da régua (`creditCardCycleLabel`) | buscar em `account-detail.tsx` e calcular de novo na página — o outro agente que mexe na composição dessa página passaria a ser dono da regra |

- Nada mais aqui é difícil de reverter.

## Checks

Proofs backend rodam de `backend/` (`uv run pytest tests/...`); frontend de `frontend/`
(`npx vitest run ...`). Critério da task entre parênteses. O relógio dos testes de ciclo está
congelado em `2026-10-08`. Conta configurada: `statement_close_day=10`, `payment_due_day=17`.
Com isso `get_cycle_dates` dá o ciclo em curso `due_date=2026-10-17`, `close_date=2026-10-10`.
As próximas ocorrências são `2026-11-17` (close `2026-11-10`), `2026-12-17`, `2027-01-17`,
`2027-02-17`, `2027-03-17`, `2027-04-17`.

### S1 - Projeção no servidor · 8 files · ~40 KB · ~10k

**C1** (1) - Série sincronizada sem `installment_series_id`, fingerprint
`(account_id, installment_purchase_date=2026-06-15, total_installments=10)`,
`installment_total_amount=1000.00`. Parcelas 1..4 existem; a 4 tem `date=2026-09-15` (cai no
ciclo em curso), `amount=99.00`. As 1..3 têm `amount=100.00` e datas
`2026-06-15`, `2026-07-15`, `2026-08-15`. Débito manual `pending` `50.00` com `date=2026-10-15`
(primeiro ciclo futuro). `GET ?cycles=3` → `200`, três ciclos em ordem crescente de `due_date`
`2026-11-17`, `2026-12-17`, `2027-01-17` com `close_date` `2026-11-10`, `2026-12-10`,
`2027-01-10`, `currency=BRL`, `committed_total` e `committed_total_primary` `149.00`, `99.00`,
`99.00`. A contagem de transações da conta não muda (a projeção não é gravada). `1000/10=100`
não satisfaz `99`
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_synced_series_projects_next_parcels_at_last_amount`

**C2** (2) - Na mesma conta, `future_committed_total` e `future_committed_total_primary` são
`644.00` (parcelas 5..10 a `99.00` mais o débito `50.00`). O valor não muda com `cycles=1`
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_future_committed_total_ignores_cycles_cutoff`

**C3** (3) - Série com `installment_series_id` e as 10 parcelas já existentes (a 10 no ciclo em
curso, nenhuma no futuro): nenhuma projeção. No primeiro ciclo futuro, a soma é só o que
`counts_on_bill` aceita, com o sinal da fatura: débito `20.00` sem categoria entra, débito
`30.00` em categoria `treat_as_transfer` entra, crédito `8.00` sem categoria entra subtraindo,
e ficam de fora o débito `is_ignored` `100.00`, o débito com `transfer_pair_id` `80.00`, o
crédito em categoria `treat_as_transfer` `40.00`, o débito `source=settlement` `15.00` e o
débito em categoria `is_ignored` `12.00`. `committed_total` do primeiro ciclo = `42.00`
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_complete_series_projects_nothing_and_only_bill_rows_sum`

**C4** (4) - Série parcial (1..4 de 10) cuja parcela de maior `installment_number` tem
`is_ignored`: nenhuma projeção, nos dois caminhos de série (fingerprint e
`installment_series_id`). `cycles=3` devolve três totais `0.00` e
`future_committed_total=0.00` (não null — o cartão está configurado)
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_ignored_latest_parcel_suppresses_projection`

**C5** (5) - Sem `statement_close_day`, ou sem `payment_due_day`, ou `type=checking` (mesmo com
os dois dias preenchidos e um débito futuro na conta): `200`, `cycles=[]`,
`future_committed_total=null`, `future_committed_total_primary=null`
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_unconfigured_or_non_card_returns_empty`

**C6** (6) - Conta de outro workspace: `404`
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_other_workspace_upcoming_bills_404`

**C7** (7) - Sem `cycles` na query, a mesma conta de C1 devolve 6 ciclos:
`149.00`, `99.00`, `99.00`, `99.00`, `99.00`, `99.00`, vencimentos de `2026-11-17` a
`2027-04-17`
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_cycles_defaults_to_six`

**C8** (7) - `cycles=0` e `cycles=25` → `422`
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_cycles_out_of_range_422`

**C9** (7) - `cycles=1` → `200` com um ciclo `149.00` e `future_committed_total=644.00`.
`cycles=24` → `200` com 24 ciclos: os seis primeiros iguais a C7 e os outros dezoito `0.00`,
`future_committed_total` continua `644.00`
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_cycles_bounds_keep_future_total`

**C10** (porta da soma primária) - Conta `USD`, primária `BRL`. Série de 2 sem
`installment_series_id`: a parcela 1 está no ciclo em curso com `amount=10.00` e
`amount_primary=55.00`; a 2 não existe e é projetada no primeiro ciclo futuro. Débito manual
nesse ciclo: `amount=4.00`, `amount_primary=22.00`. `GET ?cycles=1` → `currency=USD`,
`committed_total=14.00`, `committed_total_primary=77.00`, e os dois totais futuros iguais a
esses (a projeção copia o `amount_primary` da âncora, não o `amount`)
Proof: `uv run pytest tests/test_upcoming_bills_api.py::test_primary_totals_use_stored_amount_primary`

### S2 - Seção na página · 6 files · ~30 KB · ~8k

O componente recebe o que a página passa: id, type, moeda da conta, `showPrimary` e a moeda
primária. O mês assertado é `format(due_date, 'MMM yyyy')` com o locale date-fns da régua; o
valor assertado é `formatCurrency` na moeda e no locale de exibição.

**C11** (8) - Em pt-BR, a seção mostra `Próximas faturas`, a nota `estimativa com as parcelas e
lançamentos já conhecidos`, e cada ciclo com o mês `MMM yyyy` do `due_date` e o
`committed_total` formatado
Proof: `npx vitest run src/components/upcoming-bills-section.test.tsx -t "lists each upcoming cycle with the bill month and the estimate note in pt-BR"`

**C12** (8) - Em en, o título é `Upcoming bills` e a nota é `estimate from known installments and
charges`
Proof: `npx vitest run src/components/upcoming-bills-section.test.tsx -t "lists upcoming bills in English"`

**C13** (9) - Todo `committed_total` `0` e `future_committed_total` `0`, e o mesmo com
`future_committed_total` `null`: a seção não aparece
Proof: `npx vitest run src/components/upcoming-bills-section.test.tsx -t "hides the section when every committed total is zero and the future total is zero or null"`

**C14** (9) - Ciclos devolvidos todos a `0` mas `future_committed_total` diferente de `0`: a
seção aparece (o corte de `cycles` não esconde compromisso que ficou de fora da lista)
Proof: `npx vitest run src/components/upcoming-bills-section.test.tsx -t "shows the section when future commitments sit past the returned cycles"`

**C15** (10) - Enquanto o fetch não resolve: a seção não aparece e não há skeleton
(`animate-pulse`) novo
Proof: `npx vitest run src/components/upcoming-bills-section.test.tsx -t "renders nothing and no skeleton while upcoming bills load"`

**C16** (11) - `type` diferente de `credit_card`: a seção não aparece e
`accounts.upcomingBills` não é chamado
Proof: `npx vitest run src/components/upcoming-bills-section.test.tsx -t "does not render or fetch upcoming bills for a non credit card"`

**C17** (12) - Conta `USD`, primária `BRL`. Com o seletor na moeda da conta, o valor exibido é
`committed_total` em USD; com o seletor na primária, é `committed_total_primary` em BRL. O
número da outra moeda não aparece
Proof: `npx vitest run src/components/upcoming-bills-section.test.tsx -t "shows account currency totals or primary totals with the currency selector"`

## Swept

Herdado da task, mapeado para checks:

- validation: C5, C8
- failure modes: C3, C4
- idempotency and retry: C1 (o GET não grava parcela)
- authorization: C6
- concurrency and ordering: n/a — leitura, sem escrita
- data lifecycle: n/a — nenhuma linha nova (task: não materializar)
- external-dependency failure: n/a — não chama provedor nem câmbio ao vivo (o primário já está em `amount_primary`)
- state transitions: n/a — projeção calculada na leitura
- observability: existing — a rota nova entra no log de requisições que toda rota já tem

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| caminhos de série (2) | fingerprint sem `installment_series_id` C1 · `installment_series_id` completo C3 · âncora `is_ignored` nos dois caminhos C4 | - |
| parcelas da série de C1 (4 existentes + 6 projetadas) | 1..3 a `100.00` fora do futuro C1 · 4 a `99.00` no ciclo em curso C1 · 5 no primeiro futuro C1 · 6 e 7 nos dois seguintes C1 · 8..10 nos ciclos 4..6 e no total C2, C7 | - |
| linhas do ciclo de C3 (8) | débito simples C3 · débito `treat_as_transfer` C3 · crédito simples C3 · `is_ignored` C3 · `transfer_pair_id` C3 · crédito `treat_as_transfer` C3 · settlement C3 · categoria `is_ignored` C3 | - |
| formas da conta (5) | cartão com os dois dias C1 · sem close C5 · sem due C5 · `checking` C5 · outro workspace C6 | - |
| `cycles` (6) | default 6 C7 · `3` C1 · `1` C9 · `24` C9 · `0` C8 · `25` C8 | - |
| visibilidade da seção (4) | há totais C11 · tudo zero C13 · futuro null C13 · futuro fora da janela C14 | - |
| idiomas com copy nos critérios (2) | pt-BR C11 · en C12 | - |
| moedas do seletor (2) | USD `committed_total` C17 · BRL `committed_total_primary` C17 | - |
| moedas do total primário (2) | `committed_total` em USD C10 · `committed_total_primary` em BRL C10 | - |

- Claims que nomeiam status code, rota ou shape de resposta: C1, C2, C5, C6, C7, C8, C9, C10 —
  todos provados via cliente HTTP (httpx ASGI), cruzando a fronteira
- Nenhum outro check afirma mais do que o caso que seu proof exercita
- Chave nova em `en.json` (`accounts.upcomingBills`, `accounts.upcomingBillsEstimate`) entra no
  teste de paridade já existente (`src/locales/i18n.test.ts`, `it(locale)` por locale)

## Handoff

Aritmética (wc -c ÷ 4; leituras dirigidas, no mesmo critério do handoff de
`fatura-por-cartao.md`: o trecho lido, não o arquivo inteiro quando o arquivo é grande e a
edição é pontual; locales ~2 KB):

- S1 = ~40 KB ≈ 10k (`accounts.py`, `schemas/account.py`, `credit_card_service.py`, e os trechos
  de `get_account` / `counts_on_bill` / `_get_series_transactions` / dedup de
  `connection_service`) — `connection_service.py` inteiro tem 110 KB e não entra
- S2 = ~30 KB ≈ 8k (montagem e rótulo em `account-detail.tsx`, bloco de `accounts` em `api.ts`,
  tipos da conta, `formatCurrency`, locales) — a página inteira tem 97 KB e não entra —
  acumulado ~18k < 150k

**Um batch só**: S1+S2 não cruzam 150k. Não há fronteira no meio da task.

- **Onde caiu a fronteira**: não houve handoff no meio. Checklist em `6100508` e `7056fdf`.
  S1+S2 no commit `ac850c5`. O commit seguinte alinha as provas: C11/C17 comparam cada
  `span` com `formatCurrency` (o matcher normaliza o espaço do DOM e o texto do `Intl` não)
  e o C1 guarda `account.id` antes do `expire_all`, senão o recount perde o greenlet.
- **O que o usuário decidiu no meio do build**: nada — nenhuma clarificação nem renegociação.
  As portas novas (tamanho de `cycles`, soma com sinal, ciclo da linha, null contra zero,
  seção dona do fetch, `amount_primary` gravado) estão em `Landing` e não contradizem a porta
  da task.
- **O que foi abandonado**: nada tentado e descartado. Aviso ao próximo agente que o diff não
  mostra: `uv sync --all-extras` em `backend/` antes do primeiro pytest (o venv não vem com
  dev extras); `npm ci` em `frontend/` antes do vitest. `ruff format` no arquivo inteiro de
  `account_service.py` reescreve funções antigas — não rodar format no arquivo todo.
