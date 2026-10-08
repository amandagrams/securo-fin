# Cartão na lista de Contas

Profile: `light` (nenhuma declaração em AGENTS.md ou equivalente; default). Nota ao usuário: a
faixa de cor da barra está nos critérios e entra na verificação; espaçamento, peso e o resto da
cor ficam de fora sob `light`.

Sources:

- Task «Cartão na lista de Contas — limite usado, estado da fatura e parcelas futuras» — única
  fonte, é o registro de decisão: 8 critérios, escopo e a ordem dentro do card (barra, estado,
  parcelas). Não há arquivo em `.tasks/`. O branch de partida é `integrate/onda-1` em `9a7cb44`,
  que já tem `GET /api/accounts/{account_id}/upcoming-bills`.

## Out of scope

Herdado da task, sem acréscimos: quebra por pessoa ("Você · Thati"); link próprio "ver fatura";
substituir o badge de urgência; mostrar `minimum_payment`, `card_brand` ou `card_level`; qualquer
mudança no endpoint `upcoming-bills`; Playwright; reescrever `account-detail`, dashboard,
categorias, calendário ou o diálogo de transação. Mover `utilizationColor` para um módulo
compartilhado e importá-la de volta na página da conta não é reescrita: o corpo da função e a
chamada `utilizationColor(rawPct)` continuam os mesmos.

## Landing

Toca: as duas linhas de conta em `frontend/src/pages/accounts.tsx` (manual e conectada), um
componente montado nas duas, `utilizationColor` extraída para `frontend/src/lib/credit-utilization.ts`,
cinco chaves novas em `accounts` nos 15 locales. Reusa: `accounts.upcomingBills` já em
`frontend/src/lib/api.ts` (sem parâmetro novo; o default `cycles` fica), `formatCurrency`,
`useDisplayLocale`, `mask` do modo privacidade, `localDateString`, `resolveDateFnsLocale`,
`daysUntil` do badge que a lista já desenha, a query key `['accounts', id, 'upcoming-bills']`.
O teste de paridade `src/locales/i18n.test.ts` exige toda chave nova em `en.json` presente nos
15 locales. Não há rota nova.

| One-way door (decidida na task) | Literal shape | Alternative rejected |
| --- | --- | --- |
| Nada na task é one-way | a lista só lê campos que o payload da conta e o `GET` já devolvem | — |

| Faixa da barra (build) | a lista chama a mesma `utilizationColor(pct)` da página da conta, com `pct = (credit_limit − available_credit) / credit_limit × 100`. Verde `< 30`, azul `>= 30`, âmbar `>= 70`, rosa `>= 90` (`bg-emerald-500`, `bg-blue-500`, `bg-amber-400`, `bg-rose-500`). A largura é `min(100, max(0, pct))`%. A barra só existe com os dois números não-null e `credit_limit > 0` | copiar o `if` na lista com outros cortes — era o que a task proibia |
| Estado da fatura (build) | a linha só existe com `statement_close_day != null`, `payment_due_day != null`, `next_close_date` e `next_due_date` preenchidos. Aberta quando `next_close_date >= localDateString()` (o mesmo dia local do `daysUntil` do badge; comparação de `YYYY-MM-DD`, sem `new Date('YYYY-MM-DD')` que lê UTC). Fechada no resto. Datas `format(..., 'dd MMM')` com `resolveDateFnsLocale` da língua da UI. Copy nova, minúscula, e a fechada não repete a data de fechamento | reusar `accounts.billOpen` / `accounts.billClosedDue` — são maiúsculas e a fechada inclui `closed {{close}}` |
| Parcelas futuras (build) | `future_committed_total` na moeda da conta (`formatCurrency` + `mask`). `> 0` mostra a linha; `0`, `null`, fetch ainda pendente ou erro sem dado não mostram, e não há skeleton novo. O fetch é o `accounts.upcomingBills(id)` já existente, só na linha de `credit_card` aberta (manual e conectada). `future_committed_total_primary` não aparece: a lista não tem seletor de moeda | somar `cycles` no cliente, ou pedir outro endpoint |
| Onde os três blocos moram (build) | um componente só, dentro do `Link` que a linha já tem para `/accounts/{id}`, ordem barra → estado → parcelas. O badge de urgência continua na linha do tipo. Os dois renders (manual e conectado) montam o mesmo componente. Encerrada e qualquer outro `type` não montam | um segundo link "ver fatura" |

