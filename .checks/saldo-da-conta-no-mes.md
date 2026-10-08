# Saldo da conta em cada dia do mês

Profile: `light` (nenhuma declaração em AGENTS.md ou equivalente; default). Nota ao usuário: o
critério 15 pede copy específica (`Saldo real` / `Saldo previsto` / `Conta que paga a fatura`);
sob `light` espaçamento, cor e peso ficam de fora da verificação.

Sources:

- A tarefa desta leva é a única fonte: 15 critérios, a porta `payment_account_id`, o termo
  `actual_balance` e o que fica de fora. Não há `.tasks/` correspondente.

## Out of scope

Herdado da tarefa, sem acréscimos: gravar a fatura como lançamento na checking; abrir o cartão
ao clicar a linha; projetar gasto por histórico; recorrência dispensável; ligar invoices/boleto
a uma conta (fica de fora dos dois saldos); o calendário filtrado no próprio cartão continua
sendo a movimentação do cartão; savings não recebe fatura; `is_ignored` continua fora dos dois
saldos. Não reescrever `account-detail.tsx` fora do seletor no diálogo de configurações do
cartão. Sem Playwright.

## Landing

Toca: modelo `Account` + migração nova (revisa `097`, não reescreve as antigas), schema
create/update/read, `account_service` create/update, `delete_account` (SET NULL explícito: o
SQLite dos testes não aplica a FK), sync em `connection_service` (os dois `Account(...)` nascem
com null e o update do sync não mexe no campo), `transaction_calendar_service` +
`TransactionCalendarResponse`, e no frontend o diálogo de criar conta em `accounts.tsx`, o
`CreditCardSettingsDialog` dentro de `account-detail.tsx`, `transaction-calendar-view`, `api.ts`,
`types` e locales. Reusa: `compute_effective_date`, `fx_convert` / `get_rate`, `_balance_at`,
`_get_forecast_transactions`, a grade de domingo que o calendário já monta, e o padrão de
workspace alheio de `test_account_cards_api.py`. O teste de paridade `i18n.test.ts` exige toda
chave nova de `en.json` nos 15 locales.

| One-way door (decidida na task) | Literal shape | Alternative rejected |
| --- | --- | --- |
| Coluna `payment_account_id` | `accounts.payment_account_id` UUID NULL, FK `accounts.id` ON DELETE SET NULL; só `type=credit_card` pode preenchê-la; alvo é `type=checking`, aberto, mesmo workspace; sem backfill | coluna na tabela de faturas — a conta que paga é da conta, não de um vencimento |
| POST de cartão novo | `payment_account_id` obrigatório: omitido, ou alvo do workspace que não é checking aberta → 422 e nenhuma conta nova; alvo de outro workspace (ou id inexistente, mesmo código: não está neste workspace) → 404 e nada gravado | 400 via `ValueError` — a porta pede 422/404 |
| Cartão que já existe | null é válido, inclusive o que o sync criou; PATCH grava a Conta ou null; sync na criação grava null e no update não inventa nem apaga vínculo | sync adivinhar a checking do mesmo banco — a task proíbe inventar vínculo |
| `actual_balance` | campo de `TransactionCalendarResponse`, um número: posted até hoje, moeda primária, do escopo. Pendente, futuro, recorrência e fatura não entram | saldo por dia — a task põe o real na resposta, e o previsto em `ending_balance` |
| `ending_balance` | o saldo previsto: a caminhada que o calendário já faz (posted na data, pendente e futuro na data, recorrência na ocorrência), mais a fatura do cartão ligado no vencimento, uma vez, pelo total. Célula, gráfico e painel continuam lendo essa série | série nova no gráfico — a task manda a série que já existe passar a ser o previsto |
| Sem `account_id` | a soma fica nas checking abertas. Cartão (mesmo invertido) e savings saem. A fatura ainda cai na checking de `payment_account_id` | continuar somando todo tipo aberto — a task tira cartão e poupança |
| Fatura sem linha em `credit_card_bills` | total do ciclo = lançamentos não ignorados do cartão cujo `compute_effective_date(data, fechamento, vencimento)` é D; `opening_balance` e `is_ignored` (transação ou categoria) ficam de fora. Dias de ciclo ausentes: não há projeção | usar `effective_date` gravado — o listener default iguala à data da compra e derrubaria a Conta no dia da compra |
| Fatura com linha | `credit_card_bills.total_amount` daquele `due_date`, uma vez; os lançamentos do ciclo não somam por cima | somar a linha e os lançamentos — a task diz que a linha é o total |
| Pagamento no vencimento | transferência na Conta no dia D cujo par está no cartão substitui a linha da fatura; o dia fica com a transferência e sem um segundo item | somar os dois — o critério 9 proíbe 500 no lugar de 750 |
| Vencida | `due_date` hoje ou anterior não entra em `actual_balance` nem move `ending_balance` futuro, e não é empurrada para hoje | jogar o vencido para hoje |
| Semente | vencimento futuro anterior ao começo da grade entra no saldo de abertura e nenhum dia lista o item | reimprimir a linha num mês que já passou do vencimento |
| Moeda da linha | `amount` e `currency` na moeda da fatura/cartão; `amount_primary` e o delta do `ending_balance` via `fx_convert(..., allow_fetch=False)`, para a leitura não disparar fetch. Sem taxa gravada, `get_rate` devolve 1 | converter o `actual_balance` pela fatura — a fatura não entra no real |
| Onde a linha cai | `account_id` da checking de `payment_account_id`, `description` o nome do cartão (`display_name` ou `name`), `id` null, `recurring_id` null, `kind=projected`, `type=debit` quando o total é positivo. Não cai na conta selecionada no filtro, nem no próprio cartão, nem em savings | derrubar na conta do filtro |

