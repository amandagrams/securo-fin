# Marcar transação como recorrente

Profile: `light` (nenhuma declaração em AGENTS.md ou equivalente; default). A feature tem copy
e arranjo de campos no diálogo; sob `light` espaçamento, cor e peso ficam de fora da verificação.
O que se prova é presença, ordem, rótulo e o efeito de salvar.

Sources:

- Pedido desta tarefa — única fonte: 17 critérios, portas (regra = `RecurringTransaction`,
  vínculo = `transactions.recurring_transaction_id`, um único `POST`) e o fora de escopo.
  A questão aberta da transferência já está decidida: transferência fica de fora.

## Out of scope

Herdado da task, sem acréscimos: as duas pernas da transferência; editar frequência a partir da
transação já vinculada; `weekend_adjustment` no diálogo (fica `none`); incluir em upcoming-bills;
mudar `generate_pending`; copiar payee/notes/splits; entidade nova "fixa"; alterar `uq_recurring_tx`;
trava nova para dois POST concorrentes; o `POST /api/invoices/{id}/make-recurring`.

## Landing

Toca: rota nova em `api/transactions.py`, serviço ao lado de recurring em `transaction_service`
(reusa `_advance_date` de `recurring_transaction_service`), `transaction-dialog.tsx`, o save da
lista (`transactions.tsx`, e os outros donos do mesmo diálogo para o checkbox não salvar no vazio),
`api.ts`, locales. Reusa: badge `transactions.recurringBadge` que a lista já desenha quando o FK
está preenchido, `current_writable_workspace`, `viewer_auth_headers`, a projeção
`GET /api/dashboard/projected-transactions`. O teste `i18n.test.ts` exige toda chave nova de
`en.json` nos 15 locales.

| One-way door (decidida na task) | Literal shape | Alternative rejected |
| --- | --- | --- |
| Sem tabela nova | a regra é uma linha de `recurring_transactions`; o vínculo é `transactions.recurring_transaction_id` | tabela ou entidade "fixa" |
| Um request só | `POST /api/transactions/{transaction_id}/make-recurring` cria a `RecurringTransaction` e grava o FK no mesmo commit; `201` `TransactionRead` com `recurring_transaction_id` | `POST /api/recurring-transactions` e depois um PATCH do FK |
| Transferência de fora | `transfer_pair_id` preenchido → checkbox ausente e `400` `A transfer cannot be marked recurring` | marcar uma perna como recorrente |
| Próxima ocorrência | `next_occurrence` = `_advance_date` a partir da data da transação (a transação já é a primeira); `day_of_month` gravado só quando o body manda | duplicar a aritmética do dia 31, ou gerar outra transação na mesma data |
| Ajuste de fim de semana | `weekend_adjustment` gravado `none`; o diálogo não pergunta | expor o seletor que a tela de recorrentes já tem |

- Nada mais aqui é difícil de reverter.

## Checks

Proofs backend rodam de `backend/` (`uv run pytest tests/...`); frontend de `frontend/`
(`npx vitest run ...`). Critério da task entre parênteses.

### S1 - Quem pode virar recorrente · diálogo + lista

**C1** (1) - Transação sem `recurring_transaction_id`, sem `transfer_pair_id`, sem
`installment_number` e sem `installment_series_id`: no diálogo de criação e no de edição
(conta `checking`, `savings` ou `credit_card`; `source` `manual` ou `sync`) o checkbox
`Make recurring` / `Tornar recorrente` aparece desmarcado. A lista não mostra o badge
`Recurring` / `Recorrente`
Proof: `npx vitest run src/pages/transactions-make-recurring.test.tsx -t "shows an unchecked Make recurring checkbox and no Recurring badge"`

