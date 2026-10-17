# Categorias do mês: saídas, entradas e o caminho até as regras

> Build this with **tlc-implement** (`.cursor/skills/tlc-implement/SKILL.md`).
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

A página `/categories` é um catálogo: grupos, ícone, cor, ocultar e apagar. Não diz quanto saiu nem quanto entrou em cada categoria no mês. Quem quer isso abre o dashboard, e o dashboard só parte as saídas (`GET /api/dashboard/spending-by-category`) — uma entrada categorizada, um salário, um estorno, não tem card em lugar nenhum. O print do dinzo é essa página: o mês, as saídas e as entradas, e o botão das regras ao lado de criar categoria.

A categorização automática já existe e já não distingue conta de cartão. No sync, `apply_rules_to_transaction` roda em toda transação nova (`connection_service`, nos dois pontos em que a transação é gravada) e a categoria do provedor só entra se nenhuma regra preencheu `category_id`. Uma regra "UBER → Transporte" pega o débito da conta corrente e o débito do cartão pelo mesmo caminho. Esta tarefa não reconstrói esse motor.

Em `/categories`, acima do catálogo que já está lá, o mês selecionado mostra as saídas e as entradas por categoria, nos mesmos filtros e na mesma data de reporte que o dashboard já usa para o cartão. "Regras automáticas" abre `/rules`. Referência de estrutura: `.tasks/assets/dinzo/categorias.png`.

14 critérios em 3 fatias · 1 porta sem volta · 0 abertas

## Criteria

### Totais do mês

1. Dado outubro de 2026 com estes lançamentos posted, moeda primária `BRL`, categoria Alimentação e categoria Salário: débito `100.00` na conta corrente em `2026-10-05` Alimentação; débito `40.00` no cartão em `2026-10-12` Alimentação, sem `effective_bill_date`; débito `25.00` pending no cartão em `2026-10-12` Alimentação; débito `10.00` em `2026-10-08` com `category_id` nulo; crédito `80.00` em `2026-10-03` Salário; crédito `200.00` em `2026-10-10` com `transfer_pair_id` preenchido; débito `500.00` em `2026-10-10` com `transfer_pair_id` preenchido. Quando se chama `GET /api/dashboard/category-flows?month=2026-10-01`, a resposta é `200`, `outflows` traz Alimentação `140.00` e o item de `category_id` nulo `10.00`, e `inflows` traz Salário `80.00`. O pending e os dois lançamentos com par não aparecem em nenhuma das listas. O `total` de Alimentação é o mesmo `total` que `GET /api/dashboard/spending-by-category?month=2026-10-01` devolve para essa categoria.
2. Dado um débito de cartão `100.00` posted em Alimentação comprado em `2026-03-30` com data de reporte da fatura `2026-04-16` (o mesmo arranjo de `effective_date` que `test_category_breakdown_follows_mode`): com o modo de contabilidade `cash`, março traz Alimentação `100.00` nas saídas e abril não traz essa categoria; com `accrual`, abril traz Alimentação `100.00` e março não traz. Em cada modo o valor é o mesmo `total` de `spending-by-category` para aquele mês.
3. Uma categoria oculta (`is_hidden`) com débito posted no mês entra em `outflows` com o valor dela. Uma conta encerrada não contribui.
4. Quando o mês não tem lançamento que `counts_as_user_pnl` aceite, a resposta é `200` com `outflows` e `inflows` vazios.
5. Na resposta do critério 1, a ordem dentro de cada lista é `total` decrescente. `percentage` é o `total` do item sobre a soma da lista, arredondado a 2 casas: Alimentação `93.33`, o item sem categoria `6.67`, Salário `100.00`.

### A página