- Nada mais aqui é difícil de reverter.

## Checks

Proofs backend rodam de `backend/` (`uv run pytest tests/...`); frontend de `frontend/`
(`npx vitest run ... -t`). Critério da task entre parênteses.

### S1 - Conta corrente do cartão · ~8 files · ~120 KB · ~30k

**C1** (1) - Existe checking `Conta`. POST `/api/accounts` de cartão sem `payment_account_id` →
422 e a lista de contas não ganha conta nova
Proof: `uv run pytest tests/test_payment_account_api.py::test_create_credit_card_requires_payment_account -q`

**C2** (2) - Cartão criado com `payment_account_id` da `Conta` → 201 e o GET seguinte devolve
esse id
Proof: `uv run pytest tests/test_payment_account_api.py::test_create_credit_card_returns_payment_account -q`

**C3** (3) - `payment_account_id` de savings, de outro credit_card ou de checking fechada, no
mesmo workspace → 422 em cada um e o cartão não é gravado
Proof: `uv run pytest tests/test_payment_account_api.py::test_invalid_payment_account_in_workspace_is_422 -q`

**C4** (3) - `payment_account_id` de conta de outro workspace → 404 e o cartão não é gravado
Proof: `uv run pytest tests/test_payment_account_api.py::test_payment_account_in_other_workspace_is_404 -q`

**C5** (4) - Cartão que já existe, e um que o sync acabou de criar, nascem com
`payment_account_id` null. PATCH com a `Conta` grava e o GET devolve. PATCH `null` limpa e o
GET devolve null. Um segundo sync não preenche nem apaga o vínculo
Proof: `uv run pytest tests/test_payment_account_api.py::test_patch_payment_account_on_existing_and_synced_card -q`

**C6** (4) - Enquanto o cartão está com `payment_account_id` null, o calendário da `Conta` não
muda por causa dele: `actual_balance` e todo `ending_balance` ficam no saldo posted da `Conta`,
sem item do cartão
Proof: `uv run pytest tests/test_payment_account_api.py::test_null_payment_account_does_not_move_checking_calendar -q`

**C7** (4) - Apagar a checking não apaga o cartão; `payment_account_id` fica null
Proof: `uv run pytest tests/test_payment_account_api.py::test_delete_checking_nulls_payment_account_keeps_card -q`

### S2 - Saldo real e previsto · ~3 files · ~90 KB · ~22k