**C2** (2) - Cartão sincronizado (`connection_id` preenchido, `source` `sync`), valor `49.90`,
data `2026-10-07`, `status` `posted`, `bill_id` preenchido: `POST` `frequency=monthly` → `201`
`TransactionRead` cujo `recurring_transaction_id` aponta para a recorrência criada; `date`,
`amount`, `status`, `source` e `bill_id` são os de antes do save
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_synced_credit_card_links_without_changing_posted_fields`

**C3** (2) - O usuário marca o checkbox com monthly e salva: a lista mostra o badge `Recurring`.
Reabrir o diálogo mostra `This transaction is linked to a recurring bill.` e o botão `Unlink`
Proof: `npx vitest run src/pages/transactions-make-recurring.test.tsx -t "links a synced credit card charge and shows the Recurring badge"`

**C4** (3) - Diálogo de criação manual com o checkbox marcado e monthly: ao salvar, a transação
criada tem `recurring_transaction_id` e a lista mostra o badge `Recurring`
Proof: `npx vitest run src/pages/transactions-make-recurring.test.tsx -t "creates a manual transaction already linked and shows the Recurring badge"`

### S2 - A regra copiada e a próxima data

**C5** (4) - A `RecurringTransaction` criada copia `description`, `amount`, `currency`, `type`,
`account_id` e `category_id`. `start_date` é a `date` da transação. `frequency` é a escolhida.
`end_date` é `null` quando o body não manda, e a data escolhida quando manda. `auto_generate`
`true`, `is_active` `true`, `weekend_adjustment` `none`. `GET /api/recurring-transactions`
devolve essa linha
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_rule_copies_the_transaction_and_is_listed`

**C6** (5) - Data `2026-10-07`, `frequency` `weekly`: `next_occurrence` `2026-10-14`,
`day_of_month` `null`
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_weekly_next_occurrence_is_seven_days_later`

**C7** (6) - Data `2026-10-07`, valor `49.90`, `monthly`, dia do mês vazio: `next_occurrence`
`2026-11-07`, `day_of_month` `null`. Continua existindo uma transação nessa conta com essa
descrição na data `2026-10-07`. `GET /api/dashboard/projected-transactions?account_id={id}&from=2026-10-01&to=2026-11-30`
inclui item com esse `recurring_id`, `date` `2026-11-07`, a descrição e `amount` `49.90`, e não
inclui `2026-10-07` para esse `recurring_id`
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_monthly_without_day_projects_only_the_next_month`

**C8** (7) - Data `2026-10-07`, `monthly`, `day_of_month` `15`: `next_occurrence` `2026-11-15`,
`day_of_month` `15`
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_monthly_day_15_lands_on_the_fifteenth`

**C9** (8) - Data `2026-01-31`, `monthly`, `day_of_month` `31`: `next_occurrence` `2026-02-28`,
`day_of_month` `31`
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_monthly_day_31_clamps_to_february_28`

**C10** (9) - Data `2026-10-07`, `quarterly`, dia vazio: `next_occurrence` `2027-01-07`
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_quarterly_without_day_advances_three_months`

### S3 - Campos do diálogo

**C11** (10) - Com o checkbox marcado aparecem `Frequency` / `Frequência` (ordem: Monthly,
Quarterly, Semiannual, Weekly, Biweekly, Yearly; pt-BR: Mensal, Trimestral, A cada 6 meses,
Semanal, A cada 2 semanas, Anual), `Day of month` / `Dia do mês` só quando a frequency é
`monthly`, `quarterly`, `semiannual` ou `yearly`, e `End date (optional)` / `Data de fim (opcional)`.
Em `weekly` e `biweekly` o dia do mês não aparece. Dia `15` em monthly vai no save como
`day_of_month` `15`; em weekly o save não manda `day_of_month`
Proof: `npx vitest run src/pages/transactions-make-recurring.test.tsx -t "shows frequency day of month and optional end date when make recurring is checked"`

### S4 - Recusas

**C12** (11) - Transação que já tem `recurring_transaction_id`: `POST` → `400` `detail`
`Transaction is already linked to a recurring bill`. A contagem de `RecurringTransaction` dessa
`description` e `start_date` continua 1, mesmo se o segundo body pedir outra frequency
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_already_linked_is_400_and_count_stays_one`

**C13** (11) - A mesma transação não mostra o checkbox
Proof: `npx vitest run src/pages/transactions-make-recurring.test.tsx -t "hides Make recurring when the transaction is already linked"`