- Nada mais aqui é difícil de reverter.

## Checks

Proofs de `frontend/` (`npx vitest run ...`). Critério da task entre parênteses. O relógio dos
testes de data está congelado em `2026-10-08` 12:00 no fuso local (`Date` falso, timers reais).
O valor monetário é `formatCurrency` na moeda da conta e no locale de exibição; o proof compara
o `textContent` do nó com essa string e, à parte, exige que tirar todo whitespace dela deixe o
literal do critério (o `Intl` pt-BR põe NBSP depois de `R$`; o en-US cola `R$` no número).

### S1 - Cartão na lista · 4 files · ~52 KB · ~13k

**C1** (1) - Cartão manual `credit_card` em pt-BR, locale de exibição `pt-BR`, moeda `BRL`,
`credit_limit` `50000.00`, `available_credit` `29128.52`: o card mostra `Limite usado`, o nó do
valor tem `textContent` igual a `accounts.limitUsedOf` com `formatCurrency(20871.48, 'BRL', 'pt-BR')`
e `formatCurrency(50000, 'BRL', 'pt-BR')`, e sem whitespace esse texto é
`R$ 20.871,48 de R$ 50.000,00`. A barra (`progressbar`) tem largura
`((50000 − 29128.52) / 50000) × 100`% e a classe `bg-blue-500`, que é `utilizationColor` dessa
porcentagem
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "shows the used limit bar with pt-BR amounts on a manual card"`

**C2** (1) - O mesmo cartão com a UI em en: o rótulo é `Limit used`
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "labels the used limit bar in English"`

**C3** (1) - Oito cartões manuais, um por corte, limite e disponível escolhidos para a
porcentagem cair em `20`, `29.99`, `30`, `69.99`, `70`, `89.99`, `90` e `100`. A classe do
preenchimento é, nessa ordem, `bg-emerald-500`, `bg-emerald-500`, `bg-blue-500`, `bg-blue-500`,
`bg-amber-400`, `bg-amber-400`, `bg-rose-500`, `bg-rose-500`, e cada uma é também o retorno de
`utilizationColor(pct)` com o `pct` calculado do mesmo jeito que a barra. A largura é esse `pct`
já limitado a `0..100`
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "colors the used limit bar with the account page bands"`

**C4** (2) - Três cartões manuais: `credit_limit` null e `available_credit` `100` (a linha
`Limite disponível` / `Available credit` continua, a barra não); `available_credit` null e
`credit_limit` `5000` (nem barra nem linha de disponível; o saldo continua); os dois null (nem
barra). Um quarto com `credit_limit` `0` e `available_credit` `0` também não tem barra
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "hides the used limit bar when limit or available credit is missing"`

**C5** (3) - pt-BR, dois cartões com `statement_close_day` e `payment_due_day` preenchidos.
Um com `next_close_date` `2026-10-15` e `next_due_date` `2026-10-22`; outro com
`next_close_date` `2026-10-08` (hoje) e `next_due_date` `2026-10-20`. Os dois mostram
`fatura aberta · fecha em {dd MMM} · vence em {dd MMM}` com as datas de
`format(..., 'dd MMM')` em pt-BR. O badge `Vence em 14 dias` continua no primeiro
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "shows the open bill line in pt-BR when the close date is today or later"`

**C6** (3) - Os mesmos dois cartões em en: `open bill · closes {date} · due {date}`, datas
`dd MMM` em en, e o badge `Due in 14 days` continua no primeiro
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "shows the open bill line in English when the close date is today or later"`

