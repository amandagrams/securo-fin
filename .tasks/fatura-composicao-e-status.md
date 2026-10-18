# Composição e status da fatura do cartão

> Build this with **tlc-implement** (`.cursor/skills/tlc-implement/SKILL.md`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

Na página da conta de cartão, o Total da fatura é um número só. O summary já abate estornos dos débitos em silêncio (`monthly_expenses` para `credit_card` soma com sinal trocado nos créditos — `app/services/account_service.py`), então quem compara o total com a soma visível das compras não fecha a conta e não vê por quê. A tela também não diz se a fatura exibida está aberta ou fechada: a data de fechamento mora no card de limite e o vencimento no stat bar, e nada os junta num estado legível. E no ciclo em curso, cujo total é calculado localmente porque o banco ainda não mandou a fatura, nada avisa que o número é estimado — o dinzo avisa, e a diferença vira desconfiança no nosso número.

Na página da conta com `type` `credit_card`, um bloco "De onde vem esse valor" mostra Compras − Estornos = Fatura batendo com o Total exibido; o cabeçalho do ciclo diz se a fatura está aberta ou fechada, com fechamento e vencimento na mesma linha; e o ciclo em curso carrega um aviso de valor estimado. Referência de estrutura: `.tasks/assets/dinzo/fatura.png`.

13 critérios em 3 fatias · 1 porta sem volta · 1 aberta, que não bloqueia

## Criteria

### De onde vem esse valor

1. Dado uma conta `credit_card` cuja fatura selecionada contém: débito `100.00` posted, débito `50.00` pending, crédito `30.00` posted fora de categoria `treat_as_transfer`, débito `25.00` posted com `is_ignored`, crédito `80.00` com `transfer_pair_id` preenchido — quando se chama `GET /api/accounts/{account_id}/summary` com o `bill_id`/janela dessa fatura, então `bill_purchases` é `150.00`, `bill_refunds` é `30.00`, e `bill_purchases − bill_refunds` é igual a `projected_expenses` (`120.00`). O escopo dos dois campos é exatamente o de `projected_expenses`: `counts_on_bill`, posted + pending + futuros, respeitando `bill_id` e `unbilled_only`.
2. Numa conta cujo `type` não é `credit_card`, `bill_purchases` e `bill_refunds` são `null` no summary.
3. Dado uma conta em moeda diferente da primária, o summary devolve também `bill_purchases_primary` e `bill_refunds_primary`, convertidos como os demais campos `_primary` que ele já tem.
4. Na página da conta `credit_card`, o bloco `De onde vem esse valor` (en: `Where this amount comes from`) mostra três linhas: `Compras` = `bill_purchases`, `− Estornos` = `bill_refunds`, `= Fatura` = `bill_purchases − bill_refunds` (en: `Purchases`, `Refunds`, `Bill`). O valor da linha `Fatura` é o mesmo Total da fatura do stat bar da página.
5. Quando `bill_refunds` é `0`, a linha de estornos não aparece e o bloco mostra `Compras` e `Fatura` com o mesmo valor.
6. Com a fatura sem lançamentos, o bloco permanece, com `Compras` e `Fatura` em zero formatado (`R$ 0,00` em pt-BR).
7. Dado uma conta em `USD` com primária `BRL`, quando o seletor de moeda está na moeda da conta, as três linhas usam `bill_purchases`/`bill_refunds` em `USD`; na primária, usam os campos `_primary` em `BRL`. Nas duas posições a linha `Fatura` continua igual ao Total exibido.
8. Numa conta cujo `type` não é `credit_card`, o bloco não aparece.

### Fatura aberta ou fechada

9. Quando o ciclo exibido é o em curso (o mesmo `isInProgressCycle` que a página já computa), junto ao seletor de ciclo aparece `Fatura aberta · fecha em {data} · vence em {data}` (en: `Open bill · closes {date} · due {date}`) — fechamento é o dia seguinte a `filterTo`, como o card de limite já calcula, e vencimento é o `dueDateForCycle`/`due_date` do ciclo.
10. Quando uma bill ancora o ciclo exibido, o estado é `Fatura fechada` (en: `Closed bill`) com `fechou em {data}` usando `closeDateForBill(bill.due_date, statement_close_day)`, seguido de `vence em {data}` quando `due_date` ≥ hoje e `venceu em {data}` quando `due_date` < hoje (en: `due {date}` / `was due {date}`).
11. Quando a conta não tem `statement_close_day`, ou a janela foi editada à mão (nem bill ancorada nem janela de ciclo — a mesma distinção de `isCycleMathWindow`), nenhum estado de fatura aparece.

### Aviso de valor estimado

12. No ciclo em curso, abaixo do Total da fatura aparece `Valor estimado — o banco ainda não fechou esta fatura; somamos as compras que ele já mandou` (en: `Estimated — the bank hasn't closed this bill yet; we add up the charges it has sent`).
13. Quando uma bill ancora o ciclo exibido, o aviso não aparece.

## Out of scope

- Botão "Conferir com o banco" do dinzo — não existe deep link para o app do banco; o aviso basta.
- Intervalo de datas na linha de Compras ("Compras de 29 set a 7 out") — o seletor de ciclo já nomeia o período.
- Mudar a matemática do Total da fatura, do limite ou do vencimento — os campos novos decompõem o número que já existe.
- Quebra por cartão/pessoa — é `.tasks/fatura-por-cartao.md`.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen página da conta, bloco composição | empty state | 6 |
| screen página da conta, bloco composição | loading state | existing - a página inteira mostra skeletons enquanto o summary carrega |
| screen página da conta, bloco composição | error state | existing - a query de summary não tem painel de erro; esta tarefa não acrescenta um |
| screen página da conta, bloco composição | unauthorised state | existing - rota protegida e `current_workspace` |
| screen página da conta, bloco composição | density and ordering | 4 - três linhas, na ordem Compras, Estornos, Fatura |
| screen página da conta, bloco composição | destructive action confirms | n/a - nenhuma ação |
| screen página da conta, estado e aviso | empty state | 11 - sem dados de ciclo, sem estado |
| screen página da conta, estado e aviso | loading state | existing - mesmo skeleton de página |
| screen página da conta, estado e aviso | error state | existing |
| screen página da conta, estado e aviso | unauthorised state | existing |
| screen página da conta, estado e aviso | density and ordering | 9, 10 - uma linha de estado por ciclo |
| screen página da conta, estado e aviso | destructive action confirms | n/a - nenhuma ação |
| API `GET /api/accounts/{account_id}/summary` | response shape | 1, 2, 3 |
| API `GET /api/accounts/{account_id}/summary` | error shape and codes | existing - os códigos de hoje |
| API `GET /api/accounts/{account_id}/summary` | who may call it | existing - `current_workspace` |
| API `GET /api/accounts/{account_id}/summary` | versioning | n/a - campos aditivos, sem versão nova |
| API `GET /api/accounts/{account_id}/summary` | rate limit | n/a - sem limite novo |
| command | — | n/a - nenhum comando |
| document | — | n/a - nenhum documento |
| collection | — | n/a - nenhuma coleção nova |

## Swept

- validation: n/a - nenhuma entrada nova de usuário; os campos são calculados
- failure modes: 11 - janela sem ciclo identificável não finge ser fatura
- idempotency and retry: n/a - leitura pura, sem escrita
- authorization: existing - `current_workspace` no summary, rota protegida na página
- concurrency and ordering: n/a - nenhuma escrita; duas leituras simultâneas devolvem o mesmo cálculo
- data lifecycle: n/a - nada persistido de novo
- external-dependency failure: 12 - o aviso é exatamente o estado "o banco ainda não mandou"; a leitura usa só o que o sync gravou
- state transitions: n/a - aberta/fechada é derivado de datas a cada render, não um ciclo de vida persistido
- observability: existing - o summary já entra no log de requisições de toda rota

## Impact

| Front | What changes |
|---|---|
| domain | new term: `bill_purchases` / `bill_refunds` - soma absoluta dos débitos e dos créditos que `counts_on_bill` aceita, no mesmo escopo de `projected_expenses`; `null` fora de `credit_card`. Vivem em `AccountSummary`. |
| domain | existing term: `projected_expenses` continua o Total da fatura na tela e não muda de valor — os campos novos o decompõem, e o critério 1 fixa a identidade. Quem ramifica nele hoje (stat bar, régua de ciclos, barra de utilização) não é tocado. |
| stored data | nada a migrar - campos calculados na leitura, nenhuma tabela nova |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Composição no summary, não no cliente | `AccountSummary.bill_purchases: float \| null`, `bill_refunds: float \| null`, `bill_purchases_primary: float \| null`, `bill_refunds_primary: float \| null` — mesmos filtros de `projected_expenses` | Somar no cliente a partir de `GET /api/transactions` — o `limit` máximo de 500 derruba lançamentos de faturas grandes e a identidade com o Total quebra exatamente quando mais importa. |

## Surface

| Route | In | Out | Status | Criteria |
|---|---|---|---|---|
| `GET /api/accounts/{account_id}/summary` | inalterado | `bill_purchases`, `bill_refunds`, `bill_purchases_primary`, `bill_refunds_primary` | `200`; erros inalterados | 1, 2, 3 |

## Sources

- Pedido neste chat: planejar os quatro blocos dos prints do dinzo; este é o bloco "De onde vem esse valor" + status + aviso. "vamos planejar todos, podemos quebrar o plano em mais partes" decide o corte em tarefas separadas.
- `.tasks/assets/dinzo/fatura.png` e `.tasks/assets/dinzo/fatura-proximas.png` - **binding para a estrutura e o conteúdo dos blocos**, não para a identidade visual (a UI segue o design system do app). O que o print decide: "De onde vem esse valor: Compras de 29 set a 7 out R$ 5.229,78 − Estornos R$ 103,58 = Fatura R$ 5.126,20"; chip `aberta` com "fecha em 28 out · vence em 5 nov"; aviso "Valor estimado até o banco enviar o oficial (...) Até lá, somamos as compras que ele já mandou".
- `.tasks/fatura-por-cartao.md` - a quebra por cartão ("quem gastou") é daquela tarefa; esta não a toca.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | open | A linha de estornos some quando é zero (critério 5) ou fica visível com `R$ 0,00`, como o dinzo faz? | O critério 5 oculta a linha — menos ruído num bloco cuja razão de existir é explicar uma diferença que, com estorno zero, não existe. |