**C8** (5) - `Conta` com saldo real 1000.00 BRL e mais nada posted. Três dias futuros
consecutivos T, C, X no mês pedido: débito pending 80.00 `Mercado` em T, crédito posted 200.00
`Salário` em C, transferência pending 40.00 em X da `Conta` para outra checking.
`GET /api/transactions/calendar?month=<mês de T>&account_id=<Conta>`: `actual_balance` 1000.00.
Todo dia da grade anterior a T tem `ending_balance` 1000.00; de T até o dia anterior a C,
920.00; de C até o dia anterior a X, 1120.00; de X em diante, 1080.00. T lista `Mercado`
`kind=projected`, id da transação, `type=debit`, `amount` 80.00. C lista `Salário`
`kind=projected`, id, `type=credit`, `amount` 200.00. X lista a transferência com
`is_transfer` verdadeiro e o saldo cai 40.00, não 80.00. Nenhum dos três muda `actual_balance`
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_projected_walk_pending_future_posted_and_transfer -q`

**C9** (6) - Saldo real 1000. Recorrência débito 300.00 `Aluguel` num dia futuro R. Três débitos
posted 30.00 em datas passadas, já dentro dos 1000, sem recorrência. `actual_balance` continua
1000. `ending_balance` 700 de R em diante. Dia futuro sem transação repete o `ending_balance`
do dia anterior. Os três 30 aparecem na data deles com `kind=actual` quando a data está na
grade, e não geram um quarto débito no futuro
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_recurring_projects_once_and_past_posted_stay_actual -q`

**C10** (7) - Saldo real 1000 BRL. Cartão `Nubank` com `payment_account_id` da `Conta`,
fechamento e vencimento preenchidos, débito 250.00 no cartão dentro do ciclo cujo vencimento D
é amanhã ou depois e cai no mês pedido. Sem linha em `credit_card_bills` e sem pagamento
agendado na `Conta`. Um débito `is_ignored` no mesmo ciclo não entra. `actual_balance` 1000.
Dias antes de D: ending 1000. D e posteriores: 750. D tem item `kind=projected`, `id` null,
`recurring_id` null, `type=debit`, `amount` 250.00, `currency` BRL, `description` Nubank,
`account_id` da `Conta`, `projected_expense` 250.00, `projected_count` 1. O débito do cartão
não aparece na `Conta` na data da compra
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_card_cycle_drops_checking_on_due_date_once -q`

**C11** (8) - `credit_card_bills` desse cartão com `due_date` D e `total_amount` 400.00, e o
débito 250 do mesmo ciclo: D derruba a `Conta` em 400 uma vez. A linha é o total; os
lançamentos do ciclo não somam por cima
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_bill_row_total_replaces_cycle_sum -q`

**C12** (9) - Transferência pending 250 na `Conta` no dia D, com par no `Nubank`: ending de D
em diante é 750, não 500. O dia tem a transferência e não tem um segundo item de 250 pela fatura
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_payment_transfer_on_due_date_suppresses_bill_line -q`

**C13** (10) - Segunda checking `Outra` com saldo real 1000: calendário da `Outra` fica
`actual_balance` 1000 e `ending_balance` 1000 todos os dias. A fatura só sai da conta de
`payment_account_id`
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_bill_does_not_leave_the_other_checking -q`

**C14** (11) - Mês seguinte, grade começa depois de D: nenhum dia lista o item da fatura.
`actual_balance` da `Conta` 1000. Todo `ending_balance` da `Conta` nessa grade é 750. O valor
entra na semente
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_bill_before_grid_is_carried_in_the_seed -q`

**C15** (12) - Fatura com `due_date` hoje e outra anterior: `actual_balance` não muda por causa
delas e nenhum dia futuro muda `ending_balance` por causa delas. A vencida não aparece hoje
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_due_today_or_earlier_does_not_move_balances -q`

