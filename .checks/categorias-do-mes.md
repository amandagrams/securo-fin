# Categorias do mês

Profile: `light` (nenhuma declaração em AGENTS.md ou equivalente; default). Nota ao usuário: a
feature tem copy e arranjo específicos nos critérios 6–13 — o profile `ui` cobriria
espaçamento/cor/peso por tela; sob `light` isso fica de fora da verificação.

Sources:

- Pedido desta tarefa — única fonte. 14 critérios, uma porta
  (`GET /api/dashboard/category-flows`), UI em `/categories` acima do catálogo, e um teste que
  trava o sync que já existe (`apply_rules_to_transaction` em `connection_service`). Não há
  questão aberta.

## Out of scope

Herdado da task, sem acréscimos: reescrever o motor de regras; subcategoria nova; minigráfico;
desfoque/desbloqueie; mudar `GET /api/dashboard/spending-by-category` ou o gráfico do dashboard;
projeção de recorrência e pending no card; filtro de contas do dashboard nesta página; bloco de
faturas do dashboard; Playwright.

## Landing

Toca: função nova no final de `dashboard_service.py`, rota no final de `api/dashboard.py`,
schemas de dashboard, `categories.tsx` (o catálogo fica abaixo), componente
`category-month-flows.tsx`, `api.ts`, `types`, locales. Reusa: `get_spending_by_category` para o
total posted de cada saída (incluindo o ajuste de rateio que essa função já faz), os filtros de
`counts_as_user_pnl` / data de reporte / conta aberta / `posted` / `report_date <= today`,
`MonthStepper`, `currentMonth`/`monthRange`, `formatCurrency`, `current_workspace`, e o diálogo
de criação que a página já abre. O teste de paridade `i18n.test.ts` exige toda chave nova de
`en.json` nos outros locales.

| One-way door (decidida na task) | Literal shape | Alternative rejected |
| --- | --- | --- |
| Porta separada | `GET /api/dashboard/category-flows?month` → `{"outflows": [item], "inflows": [item]}` com item `{category_id, category_name, category_icon, category_color, total, percentage}`; `month` opcional, o mesmo `Query(None)` de spending-by-category, default mês corrente; leitura `current_workspace` | enfiar entradas em `GET /api/dashboard/spending-by-category` |
| Total da saída | `total` posted daquela categoria em `get_spending_by_category` (não o `projected_total`); `percentage` recalculado na lista, 2 casas | reimplementar o agregado de débito e divergir do rateio que o dashboard já soma |
| Total da entrada | os mesmos filtros da query de spending (`type` credit no lugar de debit), sem projeção de recorrência e sem pending | somar crédito dentro de spending-by-category |

| Busca (build) | no cliente, substring sem distinguir maiúsculas sobre o nome exibido (sem categoria usa o rótulo traduzido); busca vazia devolve as duas listas; busca sem match mostra `Nenhuma categoria encontrada` e não o texto de mês vazio | query param novo na API — o mês já veio inteiro, e o critério é filtro de tela |
| Mês na página (build) | estado local inicia em `currentMonth()` e pede `YYYY-MM-01`, o mesmo formato que o dashboard manda em spending; avançar/voltar usa `MonthStepper` | ler o filtro de contas do dashboard — fora de escopo |
| Clique na linha (build) | `Link` para `/transactions` com `from`/`to` do mês civil, `type=debit` nas saídas e `type=credit` nas entradas; sem categoria manda `uncategorized=1` e não manda `category_id` | drill-down interno no estilo do gráfico do dashboard |

- Nada mais aqui é difícil de reverter. O motor de regras não é tocado: o critério 14 só acrescenta teste.

## Checks

Proofs backend rodam de `backend/` (`uv run pytest tests/...`); frontend de `frontend/`
(`npx vitest run ... -t`). Critério da task entre parênteses.

### S1 - Fluxos do mês · API · 4 files

