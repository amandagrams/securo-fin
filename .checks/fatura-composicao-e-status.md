# Composição e status da fatura

Profile: `light` (nenhuma declaração em AGENTS.md ou equivalente; default). Nota ao usuário: a
feature tem copy e arranjo específicos nos critérios — o profile `ui` cobriria espaçamento/cor/peso;
sob `light` isso fica de fora da verificação.

Sources:

- A mensagem da tarefa — única fonte, é o registro de decisão: 13 critérios, a porta dos quatro
  campos em `AccountSummary`, escopo e o que ficou de fora (Conferir com o banco, intervalo na
  linha Compras, mudar Total/limite/vencimento, quebra por cartão).

## Out of scope

Herdado da tarefa, sem acréscimos: botão Conferir com o banco; intervalo de datas na linha
Compras; mudar Total, limite ou vencimento; quebra por cartão (já existe). Também fora: upcoming
bills, dashboard, categorias, recorrência, calendário, card da lista de contas, Playwright, e
qualquer mudança na matemática de `projected_expenses`.

## Landing

Toca: `get_account_summary` em `backend/app/services/account_service.py`, `AccountSummary` em
`backend/app/schemas/account.py`, a conversão `_primary` em `backend/app/api/accounts.py`, o
componente novo `frontend/src/components/bill-composition.tsx`, o mínimo de importação/JSX em
`frontend/src/pages/account-detail.tsx`, `AccountSummary` em `frontend/src/types/index.ts`, e
locales. Reusa: `counts_on_bill` e o `_scope` de `bill_id` / `unbilled_only` que já alimentam
`projected_expenses`, `convert()` do mesmo jeito que os outros `_primary`, `isInProgressCycle`,
`isCycleMathWindow`, `closeDateForBill`, `dueDateForCycle` e o fechamento do card de limite
(dia seguinte a `filterTo`). O cliente em `frontend/src/lib/api.ts` já devolve o corpo inteiro
de `GET /api/accounts/{id}/summary` — não muda. O teste de paridade `i18n.test.ts` exige toda
chave nova de `en.json` nos outros 14 locales (15 arquivos no total).

| One-way door (decidida na tarefa) | Literal shape | Alternative rejected |
| --- | --- | --- |
| Composição no summary, não no cliente | `AccountSummary.bill_purchases: float \| null`, `bill_refunds: float \| null`, `bill_purchases_primary: float \| null`, `bill_refunds_primary: float \| null`. Mesmos filtros de `projected_expenses` (`counts_on_bill`, posted+pending+futuros, `bill_id` e `unbilled_only`). `null` fora de `credit_card`. Débitos em `bill_purchases`, créditos em `bill_refunds`, de modo que a diferença é `projected_expenses` | somar no cliente a partir de `GET /api/transactions` |

| Três peças num módulo (build) | `bill-composition.tsx` exporta o bloco, a linha de estado e o aviso; `account-detail.tsx` só importa e posiciona (ao lado do seletor, abaixo do Total, e o bloco entre a stat bar e o card de limite) | escrever a copy dentro de `account-detail.tsx` — outro agente edita a mesma página para Próximas faturas |
| Estado só onde a tarefa deu copy (build) | aberto quando `isInProgressCycle` e a janela é de ciclo (`isCycleMathWindow`) e há `statement_close_day`; fechado quando um bill ancora e há `statement_close_day`; ciclo de cycle-math que não é o em curso e não é bill não mostra estado | reutilizar `Fatura fechada` com fechamento = `filterTo` + 1 nesse ciclo passado — a tarefa só define `Fatura fechada` quando um bill ancora |
| Inglês de `fechou em {data}` (build) | `closed {date}`, no molde de `closes {date}` do critério 9: `Closed bill · closed {date} · due {date}` e `Closed bill · closed {date} · was due {date}` | `closed on {date}` — a tarefa escreveu `closes {date}` e `due {date}` sem "on" |

- Nada mais aqui é difícil de reverter. A linha de estado formata as duas datas com
  `toLocaleDateString(dateLocale)`, o mesmo `formatDateStr` do card de limite, para o
  fechamento ser a mesma string.

## Checks

Proofs backend rodam de `backend/` (`uv run pytest tests/...`); frontend de `frontend/`
(`npx vitest run ...`). Critério da tarefa entre parênteses. Cada proof é um teste, não a suíte.

### S1 - Composição no summary · 3 files · 65 KB · ~16k