6. Em `/categories`, com o mês em outubro de 2026 e os lançamentos do critério 1, a seção `Saídas por categoria` (en: `Outflows by category`) mostra Alimentação `R$ 140,00` e depois `Sem categoria` `R$ 10,00`. A seção `Entradas por categoria` (en: `Inflows by category`) mostra Salário `R$ 80,00`. Em en os títulos dos cards sem categoria e das seções são `Uncategorized`, `Outflows by category` e `Inflows by category`, e o valor segue o formato da moeda primária nesse idioma. O catálogo de grupos que a página já renderiza continua abaixo das duas seções.
7. O mês inicial é o mês corrente. Ao avançar o controle para o mês seguinte, os valores de outubro deixam de aparecer e passam a ser os daquele mês. Ao voltar, outubro volta com `R$ 140,00` em Alimentação.
8. Com a busca `ali`, as saídas mostram só Alimentação e as entradas não mostram Salário. A busca compara o nome da categoria, sem distinguir maiúsculas. Com a busca vazia, as duas seções voltam ao critério 6. Com a busca `zzz`, as duas seções mostram `Nenhuma categoria encontrada` (en: `No category found`) e não mostram os textos do critério 9.
9. Com `outflows` e `inflows` vazios, as seções permanecem e dizem `Nenhuma saída neste mês` e `Nenhuma entrada neste mês` (en: `No outflows this month`, `No inflows this month`).
10. Enquanto a resposta de `category-flows` do mês recém-selecionado não chegou, as duas seções mostram skeletons e não mostram o valor do mês anterior.
11. Clicar no card de Alimentação nas saídas navega para `/transactions?category_id={id}&from=2026-10-01&to=2026-10-31&type=debit`. Clicar em `Sem categoria` navega com `uncategorized=1` e `type=debit`, sem `category_id`. Clicar em Salário nas entradas navega com o `category_id` de Salário, o mesmo `from` e `to`, e `type=credit`.

### Regras automáticas

12. Em `/categories` há um controle `Regras automáticas` (en: `Automatic rules`) que navega para `/rules`. O controle aparece com `canWrite` verdadeiro ou falso.
13. Com `canWrite` verdadeiro, `Nova categoria` abre o diálogo de criação que a página já tem. Com `canWrite` falso, esse botão não aparece.
14. Dado uma regra ativa cuja condição é `description contains UBER` e cuja ação é `set_category` Transporte, quando o sync grava um débito de conta corrente com descrição `UBER * TRIP` e um débito de cartão com a mesma descrição, os dois ficam com a categoria Transporte. Isso vale com `use_provider_categories` ligado e a Pluggy mandando outra categoria: a regra preenche `category_id` e o fallback do provedor não o troca. Uma regra cuja condição é o `account_id` da conta corrente não categoriza o débito do cartão.

## Out of scope

