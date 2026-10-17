# Próximas faturas: parcelas que já comprometem os ciclos futuros

> Build this with **tlc-implement** (`.cursor/skills/tlc-implement/SKILL.md`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

Parcelamentos comprometem os próximos ciclos do cartão, e a página da fatura só mostra o ciclo selecionado. Séries manuais materializam as parcelas futuras como transações `pending` (`create_installment_series` em `app/services/transaction_service.py`), mas as parcelas sincronizadas da Pluggy só existem quando chegam — o sync grava apenas a linha que a Pluggy devolve a cada mês (`app/services/connection_service.py`). Resultado: quem tem `12/36` em aberto não tem onde ver que as próximas faturas já nascem com esse peso, e descobre o compromisso fatura a fatura.

Na página da conta com `type` `credit_card`, uma seção "Próximas faturas" lista os próximos ciclos com o valor já comprometido em cada um: as linhas futuras que já existem mais as parcelas restantes de séries sincronizadas, projetadas a partir de `installment_number`/`total_installments`. Um endpoint novo calcula isso no backend, onde o ciclo e as séries são visíveis por inteiro. Referência de estrutura: `.tasks/assets/dinzo/fatura-proximas.png`.

12 critérios em 2 fatias · 1 porta sem volta · 2 abertas, nenhuma bloqueia

## Criteria

### O endpoint de ciclos futuros

1. Dado uma conta `credit_card` com `statement_close_day` e `payment_due_day` configurados, uma série sincronizada (fingerprint `account_id` + `installment_purchase_date` + `total_installments`, sem `installment_series_id`) cujas parcelas `1..4` de `10` existem como linhas — a `4` no ciclo em curso, com valor `99.00` — e um débito manual `pending` de `50.00` datado dentro do primeiro ciclo futuro: quando se chama `GET /api/accounts/{account_id}/upcoming-bills?cycles=3`, então a resposta é `200` com `cycles` de 3 itens em ordem crescente de `due_date` (as próximas ocorrências de `payment_due_day` depois do ciclo em curso), com `committed_total` `149.00`, `99.00`, `99.00` — a parcela `5` projetada cai no primeiro ciclo futuro e as seguintes uma por ciclo, cada uma com o valor da parcela existente de maior `installment_number`.
2. Na mesma conta, `future_committed_total` é `644.00` — todas as 6 parcelas restantes mais o débito manual, sem o corte do parâmetro `cycles`.
3. Dado uma série com `installment_series_id` cujas 10 parcelas já existem como linhas (o caso manual), nenhuma parcela é projetada: cada ciclo soma só as linhas existentes que `counts_on_bill` aceita — `is_ignored`, pares de transferência e créditos de categoria `treat_as_transfer` ficam de fora, como na fatura.
4. Dado uma série cuja parcela existente de maior `installment_number` tem `is_ignored`, nenhuma parcela dessa série é projetada.
5. Quando a conta não tem `statement_close_day` ou `payment_due_day`, ou o `type` não é `credit_card`, a resposta é `200` com `cycles` vazio e `future_committed_total` `null`.
6. Dado uma conta de outro workspace, a resposta é `404`.
7. `cycles` tem default `6`; fora de `1..24`, a resposta é `422`.

### A seção na página

8. Na página da conta `credit_card`, a seção `Próximas faturas` (en: `Upcoming bills`) lista cada item de `cycles` com o mês da fatura — `MMM yyyy` do `due_date`, o mesmo rótulo da régua de ciclos — e o seu `committed_total`, com a nota `estimativa com as parcelas e lançamentos já conhecidos` (en: `estimate from known installments and charges`).
9. Quando todos os `committed_total` são `0` e `future_committed_total` é `0` ou `null`, a seção não aparece.
10. Enquanto a resposta do endpoint está carregando, a seção não aparece — sem skeleton novo.
11. Numa conta cujo `type` não é `credit_card`, a seção não aparece e o endpoint não é chamado.
12. Dado uma conta em `USD` com primária `BRL`, quando o seletor de moeda está na moeda da conta os valores usam `committed_total` em `USD`; na primária, `committed_total_primary` em `BRL`.

## Out of scope

- Materializar parcelas projetadas como linhas em `transactions` — a projeção existe só na resposta e encolhe sozinha a cada sync que traz a parcela real.
- Navegar para o ciclo ao clicar num item da seção — a régua de ciclos já navega.
- Lista das parcelas dentro de cada ciclo futuro — a seção responde "quanto", não "o quê".
- Parcelas em contas que não são `credit_card`.
- Coluna nova no CSV de export.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen seção Próximas faturas | empty state | 9 |
| screen seção Próximas faturas | loading state | 10 |
| screen seção Próximas faturas | error state | existing - sem painel de erro; a seção simplesmente não aparece, como os blocos vizinhos |
| screen seção Próximas faturas | unauthorised state | existing - rota protegida e `current_workspace` |
| screen seção Próximas faturas | density and ordering | 1, 8 - um item por ciclo, em ordem crescente de `due_date` |
| screen seção Próximas faturas | destructive action confirms | n/a - nenhuma ação |
| API `GET /api/accounts/{account_id}/upcoming-bills` | response shape | 1, 2, 5 |
| API `GET /api/accounts/{account_id}/upcoming-bills` | error shape and codes | 6, 7 |
| API `GET /api/accounts/{account_id}/upcoming-bills` | who may call it | 6 - leitura por `current_workspace`, como `GET /api/accounts/{account_id}/bills` |
| API `GET /api/accounts/{account_id}/upcoming-bills` | versioning | n/a - rota nova, sem consumidor externo |
| API `GET /api/accounts/{account_id}/upcoming-bills` | rate limit | n/a - sem limite novo |
| command | — | n/a - nenhum comando |
| document | — | n/a - nenhum documento |
| collection ciclos futuros | grouping criterion | 1 - um item por ciclo de fatura |
| collection ciclos futuros | naming | 8 |
| collection ciclos futuros | ordering | 1 |
| collection ciclos futuros | duplicates | 3 - uma parcela existente nunca é projetada de novo; a projeção começa acima do maior `installment_number` que existe |
| collection ciclos futuros | exception that does not fit | 5 - conta sem dias de ciclo não tem onde bucketar e devolve vazio |

## Swept

- validation: 7
- failure modes: 5 - sem dados de ciclo, o endpoint diz "não sei" em vez de inventar janelas
- idempotency and retry: n/a - leitura pura, sem escrita; duas chamadas devolvem o mesmo cálculo
- authorization: 6
- concurrency and ordering: n/a - nenhuma escrita; um sync concorrente só muda o dado entre duas leituras, como em qualquer rota de leitura
- data lifecycle: 3 - quando o sync materializa a parcela real, a projetada deixa de existir por construção, porque a projeção parte do maior número existente
- external-dependency failure: existing - a leitura usa o que o sync já gravou; a Pluggy não é chamada
- state transitions: n/a - nada persistido muda de estado
- observability: existing - a rota nova entra no log de requisições que toda rota já tem

## Impact

| Front | What changes |
|---|---|
| domain | new term: `parcela projetada` - parcela de número maior que a última existente de uma série, com o valor dela, atribuída a um ciclo futuro; existe só na resposta do endpoint, nunca em `transactions`. |
| domain | existing term: série de parcelas continua identificada por `installment_series_id` e, nas sincronizadas sem série, pelo fingerprint (`account_id`, `installment_purchase_date`, `total_installments`) — os mesmos dois caminhos que `_get_series_transactions` e o dedup do sync já usam. Nenhum dos dois muda. |
| stored data | nada a migrar - projeção calculada na leitura, nenhuma tabela nova |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Rota de ciclos futuros aninhada na conta | `GET /api/accounts/{account_id}/upcoming-bills?cycles=6` → `{"cycles": [{"due_date", "close_date", "committed_total", "committed_total_primary", "currency"}], "future_committed_total", "future_committed_total_primary"}`. O aninhamento segue `GET /api/accounts/{account_id}/bills`. Leitura por `current_workspace`. | Calcular no cliente a partir de `GET /api/transactions` — o cliente não vê as parcelas não materializadas, e o `limit` 500 nem garante as que existem. Materializar a projeção como transações — criaria linhas que o sync depois duplica ou órfã quando a série muda no banco. |

## Surface

| Route | In | Out | Status | Criteria |
|---|---|---|---|---|
| `GET /api/accounts/{account_id}/upcoming-bills` | `account_id`, `cycles` | `cycles[]` (`due_date`, `close_date`, `committed_total`, `committed_total_primary`, `currency`), `future_committed_total`, `future_committed_total_primary` | `200`, `404`, `422` | 1, 2, 5, 6, 7 |

## Sources

- Pedido neste chat: planejar os quatro blocos dos prints do dinzo; este é o bloco "Próximas faturas". "vamos planejar todos, podemos quebrar o plano em mais partes" decide o corte em tarefas separadas.
- `.tasks/assets/dinzo/fatura-proximas.png` - **binding para a estrutura do bloco**, não para a identidade visual. O que o print decide: um card "Próximas faturas — como as parcelas pesam nos próximos meses" na página da fatura, e a nota "Quando o banco confirmar o pagamento desta fatura, ela entra aqui — nunca contas duas vezes".
- [Transaction | Pluggy Docs](https://docs.pluggy.ai/docs/transactions) - `creditCardMetadata` traz `installmentNumber`, `totalInstallments`, `totalAmount`, `purchaseDate`; a Pluggy não envia as parcelas futuras como transações.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | open | O valor da parcela projetada é o da última parcela existente (como os critérios 1 e 2 fixam) ou `installment_total_amount / total_installments`? | Os critérios usam a última parcela existente — é o que o banco cobrou por último e sobrevive a séries com primeira parcela diferente. Se a resposta mudar, só os valores dos critérios 1 e 2 mudam. |
| 2 | open | O horizonte default de 6 ciclos basta, ou a seção deve mostrar até a última parcela conhecida? | O critério 7 fixa default `6` e máximo `24`; `future_committed_total` já carrega o total sem corte, então o horizonte só limita a lista. |