**C1** (1) - Conta `credit_card`, fatura selecionada, cinco lançamentos nessa fatura (datas dentro
da janela, `bill_id` dela): débito `100.00` posted, débito `50.00` pending, crédito `30.00`
posted fora de categoria `treat_as_transfer`, débito `25.00` posted `is_ignored`, crédito `80.00`
com `transfer_pair_id`. Um crédito posted em categoria `treat_as_transfer` na mesma fatura e um
débito posted noutra fatura não entram. `GET /api/accounts/{id}/summary` com `bill_id` e a janela
→ `200`, `bill_purchases` `150.00`, `bill_refunds` `30.00`, e
`bill_purchases − bill_refunds == projected_expenses` (`120.00`). No mesmo teste, a janela
`unbilled_only` (sem `bill_id`) soma posted + pending + futuro ainda sem fatura e deixa de fora
o que já tem `bill_id`, com `bill_purchases − bill_refunds == projected_expenses`.
Proof: `uv run pytest tests/test_bill_composition_api.py::test_bill_purchases_and_refunds_for_selected_bill`

**C2** (2) - Conta cujo `type` não é `credit_card` (moeda diferente da primária, para os
`_primary` não ficarem null só porque a moeda coincide): `bill_purchases`, `bill_refunds`,
`bill_purchases_primary` e `bill_refunds_primary` são `null`.
Proof: `uv run pytest tests/test_bill_composition_api.py::test_bill_composition_null_for_non_credit_card`

**C3** (3) - Conta `credit_card` em USD com primária BRL e taxa USD→BRL `5`: débito `100.00` e
crédito `20.00` que contam na fatura → `bill_purchases` `100.00`, `bill_refunds` `20.00`,
`bill_purchases_primary` `500.00`, `bill_refunds_primary` `100.00`, e a razão de cada par
`_primary` / nativo é a mesma de `projected_expenses_primary` / `projected_expenses`.
Proof: `uv run pytest tests/test_bill_composition_api.py::test_bill_composition_primary_converted_like_other_primary`

### S2 - De onde vem esse valor · 4 files · ~100 KB · ~25k

A página já devolve o JSON inteiro do summary; os testes mockam os quatro campos e uma lista de
lançamentos cujo total não é o do summary, para a tela não poder ter somado `GET /api/transactions`.
Locale de exibição `en-US` salvo C6. Conta BRL com primária BRL, salvo C7.

**C4** (4) - Na página `credit_card`, o bloco `Where this amount comes from` tem `Purchases` =
`bill_purchases` (`R$150.00`), `− Refunds` = `bill_refunds` (`R$30.00`) e `= Bill` = diferença
(`R$120.00`). A linha Bill é o mesmo Total da stat bar. Um débito `999.00` na lista não aparece
no bloco.
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "shows purchases, refunds, and bill lines that match the bill total"`

**C5** (5) - `bill_refunds` `0` → a linha de estornos não aparece (`Refunds` ausente); `Purchases`
e `Bill` mostram o mesmo valor, igual ao Total.
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "hides the refunds line when bill refunds are zero"`

**C6** (6) - Fatura sem lançamentos, pt-BR: o bloco permanece com `De onde vem esse valor`,
`Compras` e `Fatura` em `R$ 0,00`; `Estornos` não aparece.
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "keeps the composition block at zero for an empty bill in pt-BR"`

**C7** (7) - Conta USD, primária BRL. Seletor na moeda da conta: `Purchases` `$10.00`, `− Refunds`
`$4.00`, `= Bill` `$6.00`, e Bill igual ao Total. Seletor na primária: `R$50.00`, `R$20.00`,
`R$30.00`, e Bill igual ao Total. Cada modo não mostra os valores do outro.
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "follows the currency toggle and keeps the bill line equal to the shown total"`

**C8** (8) - `type` diferente de `credit_card`: o bloco não aparece.
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "hides the composition block on a non credit card account"`

### S3 - Estado e valor estimado · 2 files · ~99 KB · ~25k

Relógio `2026-09-08`. Datas da linha no `toLocaleDateString('en-US')` do card de limite.
A página abre no ciclo em curso quando nenhuma fatura vence hoje ou depois
(`creditCardCycleBoundaries` do dia 30 → `filterTo` `2026-09-29`).

**C9** (9) - Ciclo em curso (`statement_close_day` 30, `payment_due_day` 10, bills
`2026-04-10` e `2026-05-10`): junto ao seletor,
`Open bill · closes 9/30/2026 · due 10/10/2026`. Fechamento = dia seguinte a `filterTo`
(`2026-09-30`), o mesmo texto do card de limite. Vencimento = `dueDateForCycle(filterTo, 10)`
(`2026-10-10`).
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "shows the open bill status beside the selector on the in-progress cycle"`