**C7** (4) - pt-BR, `next_close_date` `2026-10-07`, `next_due_date` `2026-10-18`, os dois dias
preenchidos: `fatura fechada · vence em {dd MMM}`. O `dd MMM` de `2026-10-07` não entra nessa
linha. O badge `Vence em 10 dias` continua
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "shows the closed bill line in pt-BR when the close date is past"`

**C8** (4) - O mesmo cartão em en: `closed bill · due {date}`, e o badge `Due in 10 days` continua
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "shows the closed bill line in English when the close date is past"`

**C9** (5) - Quatro cartões, todos com datas que sozinhas contariam como fatura aberta. Sem
`statement_close_day` (com `payment_due_day`) e sem `payment_due_day` (com `statement_close_day`):
a linha de estado não aparece e o badge de urgência aparece nos dois. Com os dois dias e
`next_close_date` null, ou com os dois dias e `next_due_date` null: a linha de estado não aparece
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "hides the bill state line without cycle days or dates and keeps the due badge"`

**C10** (6) - `upcoming-bills` devolve `future_committed_total` `12840.72` para um cartão manual
`BRL`, UI pt-BR, locale de exibição `pt-BR`: o nó tem `textContent` igual a
`accounts.futureInstallments` com `formatCurrency(12840.72, 'BRL', 'pt-BR')`, e sem whitespace
esse texto é `R$ 12.840,72 em parcelas futuras entram nas próximas faturas`
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "shows future installments in pt-BR"`

**C11** (6) - O mesmo total, UI en, locale de exibição `en-US`: `textContent` igual a
`accounts.futureInstallments` com `formatCurrency(12840.72, 'BRL', 'en-US')`, e sem whitespace
esse texto é `R$ 12,840.72 in future installments hit upcoming bills`
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "shows future installments in English"`

**C12** (7) - Três renders de um cartão que teria a linha se o total fosse positivo:
`future_committed_total` `0`, `null`, e o `GET` ainda pendente. Nos três a frase não aparece.
No pendente o card já está na tela (contas carregaram) e o link do cartão não ganha
`.animate-pulse`
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "hides future installments for zero null or loading without a skeleton"`

**C13** (8) - Um cartão manual e um conectado, cada um com limite, fatura aberta e
`future_committed_total` `12840.72`. Nos dois o `Link` para `/accounts/{id}` contém, nesta
ordem, a barra, a linha de estado e a linha de parcelas. Não há outro link de fatura
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "shows limit bar bill state and future installments on manual and connected cards in that order"`

**C14** (8) - `checking`, `savings`, `investment`, `wallet` e um `credit_card` encerrado, todos
com `credit_limit`, `available_credit`, os dois dias e as duas datas preenchidos. Nenhum mostra
`Limite usado`, linha de fatura ou parcelas. `accounts.upcomingBills` não é chamado. O cartão
encerrado aparece na seção de encerradas
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "hides card facts on other types and on closed cards"`

**C15** (fora) - Cartão com `minimum_payment` `150.5`, `card_brand` `Visa Infinite X` e
`card_level` `Ultraviolet`: esses três textos não aparecem na lista
Proof: `npx vitest run src/pages/accounts-card-list.test.tsx -t "does not show minimum payment brand or card level on the list"`

## Swept

Herdado da task, mapeado para checks:

- validation: C4, C9
- failure modes: C12 (fetch pendente), C14
- idempotency and retry: n/a — a lista só lê
- authorization: n/a — nenhuma rota nova; o `GET` já existente segue `current_workspace`
- concurrency and ordering: C13 (ordem dos três blocos; as duas linhas de render)
- data lifecycle: n/a — nenhuma escrita
- external-dependency failure: C12 (resposta ainda não chegou; erro sem dado cai no mesmo
  "não mostra", sem check próprio)
