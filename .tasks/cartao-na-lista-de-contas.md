# Cartão na lista de Contas: limite usado, estado da fatura e parcelas futuras

> Build this with **tlc-implement** (`.cursor/skills/tlc-implement/SKILL.md`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.
>
> **Ordem:** depende do endpoint `GET /api/accounts/{account_id}/upcoming-bills` de
> `.tasks/fatura-proximas-faturas.md`. Construir depois dela.

## Intent

Na lista de Contas, um cartão mostra saldo e limite disponível e nada mais (`frontend/src/pages/accounts.tsx`). O payload já carrega `credit_limit`, `next_close_date` e `next_due_date`, mas a lista não diz quanto do limite está usado, se a fatura corrente está aberta ou fechada, nem que parcelas futuras já comprometem os próximos ciclos — quem quer isso abre conta por conta. O dinzo mostra tudo no card e é onde a diferença entre os dois apps mais aparece numa olhada.

Na lista de Contas, o card de uma conta `credit_card` ganha uma barra de limite usado com percentual, uma linha de estado da fatura com fechamento e vencimento, e uma linha com o total de parcelas futuras quando existir. Referência de estrutura: `.tasks/assets/dinzo/contas-cartoes.png`.

8 critérios em 3 fatias · 0 portas sem volta · 0 abertas

## Criteria

### Limite usado

1. Dado um cartão com `credit_limit` `50000.00` e `available_credit` `29128.52`, o card na lista mostra a barra `Limite usado` (en: `Limit used`) preenchida na proporção `(credit_limit − available_credit) / credit_limit` com o texto `R$ 20.871,48 de R$ 50.000,00` em pt-BR, usando as mesmas faixas de cor da página da conta — verde abaixo de 30%, azul de 30%, âmbar de 70%, rosa de 90%.
2. Quando `credit_limit` ou `available_credit` é `null`, a barra não aparece e o card fica como hoje.

### Estado da fatura

3. Dado um cartão com `next_close_date` e `next_due_date` preenchidos e `next_close_date` ≥ hoje, o card mostra `fatura aberta · fecha em {data} · vence em {data}` (en: `open bill · closes {date} · due {date}`), com as datas em `dd MMM` no idioma da UI.
4. Com `next_close_date` < hoje, o card mostra `fatura fechada · vence em {data}` (en: `closed bill · due {date}`).
5. Quando `statement_close_day` ou `payment_due_day` falta, a linha de estado não aparece; o badge de urgência de vencimento que a lista já mostra permanece como está nos dois casos.

### Parcelas futuras

6. Dado um cartão cujo `GET /api/accounts/{account_id}/upcoming-bills` devolve `future_committed_total` `12840.72`, o card mostra `R$ 12.840,72 em parcelas futuras entram nas próximas faturas` (en: `R$ 12,840.72 in future installments hit upcoming bills`).
7. Quando `future_committed_total` é `0` ou `null`, ou a resposta ainda está carregando, a linha não aparece — sem skeleton novo.
8. Tudo acima aparece nas contas conectadas e nas manuais — os dois caminhos de render da lista — e nunca em contas de outro `type` nem nas encerradas.

## Out of scope

- Quebra por pessoa no card ("Você R$ 3.765,80 · Thati R$ 1.360,40" do dinzo) — depende dos nomes de cartão de `.tasks/fatura-por-cartao.md`; é um passo seguinte, não este.
- Link "ver fatura e entenda o valor" como elemento próprio — o card inteiro já navega para a página da conta.
- Substituir o badge de urgência de vencimento existente — a linha de estado convive com ele.
- Mostrar `minimum_payment`, `card_brand` ou `card_level` na lista.
- Qualquer mudança no endpoint `upcoming-bills` — o contrato é o de `.tasks/fatura-proximas-faturas.md`.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen card do cartão na lista de Contas | empty state | 2, 5, 7 - cada elemento some sem o seu dado; o card nunca mostra traço nem zero inventado |
| screen card do cartão na lista de Contas | loading state | 7 - a linha de parcelas espera o dado; barra e estado vêm do payload da lista, que já tem skeleton |
| screen card do cartão na lista de Contas | error state | existing - a lista não tem painel de erro por card; a falha do endpoint deixa a linha de parcelas ausente, pelo critério 7 |
| screen card do cartão na lista de Contas | unauthorised state | existing - rota protegida e `current_workspace` |
| screen card do cartão na lista de Contas | density and ordering | 1, 3, 6 - barra, estado e parcelas, nessa ordem, dentro do card existente |
| screen card do cartão na lista de Contas | destructive action confirms | n/a - nenhuma ação nova; o card continua só navegando |
| API | — | n/a - nenhuma rota nova ou alterada; consome `upcoming-bills` como está |
| command | — | n/a - nenhum comando |
| document | — | n/a - nenhum documento |
| collection | — | n/a - nenhuma coleção nova; a lista de contas mantém agrupamento e ordem de hoje |

## Swept

- validation: n/a - nenhuma entrada de usuário
- failure modes: 7 - endpoint indisponível degrada para a linha ausente, nunca para um número errado
- idempotency and retry: n/a - leitura pura
- authorization: existing - `current_workspace` nas rotas que a lista já chama
- concurrency and ordering: n/a - nenhuma escrita
- data lifecycle: n/a - nada persistido
- external-dependency failure: existing - `available_credit` e `next_*` já degradam para `null` quando o provedor não manda, e os critérios 2 e 5 cobrem o render disso
- state transitions: n/a - aberta/fechada é derivado de datas a cada render
- observability: existing - sem rota nem job novo

## Impact

| Front | What changes |
|---|---|
| domain | nothing - nenhum termo novo; `fatura aberta`/`fechada` segue a derivação já fixada em `.tasks/fatura-composicao-e-status.md`, agora a partir de `next_close_date` que a lista já recebe |
| stored data | nada a migrar - só leitura de campos existentes |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| None | — | Nada aqui é sem volta: UI sobre campos que o payload já carrega e sobre um contrato decidido em `.tasks/fatura-proximas-faturas.md`. Uma chamada `upcoming-bills` por cartão visível é reversível se virar gargalo. |

## Sources

- Pedido neste chat: planejar os quatro blocos dos prints do dinzo; este é o card do cartão na lista de Contas. "vamos planejar todos, podemos quebrar o plano em mais partes" decide o corte em tarefas separadas.
- `.tasks/assets/dinzo/contas-cartoes.png` - **binding para a estrutura do card**, não para a identidade visual. O que o print decide: "fatura aberta · vence 5 nov · fecha em 29 dias", barra `Limite usado` com `R$ 20.871,38 de R$ 50.000`, e "Parcelas futuras R$ 12.840,72 já consomem o limite e entram nas próximas faturas".
- `.tasks/fatura-proximas-faturas.md` - contrato de `upcoming-bills` e semântica de `future_committed_total`.
- `.tasks/fatura-composicao-e-status.md` - derivação de fatura aberta/fechada, repetida aqui sobre `next_close_date`.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | | None | |