**C10** (10) - Bill ancora o ciclo (`statement_close_day` 30; bills `2026-05-10` e
`2026-10-10`; a página abre na de `2026-10-10`): `Closed bill · closed 9/30/2026 · due 10/10/2026`
(`closeDateForBill('2026-10-10', 30)` = `2026-09-30`, `due_date` >= hoje). No ciclo anterior
(`2026-05-10`): `Closed bill · closed 4/30/2026 · was due 5/10/2026`
(`closeDateForBill('2026-05-10', 30)` = `2026-04-30`, `due_date` < hoje).
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "shows closed bill status with due or was due from the anchoring bill"`

**C11** (11) - Sem `statement_close_day`, nenhum estado. Com close day, no ciclo em curso o
estado aparece; depois de editar o fim da janela à mão (deixa de ser bill e deixa de ser janela
de ciclo — `isCycleMathWindow` falso, mesmo com `filterFrom` ainda no ciclo aberto), nenhum
estado.
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "shows no bill status without a close day or on a hand-edited window"`

**C12** (12) - No mesmo ciclo em curso de C9, abaixo do Total:
`Estimated — the bank hasn't closed this bill yet; we add up the charges it has sent`.
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "shows the estimated notice below the total on the in-progress cycle"`

**C13** (13) - Com o bill de C10 ancorando o ciclo, esse aviso não aparece.
Proof: `npx vitest run src/pages/account-detail-composition.test.tsx -t "hides the estimated notice when a bill anchors the cycle"`

## Swept

Herdado da tarefa, mapeado para checks:

- validation: C2, C5
- failure modes: C1 (ignorado, par de transferência, crédito `treat_as_transfer`, outra fatura)
- idempotency and retry: n/a — leitura derivada, sem gravação
- authorization: existing — a rota de summary não muda de quem pode ler
- concurrency and ordering: n/a
- data lifecycle: n/a — nada é persistido
- external-dependency failure: C3 (a conversão é a mesma de `projected_expenses_primary`)
- state transitions: C9 aberto, C10 fechada com vencimento futuro ou passado, C11 nenhum, C12 aviso, C13 aviso some
- observability: existing — a rota de summary já entra no log de requisições

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| lançamentos do critério 1 (7) | débito 100 posted C1 · débito 50 pending C1 · crédito 30 C1 · débito 25 `is_ignored` C1 · crédito 80 com par C1 · crédito `treat_as_transfer` C1 · débito de outra fatura C1 | - |
| escopos do critério 1 (2) | `bill_id` + janela C1 · `unbilled_only` com posted, pending, futuro e já faturado C1 | - |
| tipos de conta (2) | `credit_card` C1 · outro C2 | - |
| moedas do summary (2) | igual à primária C1 · diferente C3 | - |
| linhas do bloco (3) | Compras C4 · Estornos C4 · Fatura = Total C4 | - |
| estornos zero (2) | linha oculta C5 · Compras = Fatura C5 | - |
| fatura vazia (1) | bloco em zero pt-BR C6 | - |
| seletor (2) | moeda da conta C7 · primária C7 | - |
| página não-cartão (1) | bloco ausente C8 | - |
| estados (4) | aberta C9 · fechada `due` C10 · fechada `was due` C10 · nenhum C11 | ciclo de cycle-math passado, sem bill — sem copy na tarefa (Landing) |
| aviso (2) | abaixo do Total no ciclo em curso C12 · ausente com bill C13 | - |
| idiomas com copy nos critérios (2) | en C4, C9, C10, C12 · pt-BR C6 | - |

- Claims que nomeiam rota ou shape de resposta: C1, C2, C3 — todos provados via cliente HTTP
  (httpx ASGI), cruzando a fronteira
- Nenhum outro check afirma mais do que o caso que seu proof exercita
- Paridade de locales: o teste que já existe,
  `npx vitest run src/locales/i18n.test.ts -t "all languages contain all keys from en.json"`,
  cobre as chaves novas. Não é um critério da tarefa, então não é um check numerado

## Handoff

Aritmética (wc -c ÷ 4; `en.json` / `pt-BR.json` contados como ~2 KB de leitura dirigida, não o
arquivo inteiro — são JSON de dados editados por inserção pontual; `api.ts` não entra, o summary
já devolve o JSON inteiro; `types/index.ts` entra só pela interface `AccountSummary`):

- S1 = 65 KB ≈ 16k (`account_service.py` 49503, `schemas/account.py` 4159, `api/accounts.py` 11358)
- S2 = ~100 KB ≈ 25k (`account-detail.tsx` 97421 + interface + locales) — acumulado ~41k
- S3 = a mesma página de S2 + `credit-card-cycle.ts` 2038 — acumulado ~42k < 150k

**Sem handoff no meio.** Um batch só: a superfície de S2 e S3 é a mesma página, e o acumulado
fica abaixo de 150k. A fronteira de troca de superfície (backend → página) não estoura o teto,
então C1–C13 fecham juntos.

- **Onde caiu a fronteira**: ainda não — o checklist é anterior ao código. O SHA entra aqui
  quando o batch fechar.
- **O que o usuário decidiu no meio do build**: nada ainda.
- **O que foi abandonado**: nada ainda.