**C16** (13) - Sem `account_id`: `actual_balance` é a soma dos saldos posted das checking
abertas. O ending de cada dia é essa soma caminhada com as transações dessas contas, mais a
fatura do critério 7 derrubando 250 em D. Saldo do cartão não entra. Savings não entra. Com
`account_id` da `Conta`, vale o critério 7
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_unfiltered_sum_is_open_checking_plus_the_bill -q`

**C17** (14) - `Conta` BRL, cartão USD, `FxRate` USD→BRL rate 5 hoje, fatura 100 USD em D: o
item mostra `amount` 100, `currency` USD e `amount_primary` 500. `actual_balance` não inclui a
fatura. O ending da `Conta` cai 500 a partir de D. Sem a taxa gravada, a mesma fatura cai 100
(fallback 1:1 de `get_rate` via `fx_convert`)
Proof: `uv run pytest tests/test_calendar_account_balance.py::test_bill_converts_with_fx_convert_and_falls_back_one_to_one -q`

### S3 - A tela · ~8 files · ~80 KB de leitura dirigida · ~20k

**C18** (15) - Diálogo de criar conta, tipo cartão: o seletor `Conta que paga a fatura`
(en: `Account that pays the bill`) lista a checking pelo nome, não lista savings, e não cria
sem uma. Com uma selecionada, o POST leva o id
Proof: `npx vitest run src/pages/account-payment-account.test.tsx -t "create card dialog requires the checking account that pays the bill"`

**C19** (15) - Nas configurações de um cartão já existente, o mesmo seletor grava o PATCH com a
checking e, vazio, grava null
Proof: `npx vitest run src/pages/account-payment-account.test.tsx -t "card settings selector patches the payment account and can be cleared"`

**C20** (15) - Em `/transactions?view=calendar` com a `Conta` selecionada, a vista mostra
`Saldo real` (en: `Actual balance`) com 1000.00. Cada dia de hoje em diante mostra
`Saldo previsto` (en: `Projected balance`) com o `ending_balance` desse dia. O dia D mostra
`Nubank` e 250.00 na linha tracejada de projetado. A linha não abre transação
Proof: `npx vitest run src/components/transaction-calendar-balance.test.tsx -t "shows actual and projected balances and does not open a bill line"`

## Swept

Herdado da task, mapeado para checks:

- validation: C1, C3, C4
- failure modes: C6, C12, C13, C15
- idempotency and retry: C5 (segundo sync não mexe no vínculo; PATCH repetido devolve o mesmo id)
- authorization: C4 (workspace alheio 404; a rota continua em `current_writable_workspace` / `current_workspace`)
- concurrency and ordering: n/a — um ponteiro por cartão, última escrita vence, sem corrida nova
- data lifecycle: C7 (apagar a checking não apaga o cartão), C5 (sync não backfilla)
- external-dependency failure: C17 (sem taxa, fallback 1:1; a projeção não faz fetch)
- state transitions: C5 (null → checking → null)
- observability: existing — rotas que já logam continuam logando; nenhum evento novo

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| alvos inválidos no workspace (3) | savings C3 · outro credit_card C3 · checking fechada C3 | - |
| códigos do POST de cartão (3) | 422 sem id C1 · 201 com a Conta C2 · 422 alvo inválido C3 · 404 outro workspace C4 | - |
| o que não entra em `actual_balance` (4) | pending e futuro posted C8 · recorrência C9 · fatura C10 · vencida C15 | - |
| de onde sai a fatura (3) | sem linha, soma do ciclo C10 · com linha, o total C11 · transferência em D suprime a linha C12 | - |
| escopo sem filtro (3) | checking aberta entra C16 · cartão não entra C16 · savings não entra C16 | - |
| idiomas com copy no critério 15 (2) | pt-BR C18, C20 · en C18, C20 | - |

- Claims que nomeiam status code, rota ou shape de resposta: C1–C17 — provados via cliente
  HTTP (httpx ASGI), cruzando a fronteira
- Nenhum outro check afirma mais do que o caso que seu proof exercita

## Handoff

As três fatias fecharam neste batch. Não houve fronteira de fatia: S1, S2 e S3 estão no
mesmo commit, com proofs verdes. O usuário não decidiu nada além da tarefa. Nada foi
abandonado.

O calendário sem filtro passou a somar só checking aberta. O teste que provava que as
duas pernas de uma transferência ficam fora de receita/despesa usava uma perna em
savings; essa perna agora é checking, para as duas continuarem no escopo e o líquido
seguir zerado. A asserção não foi afrouxada.