**C14** (12) - `transfer_pair_id` preenchido: `POST` → `400` `detail` `A transfer cannot be marked recurring`. Não cria `RecurringTransaction`
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_transfer_cannot_be_marked_recurring`

**C15** (12) - A mesma transação não mostra o checkbox
Proof: `npx vitest run src/pages/transactions-make-recurring.test.tsx -t "hides Make recurring on a transfer"`

**C16** (13) - `installment_number` ou `installment_series_id` (um de cada): `POST` → `400`
`detail` `An installment cannot be marked recurring`. Não cria
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_installment_cannot_be_marked_recurring`

**C17** (13) - Os dois casos não mostram o checkbox
Proof: `npx vitest run src/pages/transactions-make-recurring.test.tsx -t "hides Make recurring on an installment"`

**C18** (14) - `frequency` fora de `weekly|biweekly|monthly|quarterly|semiannual|yearly`, ou
`day_of_month` fora de 1–31, ou `day_of_month` numérico com `weekly` ou `biweekly`: `422` e
não cria
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_invalid_frequency_or_day_is_422_and_creates_nothing`

**C19** (15) - Id de transação que não está neste workspace: `404` `detail` `Transaction not found`
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_transaction_absent_from_workspace_is_404`

**C20** (16) - Papel de leitura (`viewer_auth_headers` / `current_writable_workspace`): `403`
`detail` `Read-only role`. Nenhuma `RecurringTransaction` criada
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_viewer_is_403_and_creates_nothing`

**C21** (17) - Se o commit do vínculo falha depois da recorrência estar na mesma transação de
banco, não resta linha dessa tentativa em `recurring_transactions` e `recurring_transaction_id`
continua `null`
Proof: `uv run pytest tests/test_transaction_make_recurring.py::test_failed_link_leaves_no_recurring_row`

**C22** (17) - Num `400` do `POST`, o toast mostra esse `detail` e o badge `Recurring` não aparece
Proof: `npx vitest run src/pages/transactions-make-recurring.test.tsx -t "shows the 400 detail in a toast and no Recurring badge"`

## Swept

Herdado da task, mapeado para checks:

- validation: C18
- failure modes: C12, C14, C16, C21, C22
- idempotency and retry: n/a — um segundo POST na mesma transação é recusa (C12), não repetição idempotente; concorrência de dois POST não ganha trava nova (task)
- authorization: C19, C20
- concurrency and ordering: n/a — task recusa trava nova
- data lifecycle: C21
- external-dependency failure: n/a — sem chamada externa
- state transitions: C2, C12 (sem FK → com FK; com FK não volta a criar)
- observability: existing — a rota nova entra no log de requisições que toda rota já tem

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| superfícies do checkbox (criação + 3 tipos × 2 sources) | criação C1 · checking/savings/credit_card × manual/sync C1 | - |
| idiomas com copy nos critérios (2) | en C1, C3, C11 · pt-BR C1, C11 | - |
| frequencies de next_occurrence (4) | weekly C6 · monthly sem dia C7 · monthly dia 15 C8 · monthly dia 31 C9 · quarterly C10 | semiannual e yearly não têm data de exemplo na task; o diálogo as lista em C11 e a aritmética é a mesma `_advance_date` |
| `end_date` (2) | vazio → null C5 · data escolhida C5 | - |
| recusas do POST (5) | já vinculada C12 · transferência C14 · parcela C16 · 422 C18 · 404 C19 · 403 C20 | - |
| parcelas (2) | `installment_number` C16, C17 · `installment_series_id` C16, C17 | - |
| frequências com dia do mês (6) | monthly/quarterly/semiannual/yearly mostram C11 · weekly/biweekly escondem C11 | - |
| códigos do POST (4) | `201` C2 · `400` C12, C14, C16 · `422` C18 · `404` C19 · `403` C20 | - |

- Claims que nomeiam status code, rota ou shape de resposta: C2, C5, C6, C7, C8, C9, C10, C12,
  C14, C16, C18, C19, C20, C21 — todos provados via cliente HTTP (httpx ASGI), cruzando a fronteira,
  exceto C21, que prova o rollback na mesma rota quando o commit do vínculo falha
- Nenhum outro check afirma mais do que o caso que seu proof exercita