**C1** (1) - Outubro 2026, moeda primária BRL, categorias Alimentação e Salário, posted: débito
100.00 conta corrente 2026-10-05 Alimentação; débito 40.00 cartão 2026-10-12 Alimentação sem
`effective_bill_date`; débito 25.00 pending cartão 2026-10-12 Alimentação; débito 10.00
2026-10-08 `category_id` null; crédito 80.00 2026-10-03 Salário; crédito 200.00 2026-10-10 com
`transfer_pair_id`; débito 500.00 2026-10-10 com `transfer_pair_id`. `GET ?month=2026-10-01` →
200. outflows: Alimentação 140.00 e `category_id` null 10.00. inflows: Salário 80.00. Pending e
os dois com par não aparecem. O total de Alimentação é o mesmo total de
`GET /api/dashboard/spending-by-category?month=2026-10-01` para essa categoria, e Salário não
entra nessa lista. Com o relógio do app em outubro, omitir `month` devolve o mesmo corpo.
Proof: `uv run pytest tests/test_category_flows_api.py::test_october_posted_flows_match_spending_and_drop_pending_and_pairs`

**C2** (2) - Débito de cartão 100.00 posted Alimentação comprado 2026-03-30 com data de reporte
2026-04-16 (mesmo arranjo de `effective_date` que `test_category_breakdown_follows_mode`, sem
`effective_bill_date`). Modo cash: março traz Alimentação 100 nas saídas e abril não. Modo
accrual: abril traz 100 e março não. Em cada modo o valor é o mesmo total de
spending-by-category daquele mês.
Proof: `uv run pytest tests/test_category_flows_api.py::test_outflows_follow_credit_card_accounting_mode`

**C3** (3) - Categoria oculta (`is_hidden`) com débito posted no mês entra em outflows. Conta
encerrada não contribui.
Proof: `uv run pytest tests/test_category_flows_api.py::test_hidden_category_counts_closed_account_does_not`

**C4** (4) - Mês sem lançamento que `counts_as_user_pnl` aceite (ignorado, par de transferência,
categoria `treat_as_transfer`): 200, outflows e inflows vazios.
Proof: `uv run pytest tests/test_category_flows_api.py::test_month_without_pnl_rows_returns_empty_lists`

**C5** (5) - Ordem dentro de cada lista: total decrescente. `percentage` = total do item / soma
da lista, 2 casas: Alimentação 93.33, sem categoria 6.67, Salário 100.00.
Proof: `uv run pytest tests/test_category_flows_api.py::test_flows_sorted_by_total_with_share_of_list`

### S2 - Página /categories · 2 files

**C6** (6) - Mês outubro 2026 e os lançamentos do critério 1: seção `Saídas por categoria`
(en: `Outflows by category`) mostra Alimentação `R$ 140,00` e depois `Sem categoria`
`R$ 10,00`. `Entradas por categoria` (en: `Inflows by category`) mostra Salário `R$ 80,00`.
Em en: `Uncategorized`, `Outflows by category`, `Inflows by category`, valor no formato da
moeda primária. O catálogo de grupos continua abaixo.
Proof: `npx vitest run src/pages/categories-month-flows.test.tsx -t "shows october outflows and inflows above the catalog"`

**C7** (7) - Mês inicial = mês corrente. Avançar o controle: valores de outubro somem e passam
a ser do mês seguinte. Voltar: outubro volta com `R$ 140,00` em Alimentação.
Proof: `npx vitest run src/pages/categories-month-flows.test.tsx -t "starts at the current month and steps forward and back"`

**C8** (8) - Busca `ali`: saídas só Alimentação; entradas não mostram Salário. Comparação sem
distinguir maiúsculas. Busca vazia volta ao critério 6. Busca `zzz`: as duas seções mostram
`Nenhuma categoria encontrada` (en: `No category found`) e não mostram os textos do critério 9.
Proof: `npx vitest run src/pages/categories-month-flows.test.tsx -t "filters flows by category name without the empty-month copy"`

**C9** (9) - outflows e inflows vazios: seções permanecem com `Nenhuma saída neste mês` e
`Nenhuma entrada neste mês` (en: `No outflows this month`, `No inflows this month`).
Proof: `npx vitest run src/pages/categories-month-flows.test.tsx -t "keeps both sections with the empty-month copy"`

**C10** (10) - Enquanto a resposta do mês recém-selecionado não chegou: skeletons nas duas
seções, sem o valor do mês anterior.
Proof: `npx vitest run src/pages/categories-month-flows.test.tsx -t "shows skeletons and drops the previous month while the next month loads"`