- Reescrever o motor de regras, acrescentar campo ou ação, ou passar a ignorar uma condição de `account_id`. O critério 14 trava o comportamento que o sync já tem.
- Subcategoria como entidade nova. O modelo é grupo contendo categorias; o clique do card abre a lista de transações, que já filtra por `category_id`, `uncategorized`, `from`, `to` e `type`.
- O minigráfico do card no print. O print não diz se a série é o dia do mês ou os meses anteriores.
- O desfoque e o "desbloqueie" do print. Não há plano pago nesta tela.
- Mudar `GET /api/dashboard/spending-by-category` nem o gráfico do dashboard. As saídas desta página repetem o `total` dele; não entram no `projected_total`.
- Projeção de recorrência e lançamento pending no card. Os dois ficam de fora, como o `total` do dashboard.
- Filtro de contas do dashboard nesta página. O mês é o workspace inteiro.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/categories`, seções do mês | empty state | 8, 9 |
| screen `/categories`, seções do mês | loading state | 10 |
| screen `/categories`, seções do mês | error state | existing - a página de categorias não tem painel de erro; a query falha e as seções não mostram valor |
| screen `/categories`, seções do mês | unauthorised state | existing - rota protegida e `current_workspace` |
| screen `/categories`, seções do mês | density and ordering | 5, 6 |
| screen `/categories`, seções do mês | destructive action confirms | n/a - o card só navega; apagar categoria continua no catálogo, com a confirmação que já tem |
| API `GET /api/dashboard/category-flows` | response shape | 1, 4, 5 |
| API `GET /api/dashboard/category-flows` | error shape and codes | existing - `month` inválido é o `422` que o FastAPI já devolve nas rotas de dashboard com `date` |
| API `GET /api/dashboard/category-flows` | who may call it | existing - `current_workspace`, como `spending-by-category` |
| API `GET /api/dashboard/category-flows` | versioning | n/a - rota nova, sem consumidor externo |
| API `GET /api/dashboard/category-flows` | rate limit | n/a - sem limite novo |
| command | — | n/a - nenhum comando |
| document | — | n/a - nenhum documento |
| collection cards do mês | grouping criterion | 1 - um item por categoria, mais um item para `category_id` nulo |
| collection cards do mês | naming | 6 |
| collection cards do mês | ordering | 5 |
| collection cards do mês | duplicates | 1 - a mesma categoria em conta e cartão é um card só |
| collection cards do mês | exception that does not fit | 1 - pending, par de transferência e conta encerrada ficam fora |

## Swept

- validation: existing - `month` segue o parse de `date` das outras rotas de dashboard
- failure modes: 4 - mês sem movimento devolve listas vazias, não erro
- idempotency and retry: n/a - leitura pura; a regra do critério 14 já é aplicada uma vez na gravação do sync, e aplicar de novo não troca a categoria que a regra pôs
- authorization: existing - `current_workspace` na rota nova e na de regras
- concurrency and ordering: n/a - nenhuma escrita nova; duas leituras simultâneas devolvem o mesmo cálculo
- data lifecycle: n/a - nada persistido de novo; a categoria da regra continua em `transactions.category_id`
- external-dependency failure: 14 - com o provedor mandando outra categoria, a regra ganha; a leitura de `category-flows` não chama a Pluggy
- state transitions: n/a - nenhum ciclo de vida novo
- observability: existing - a rota nova entra no log de requisições que toda rota já tem

## Impact

| Front | What changes |
|---|---|
| domain | existing term: `total` de `SpendingByCategory` continua o posted que o gráfico do dashboard soma. As saídas desta página repetem esse número por categoria e não passam a incluir `projected_total`. Quem ramifica nele hoje não é tocado. |
| domain | existing term: a data de reporte do cartão continua `reporting_date_col(accounting_mode)`, com `effective_bill_date` na frente. O critério 2 é essa data, não uma terceira. O dashboard e os relatórios ramificam nela. |
| stored data | nada a migrar - agregação calculada na leitura, nenhuma tabela nova |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Rota de fluxos ao lado do dashboard, sem mexer na lista de gastos | `GET /api/dashboard/category-flows?month` → `{"outflows": [{"category_id", "category_name", "category_icon", "category_color", "total", "percentage"}], "inflows": [mesmo formato]}`. `month` opcional, default o mês corrente, o mesmo `Query` de `spending-by-category`. Leitura por `current_workspace`. O `total` de cada saída é o `total` posted daquela categoria em `get_spending_by_category`; a entrada usa os mesmos filtros com `type` `credit`. | Acrescentar as entradas em `GET /api/dashboard/spending-by-category` — o gráfico do dashboard consome essa lista como gasto, e uma entrada passaria a renderizar como saída. |

## Surface

| Route | In | Out | Status | Criteria |
|---|---|---|---|---|
| `GET /api/dashboard/category-flows` | `month` | `outflows[]`, `inflows[]` (`category_id`, `category_name`, `category_icon`, `category_color`, `total`, `percentage`) | `200`; `422` em `month` inválido | 1, 2, 3, 4, 5 |

## Sources

- Pedido neste chat: "vamos tbm planejar as categorias, e regras para transações, categorias aplicadas de forma automática, tanto para transações de conta e cartão de crédito."
- `.tasks/assets/dinzo/categorias.png` - **binding para a estrutura da página**, não para a identidade visual. O que o print decide: mês no título, busca, `Regras automáticas` e `Nova categoria`, seção `Saídas por categoria` em cards com ícone, nome e valor, seção `Entradas por categoria`. O minigráfico e o "desbloqueie" não entram, pelos motivos em Out of scope.
- `backend/app/services/connection_service.py` - o sync chama `apply_rules_to_transaction` e só então, se `category_id` ainda é nulo, aplica a categoria do provedor. Sem filtro por `account.type`.
- `backend/tests/test_credit_card_accounting_mode.py` - `test_category_breakdown_follows_mode` é a fonte do critério 2.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | | None | |