- state transitions: C5, C7 (aberta inclui o dia de hoje; fechada é o dia anterior)
- observability: existing — nenhum endpoint novo

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| faixas (4) + cortes (8) | `< 30` C3 `20` e `29.99` · `>= 30` C3 `30` e `69.99` · `>= 70` C3 `70` e `89.99` · `>= 90` C3 `90` e `100` · exemplo `41.74…` azul C1 | - |
| ausência da barra (4) | `credit_limit` null C4 · `available_credit` null C4 · os dois null C4 · `credit_limit` `0` C4 | - |
| estado da fatura (4) | aberta com fecha futuro C5, C6 · aberta com fecha hoje C5, C6 · fechada C7, C8 · sem linha C9 | - |
| dias ou datas faltando (4) | sem `statement_close_day` C9 · sem `payment_due_day` C9 · sem `next_close_date` C9 · sem `next_due_date` C9 | - |
| badge de urgência (2) | continua com a linha de estado C5, C7 · continua sem a linha, nos dois dias faltando C9 | - |
| parcelas (3) | `12840.72` C10, C11 · `0` ou `null` C12 · fetch pendente C12 | - |
| onde aparece (2) e onde não (5) | manual C13 · conectada C13 · `checking` C14 · `savings` C14 · `investment` C14 · `wallet` C14 · encerrada C14 | - |
| idiomas com copy nos critérios (2) | pt-BR C1, C5, C7, C10 · en C2, C6, C8, C11 | - |
| campos que a lista não mostra (3) | `minimum_payment` C15 · `card_brand` C15 · `card_level` C15 | - |

- Nenhum check afirma status code, rota ou shape: o `GET` já está coberto na task de próximas
  faturas. Aqui o proof é a lista renderizada
- Nenhum outro check afirma mais do que o caso que seu proof exercita
- Chave nova em `en.json` (`accounts.limitUsed`, `accounts.limitUsedOf`, `accounts.listBillOpen`,
  `accounts.listBillClosed`, `accounts.futureInstallments`) entra no teste de paridade já
  existente (`src/locales/i18n.test.ts`, describe `all languages contain all keys from en.json`)
  Proof: `npx vitest run src/locales/i18n.test.ts -t "all languages contain all keys from en.json"`

## Handoff

Aritmética (wc -c ÷ 4; leituras dirigidas, no mesmo critério do handoff de
`fatura-por-cartao.md`: o trecho lido, não o arquivo inteiro quando o arquivo é grande e a
edição é pontual; locales ~2 KB):

- S1 = ~52 KB ≈ 13k (`accounts.tsx` 42 KB inteiro porque os dois renders são o produto,
  `utilizationColor` em `account-detail.tsx` ~1 KB, `upcoming-bills-section.tsx` 3 KB como
  modelo do fetch, o bloco `upcomingBills` de `api.ts` ~1 KB, `UpcomingBills` nos tipos ~1 KB,
  `formatCurrency` ~2 KB, locales ~2 KB). `account-detail.tsx` inteiro tem 100 KB e não entra.
  `en.json` inteiro tem 128 KB e não entra

**Um batch só**: S1 não cruza 150k. Não há fronteira no meio da task.

- **Onde caiu a fronteira**: não houve handoff no meio. Checklist em `fe9455c`. S1 (C1–C15) no commit `1329ab7`.
- **O que o usuário decidiu no meio do build**: nada — nenhuma clarificação nem renegociação. As portas novas (faixa compartilhada, copy nova da lista, `future_committed_total` na moeda da conta, os três blocos dentro do `Link`) estão em `Landing` e não contradizem a task.
- **O que foi abandonado**: nada tentado e descartado. Aviso ao próximo agente que o diff não mostra: `npm ci` em `frontend/` antes do vitest. `getByText` / `toHaveTextContent` normalizam o NBSP do `Intl` no nó e não na string esperada — os proofs de valor comparam `textContent` com `formatCurrency` e, à parte, o literal do critério sem whitespace. `account-detail.tsx` só troca o `import` de `utilizationColor`; o corpo da função foi para `src/lib/credit-utilization.ts`.
