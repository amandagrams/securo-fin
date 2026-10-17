# Dashboard: faturas em aberto de todos os cartões

> Build this with **tlc-implement** (`.cursor/skills/tlc-implement/SKILL.md`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

O dashboard não agrega faturas de cartão. A única menção é uma linha no tooltip do patrimônio que soma saldos de contas `credit_card` (`sumAccountBalances` em `frontend/src/pages/dashboard.tsx`) — não diz quantas faturas estão correndo, quanto somam nem qual vence primeiro. Quem tem vários cartões abre conta por conta para responder "quanto vou pagar e quando", que é a pergunta que o dinzo responde na primeira dobra ("Faturas em aberto · 7 cartões · vence 6 out · R$ 5.949,66").

No dashboard, um bloco "Faturas em aberto" mostra o total das faturas correntes de todos os cartões, quantos cartões são e o vencimento mais próximo, com uma linha por cartão que navega para a página da conta. Um endpoint novo agrega isso no backend. Referência de estrutura: `.tasks/assets/dinzo/dashboard.png`.

11 critérios em 2 fatias · 1 porta sem volta · 1 aberta, que não bloqueia

## Criteria

### O endpoint de agregação

1. Dado duas contas `credit_card` não encerradas, cada uma com uma bill de `due_date` ≥ hoje: quando se chama `GET /api/dashboard/credit-card-bills`, então a resposta é `200` com um item por conta em ordem crescente de `due_date`, cada um com `account_id`, `account_name`, `masked_number`, `institution_logo_url`, `due_date`, `close_date`, `status` (`open` quando `close_date` ≥ hoje, `closed` quando menor), `amount`, `amount_primary` e `currency`. O `amount` de cada item é o mesmo Total da fatura que a página da conta mostra para esse ciclo — a matemática de `projected_expenses` do summary com o `bill_id`/janela da fatura corrente, onde fatura corrente é a bill de menor `due_date` ≥ hoje.
2. No topo da resposta, `total_primary` é a soma dos `amount_primary` dos itens, `accounts_count` é o número de itens e `earliest_due_date` é o menor `due_date`.
3. Dado uma conta `credit_card` sem bills mas com `statement_close_day` e `payment_due_day`, ela entra com o ciclo calculado — `due_date` e `close_date` de `get_cycle_dates`, `amount` pela mesma janela, `status` derivado igual.
4. Uma conta `credit_card` sem bills e sem dias de ciclo, e qualquer conta encerrada, ficam fora dos itens e dos agregados.
5. Dado duas contas com o mesmo `shared_balance_group` não nulo, os itens trazem uma entrada só para o grupo e `total_primary` conta a linha uma vez — a mesma regra de `sumAccountBalances`.
6. Sem nenhuma conta `credit_card` elegível, a resposta é `200` com `items` vazio, `total_primary` `0`, `accounts_count` `0` e `earliest_due_date` `null`.

### O bloco no dashboard

7. No dashboard, o bloco `Faturas em aberto` (en: `Open bills`) mostra `total_primary` formatado na moeda primária, o subtítulo `{accounts_count} cartões · vence {earliest_due_date em dd MMM}` (en: `{count} cards · due {date}`), e uma linha por item com `account_name`, a máscara `•••• {masked_number}` quando existe, `vence {dd MMM}` e o `amount` na moeda da conta. Clicar numa linha navega para `/accounts/{account_id}`.
8. Com `items` vazio, o bloco não aparece.
9. Enquanto a resposta carrega, o bloco mostra skeletons, no padrão dos blocos vizinhos.
10. O bloco ignora o seletor de mês do dashboard — mudar o mês não muda faturas em aberto, que são sempre o estado de hoje.
11. Com o filtro de contas do dashboard ativo, itens de contas fora do filtro saem das linhas e os três agregados exibidos são recalculados só com as contas visíveis.

## Out of scope

- Registrar ou detectar pagamento de fatura — o bloco lê o compromisso, não o quita.
- "A entrar", "Comprometido" e "Saldo previsto" do hero do dinzo — são outro bloco, com outra conta a fazer.
- Notificações ou lembrete de vencimento.
- Mudar o tooltip de patrimônio existente — continua somando saldos como hoje.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen bloco Faturas em aberto | empty state | 8 |
| screen bloco Faturas em aberto | loading state | 9 |
| screen bloco Faturas em aberto | error state | existing - os blocos do dashboard não têm painel de erro; a query falha e o bloco não aparece, pelo mesmo caminho do critério 8 |
| screen bloco Faturas em aberto | unauthorised state | existing - rota protegida e `current_workspace` |
| screen bloco Faturas em aberto | density and ordering | 1, 7 - uma linha por cartão, em ordem crescente de vencimento |
| screen bloco Faturas em aberto | destructive action confirms | n/a - clicar só navega |
| API `GET /api/dashboard/credit-card-bills` | response shape | 1, 2, 6 |
| API `GET /api/dashboard/credit-card-bills` | error shape and codes | existing - sem parâmetro de caminho, os códigos são os das rotas de dashboard de hoje |
| API `GET /api/dashboard/credit-card-bills` | who may call it | existing - `current_workspace`, como as demais rotas de `app/api/dashboard.py` |
| API `GET /api/dashboard/credit-card-bills` | versioning | n/a - rota nova, sem consumidor externo |
| API `GET /api/dashboard/credit-card-bills` | rate limit | n/a - sem limite novo |
| command | — | n/a - nenhum comando |
| document | — | n/a - nenhum documento |
| collection itens do bloco | grouping criterion | 1, 5 - uma entrada por cartão, uma por `shared_balance_group` |
| collection itens do bloco | naming | 7 |
| collection itens do bloco | ordering | 1 |
| collection itens do bloco | duplicates | 5 |
| collection itens do bloco | exception that does not fit | 4 - cartão sem bill e sem dias de ciclo não tem fatura corrente definível e fica fora |

## Swept

- validation: n/a - sem entrada de usuário; a rota não tem parâmetros
- failure modes: 4, 6 - conta sem fatura definível sai; carteira sem cartões devolve vazio em vez de erro
- idempotency and retry: n/a - leitura pura
- authorization: existing - `current_workspace` em todas as rotas de dashboard
- concurrency and ordering: n/a - nenhuma escrita
- data lifecycle: n/a - nada persistido
- external-dependency failure: existing - a leitura usa bills e transações que o sync já gravou; a Pluggy não é chamada
- state transitions: n/a - `status` é derivado de datas a cada leitura
- observability: existing - a rota nova entra no log de requisições que toda rota já tem

## Impact

| Front | What changes |
|---|---|
| domain | new term: `fatura corrente` - para uma conta `credit_card`, a bill de menor `due_date` ≥ hoje ou, sem bills, o ciclo calculado por `get_cycle_dates`; é a fatura que o bloco e a página da conta mostram por default. |
| domain | existing term: `shared_balance_group` continua a chave que impede uma linha de crédito consolidada de contar duas vezes — o critério 5 estende a mesma regra de `sumAccountBalances` às faturas. Não passa a significar outra coisa. |
| stored data | nada a migrar - agregação calculada na leitura |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Rota de agregação própria no dashboard | `GET /api/dashboard/credit-card-bills` → `{"items": [{"account_id", "account_name", "masked_number", "institution_logo_url", "due_date", "close_date", "status", "amount", "amount_primary", "currency"}], "total_primary", "accounts_count", "earliest_due_date"}`. Leitura por `current_workspace`, ao lado das rotas de `app/api/dashboard.py`. | Engordar `DashboardSummary` — acopla o bloco ao ciclo de cache do summary e obriga todo consumidor do summary a pagar a agregação. Agregar no cliente com N chamadas de `bills` + `summary` por cartão — N×2 requisições na primeira dobra do dashboard e a regra de dedup reimplementada fora do backend que a define. |

## Surface

| Route | In | Out | Status | Criteria |
|---|---|---|---|---|
| `GET /api/dashboard/credit-card-bills` | — | `items[]`, `total_primary`, `accounts_count`, `earliest_due_date` | `200` | 1, 2, 3, 4, 5, 6 |

## Sources

- Pedido neste chat: planejar os quatro blocos dos prints do dinzo; este é o bloco "Faturas em aberto" do dashboard. "vamos planejar todos, podemos quebrar o plano em mais partes" decide o corte em tarefas separadas.
- `.tasks/assets/dinzo/dashboard.png` - **binding para a estrutura do bloco**, não para a identidade visual. O que o print decide: "Faturas em aberto — 7 cartões · vence 6 out — R$ 5.949,66", agregado com vencimento mais próximo e total.
- `.tasks/fatura-composicao-e-status.md` - derivação de aberta/fechada por data de fechamento, reusada no `status` dos itens.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | open | Quando a bill mais nova de um cartão venceu (`due_date` < hoje) e não há bill futura, o bloco mostra essa fatura vencida ou o ciclo em curso que está acumulando? | Os critérios 1 e 3 usam o ciclo em curso — sem detecção de pagamento, mostrar a vencida acusaria dívida já quitada na maioria dos casos. O badge de atraso da página da conta continua cobrindo o caso vencido. |