**C11** (11) - Clique em Alimentação nas saídas navega para
`/transactions?category_id={id}&from=2026-10-01&to=2026-10-31&type=debit`. Sem categoria:
`uncategorized=1` e `type=debit`, sem `category_id`. Salário nas entradas: `category_id` de
Salário, mesmo from/to, `type=credit`.
Proof: `npx vitest run src/pages/categories-month-flows.test.tsx -t "links a flow row to the transactions of that category and month"`

**C12** (12) - Controle `Regras automáticas` (en: `Automatic rules`) navega para `/rules`.
Aparece com `canWrite` verdadeiro ou falso.
Proof: `npx vitest run src/pages/categories-month-flows.test.tsx -t "links automatic rules to /rules with or without write access"`

**C13** (13) - `canWrite` verdadeiro: `Nova categoria` abre o diálogo de criação que a página
já tem. `canWrite` falso: esse botão não aparece.
Proof: `npx vitest run src/pages/categories-month-flows.test.tsx -t "opens the existing category dialog and hides the button without write access"`

### S3 - Sync já existente · 1 file

**C14** (14) - Regra ativa condição `description contains UBER`, ação `set_category` Transporte.
Sync grava débito de conta corrente descrição `UBER * TRIP` e débito de cartão com a mesma
descrição: os dois ficam com categoria Transporte. Vale com `use_provider_categories` ligado e
a Pluggy mandando outra categoria: a regra preenche `category_id` e o fallback do provedor não
troca. Regra cuja condição é o `account_id` da conta corrente não categoriza o débito do
cartão. Não reescreve o motor.
Proof: `uv run pytest tests/test_sync_category_rule_lock.py::test_sync_description_rule_categorizes_checking_and_card_and_account_rule_skips_card`

## Swept

Herdado da task, mapeado para checks:

- validation: C4, C5
- failure modes: C1 (pending, par, sem categoria), C8, C9
- idempotency and retry: n/a — leitura e um sync que já é idempotente por `external_id` (task não pede retry)
- authorization: leitura `current_workspace` na porta; C12 e C13 travam `canWrite` na tela
- concurrency and ordering: C5, C10
- data lifecycle: C3
- external-dependency failure: C14 (categoria do provedor não substitui a regra)
- state transitions: C2 (cash/accrual), C7
- observability: existing — a rota nova entra no log de requisições que toda rota já tem

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| lançamentos de outubro (7) | débito 100 corrente C1 · débito 40 cartão C1 · débito 25 pending C1 · débito 10 sem categoria C1 · crédito 80 Salário C1 · crédito 200 com par C1 · débito 500 com par C1 | - |
| modos do cartão (2) | cash C2 · accrual C2 | - |
| meses do modo (2) | março C2 · abril C2 | - |
| listas vazias vs busca (3) | mês sem P&L C4/C9 · busca sem match C8 · busca que casa C8 | - |
| idiomas com copy nos critérios (2) | pt-BR C6, C8, C9, C12, C13 · en C6, C8, C9, C12 | - |
| `canWrite` (2) | verdadeiro C12, C13 · falso C12, C13 | - |
| destinos do clique (3) | Alimentação débito C11 · sem categoria C11 · Salário crédito C11 | - |

- Claims que nomeiam status code, rota ou shape de resposta: C1, C2, C4 — todos provados via
  cliente HTTP (httpx ASGI), cruzando a fronteira
- C14 prova o sync chamando `sync_connection`, não o motor isolado
- Nenhum outro check afirma mais do que o caso que seu proof exercita

## Handoff

Checklist no commit `0541afd`, antes do código. Implementação no commit `bf1893c`. O teste de tela esperava o catálogo e o mês vazio no primeiro paint, quando a seção já existe e a query ainda não resolveu; a espera passou a ser pelo conteúdo. Esse ajuste está no commit desta revisão.

Proofs, todos com exit code 0:

- `cd backend && uv run pytest` — 4286 passed, 8 skipped
- `cd backend && uv run ruff check` nos arquivos tocados — limpo
- `npx vitest run src/pages/categories-month-flows.test.tsx -t` para cada um dos 8 testes de S2 — exit 0
- `npx vitest run src/pages/categories-delete.test.tsx src/locales/i18n.test.ts` — exit 0

Nada foi abandonado. O motor de regras e `spending-by-category` não foram reescritos. `uv sync --all-extras` em `backend/` foi necessário antes do primeiro pytest.
