# Fatura do cartão por cartão

Profile: `light` (nenhuma declaração em AGENTS.md ou equivalente; default). Nota ao usuário: a
feature tem duas telas com copy e arranjo específicos nos critérios — o profile `ui` cobriria
espaçamento/cor/peso por tela; sob `light` isso fica de fora da verificação.

Sources:

- `.tasks/fatura-por-cartao.md` - única fonte, é o registro de decisão: 24 critérios, 4 portas,
  escopo e a questão aberta #1 (que não bloqueia: critérios 13, 19 e 24 valem para o
  `CreditCardSettingsDialog`, já existente em `account-detail.tsx`).

## Out of scope

Herdado da task, sem acréscimos: papel do cartão; cadastrar cartão nunca visto; limite/fatura/
vencimento por cartão; fundir contas; novo fetch à Pluggy; coluna no CSV de export; máscara fora
da página da conta; mudar regra do Total/limite/vencimento.

## Landing

Toca: `Transaction` (propriedade derivada de `raw_data`), `TransactionRead`, modelo+migração
`account_cards`, rotas em `api/accounts.py` (padrão de `get_account_bills`), e no frontend a
página `account-detail.tsx` (lista da fatura + `CreditCardSettingsDialog`), `api.ts`, `types`,
locales. Reusa: `counts_on_bill` como espelho do filtro de subtotal, `formatAccountMask`,
`current_workspace`/`current_writable_workspace`, fixtures `viewer_auth_headers` e o padrão de
workspace alheio de `test_collections_api.py`. O teste de paridade `i18n.test.ts` exige toda
chave nova em `en.json` presente nos 17 locales.

| One-way door (decidida na task) | Literal shape | Alternative rejected |
| --- | --- | --- |
| `card_number` na leitura | `TransactionRead.card_number: str \| null` derivado de `raw_data.creditCardMetadata.cardNumber`; ausente/`null`/`""` → `null`; texto sem truncar | ler como inteiro - perde o zero de `0597` |
| Tabela `account_cards` | `id, user_id fk, workspace_id fk cascade, account_id fk cascade, card_number varchar(19) not null, name varchar(255) null, created_at, updated_at` + `uq_account_cards_account_card_number (account_id, card_number)`; migração `097` revisa `096` | coluna `card_name` em `transactions` - renomear vira UPDATE em massa |
| Um nome por cartão por conta | unicidade `(account_id, card_number)`; `PUT` é upsert; último a gravar vence | unicidade por `(workspace_id, card_number)` - bancos distintos repetem 4 dígitos |
| Rotas aninhadas na conta | `GET /api/accounts/{id}/cards` → `[{card_number, name}]`; `PUT .../cards/{card_number}` `{"name"}` → `{card_number, name}`; escrita `current_writable_workspace`, leitura `current_workspace` | `PATCH /api/accounts/{id}` com mapa - mistura edição da conta com a dos cartões |

| Critério 11: lançamentos além do `limit` (build) | na conta `credit_card`, a query da lista busca as páginas seguintes até `items.length === total` e concatena; contas não-cartão mantêm a busca única de hoje | subir o cap `le=500` de `GET /api/transactions` - muda o custo máximo da rota para todo consumidor e só empurra o problema até o próximo cap |
| Gravação dos nomes no `CreditCardSettingsDialog` (build) | um input por cartão listado pelo `GET /cards`; o submit do formulário grava as configurações e depois um `PUT .../cards/{n}` por nome efetivamente alterado (strings iguais não geram chamada) | salvar a cada blur de input - um toast e uma invalidação por tecla de foco perdido, e o cancelamento do dialog deixaria metade gravada |

- Nada mais aqui é difícil de reverter.

## Checks

Proofs backend rodam de `backend/` (`pytest tests/...`); frontend de `frontend/`
(`npx vitest run ...`). Critério da task entre parênteses.

### S1 - Identidade do cartão · 6 files · 194 KB · ~48k

**C1** (1) - Lançamento com `raw_data.creditCardMetadata.cardNumber` `0597` devolve `card_number`
`"0597"` (string, zero preservado) em `GET /api/transactions` e em `GET /api/transactions/{id}`
Proof: `pytest tests/test_transaction_card_number.py::test_card_number_from_raw_data_in_list_and_detail`

**C2** (2) - `creditCardMetadata` ausente, `null`, `cardNumber` ausente ou `""` → `card_number`
`null` nas duas leituras (parametrizado sobre os 4 casos)
Proof: `pytest tests/test_transaction_card_number.py::test_card_number_null_variants`

**C3** (3) - Na página de conta `credit_card`, a linha do lançamento com `card_number` `0597`
mostra `•••• 0597` na tabela desktop
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "shows the card mask on desktop bill rows"`

**C4** (3) - A mesma linha mostra `•••• 0597` na lista mobile
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "shows the card mask on mobile bill rows"`

**C5** (4) - Lançamento com `card_number` `null` não mostra máscara de cartão na linha
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "renders no mask when card_number is null"`

**C6** (5) - Conta cujo `type` não é `credit_card` não mostra máscara nem grupos de cartão
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "non credit card account shows no mask and no groups"`

### S2 - Fatura por cartão · 5 files · 145 KB · ~36k

**C7** (6) - Com a fatura do critério 6 em pt-BR, os grupos e subtotais são `•••• 1234` =
`100.00`, `•••• 0597` = `30.00`, `Sem cartão` = `5.00`, e a soma `135.00` é o Total da fatura
na tela (pending entra; crédito fora de `treat_as_transfer` subtrai)
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "groups the bill by card with subtotals that sum to the bill total in pt-BR"`

**C8** (6) - Em en, o título do terceiro grupo é `No card`
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "titles the no-card group in English"`

**C9** (6) - O lançamento `is_ignored` e o pagamento com `transfer_pair_id` continuam na lista,
dentro do grupo do seu `card_number` ou em `Sem cartão`, e fora dos subtotais
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "keeps ignored and paired rows in the list but out of the subtotals"`

**C10** (7) - Ordem dos grupos: `card_number` igual a `account.masked_number` primeiro, demais em
ordem lexicográfica crescente, `Sem cartão` por último; linhas dentro do grupo na ordem relativa
que a lista já usa
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "orders groups with the account card first then lexicographic then no card"`

**C11** (7) - Com `masked_number` `null`, a ordem começa direto pelos `card_number`
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "starts at lexicographic order when masked_number is null"`

**C12** (8) - Com zero ou um balde (um único `card_number`, ou só lançamentos sem cartão) a
quebra por cartão não aparece e a lista segue como hoje
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "renders a flat list when the bill has zero or one bucket"`

**C13** (8) - Lista vazia mantém `Nenhuma transação para esta conta` em pt-BR e
`No transactions for this account` em en
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "keeps the existing empty state copy in both languages"`

**C14** (9) - Lançamento ligado à fatura A com `card_number` `0597` não entra em grupo nenhum
quando a página mostra a fatura B
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "does not leak another bill's rows into the visible bill's groups"`

**C15** (10) - Enquanto a lista carrega, a quebra por cartão não aparece e a lista mostra os 5
skeletons que já mostra
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "shows the five skeletons and no groups while loading"`

**C16** (11) - Com 500 débitos `1.00` `1234` e 1 débito `1.00` `0597` na mesma fatura, os
subtotais são `500.00` e `1.00` e o Total da fatura é `501.00` — o `limit` 500 não derruba o
lançamento que passa dele
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "subtotals cover rows beyond the 500 row page limit"`

**C17** (12) - Conta `USD` com primária `BRL`: seletor na moeda da conta → subtotais `10.00` e
`5.00` em USD somando o Total; seletor na primária → subtotais em BRL cuja soma é o Total
mostrado
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "subtotals follow the foreign currency toggle and still sum to the shown total"`

### S3 - Nome do cartão · 10 files · ~400 KB · ~99k

**C18** (13) - `GET /api/accounts/{id}/cards` → `200`, um item por `card_number` distinto nos
lançamentos da conta (`1234`, `0597`), cada um com `name`, na ordem do critério 7; lançamentos
sem `card_number` não geram item
Proof: `pytest tests/test_account_cards_api.py::test_list_cards_distinct_ordered_with_names`

**C19** (14) - `PUT .../cards/0597` `{"name": "Amanda"}` → `200` com `card_number` `0597` e
`name` `Amanda`
Proof: `pytest tests/test_account_cards_api.py::test_put_card_name_returns_saved_name`

**C20** (14) - Com o nome gravado, o título do grupo na fatura mostra `Amanda •••• 0597`; as
linhas dentro do grupo continuam mostrando só `•••• 0597`
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "shows the card name in the group title but not on the rows"`

**C21** (15) - `PUT` com `{"name": ""}` ou `{"name": "   "}` → `200` com `name` `null`, e o item
segue no `GET` com `name` `null`
Proof: `pytest tests/test_account_cards_api.py::test_put_blank_name_clears_to_null`

**C22** (15) - Com `name` `null`, o título do grupo volta a `•••• 0597`
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "falls back to the mask when the card has no name"`

**C23** (16) - `name` com 256 caracteres → `422` e nada gravado; `"  Amanda  "` grava e devolve
`Amanda`
Proof: `pytest tests/test_account_cards_api.py::test_put_name_length_and_trim`

**C24** (17) - `PUT` com `card_number` que não aparece em lançamento nenhum da conta → `404` e
nada gravado
Proof: `pytest tests/test_account_cards_api.py::test_put_unknown_card_number_404`

**C25** (18) - Conta de outro workspace: `GET` → `404` e `PUT` → `404`
Proof: `pytest tests/test_account_cards_api.py::test_other_workspace_404`

**C26** (19) - Membro `viewer`: `PUT` → `403` e nada gravado; `GET` → `200`
Proof: `pytest tests/test_account_cards_api.py::test_viewer_put_403_get_200`

**C27** (19) - A página não oferece o campo de nome quando `canWrite` é falso
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "hides the name fields without write permission"`

**C28** (20) - O mesmo `PUT` `{"name": "Amanda"}` duas vezes → dois `200` com `Amanda` e
exatamente uma linha em `account_cards` para `(account_id, card_number)`
Proof: `pytest tests/test_account_cards_api.py::test_put_is_idempotent_single_row`

**C29** (21) - Dois `PUT` simultâneos (`Amanda`, `Bruno`) → nenhum `500`, exatamente uma linha,
`name` é um dos dois
Proof: `pytest tests/test_account_cards_api.py::test_concurrent_puts_no_500_single_row`

**C30** (22) - Apagar a conta remove as linhas de `account_cards` daquela conta
Proof: `pytest tests/test_account_cards_api.py::test_account_delete_removes_cards`

**C31** (22) - `card_number` que some dos lançamentos conserva a linha, e o nome reaparece
quando o cartão volta à fatura
Proof: `pytest tests/test_account_cards_api.py::test_name_survives_card_absence`

**C32** (23) - Uma sincronização não altera nem apaga nome: com `account_cards` semeado, o
caminho de upsert de transações do sync deixa a linha intacta, e nenhum caminho do sync escreve
em `account_cards`
Proof: `pytest tests/test_account_cards_api.py::test_sync_does_not_touch_account_cards`

**C33** (24) - Enquanto a lista de cartões carrega na tela de cadastro, nenhum campo de nome
aparece
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "shows no name fields while the card list loads"`

**C34** (24) - Conta sem `card_number` nos lançamentos: a tela diz que nenhum cartão foi visto
ainda, em vez de lista vazia
Proof: `npx vitest run src/pages/account-detail-cards.test.tsx -t "says no card was seen yet when the account has none"`

## Swept

Herdado da task, mapeado para checks:

- validation: C2, C23
- failure modes: C7-C9, C24
- idempotency and retry: C28
- authorization: C25, C26, C27
- concurrency and ordering: C29
- data lifecycle: C30, C31
- external-dependency failure: C32
- state transitions: n/a - um nome existe ou não existe (task)
- observability: existing - rotas novas entram no log de requisições que toda rota já tem (task)

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| variantes nulas de `card_number` (4) | metadata ausente · metadata `null` · `cardNumber` ausente · `cardNumber` `""` — todas em C2, parametrizado | - |
| fatura do critério 6 (6 lançamentos) | débito 100 `1234` C7 · débito 40 `0597` C7 · crédito 10 `0597` C7 · débito 25 `is_ignored` C9 · crédito 80 `transfer_pair_id` C9 · débito 5 pending sem cartão C7 | - |
| ordem dos grupos (4 regras) | masked primeiro C10 · lexicográfica C10 · `Sem cartão` último C10 · masked `null` C11 | - |
| baldes do critério 8 (3) | zero baldes C12 · um balde C12 · ≥2 baldes C7 | - |
| códigos do `PUT` (5) | `200` C19 · `422` C23 · `404` cartão desconhecido C24 · `404` outro workspace C25 · `403` viewer C26 | - |
| códigos do `GET /cards` (3) | `200` C18 · `404` outro workspace C25 · `200` viewer C26 | - |
| idiomas com copy nos critérios (2) | pt-BR C7, C13 · en C8, C13 | - |

- Claims que nomeiam status code, rota ou shape de resposta: C1, C2, C18, C19, C21, C23, C24,
  C25, C26, C28, C29 - todos provados via cliente HTTP (httpx ASGI), cruzando a fronteira
- Nenhum outro check afirma mais do que o caso que seu proof exercita

## Handoff

Aritmética (wc -c ÷ 4; locales `en.json`/`pt-BR.json` contados como ~2 KB de leitura dirigida,
não os 260 KB do arquivo — são JSON de dados editados por inserção pontual):

- S1 = 194 KB ≈ 48k (models/schemas de transaction, account-detail.tsx, mobile-row, types)
- S2 = 145 KB ≈ 36k (mesma superfície frontend de S1) — acumulado 84k
- S3 = ~400 KB ≈ 99k (entra na superfície backend: api/accounts, account_service,
  connection_service p/ C32, migração, api.ts) — acumulado 183k > 150k

**Hand off após S2**: batch 1 = S1+S2 (84k, toda a superfície frontend da fatura é compartilhada),
batch 2 = S3 (99k, a superfície muda para o backend de contas). Fronteira coincide com a troca de
superfície.

- **Onde caiu a fronteira**: C1–C17 fechados pelo commit `894bd01` (S1+S2 completos; todos os
  proofs verdes — 5 pytest, 15 vitest, suíte frontend inteira 929 ok, tsc limpo).
- **O que o usuário decidiu no meio do build**: nada — nenhuma clarificação nem renegociação; a
  única porta nova (paginação além do limit, critério 11) ganhou linha em `Landing` e não
  contradiz nada aprovado.
- **O que foi abandonado**: nada tentado e descartado. Avisos úteis ao próximo agente que o diff
  não mostra: `uv sync --all-extras` em `backend/` é necessário antes do primeiro pytest (o venv
  não vem com dev extras); o teste `i18n.test.ts` exige toda chave nova de `en.json` em todos os
  15 locales (padrão de inserção: ver commit, chave `accounts.noCard`); `delete_account` recusa
  contas com `connection_id` — o teste de C30 precisa de conta manual; SQLite dos testes não
  aplica   `ON DELETE CASCADE`, então C30 precisa de remoção explícita em `delete_account` além da
  cascata na migração.

- **Batch 2 (S3) fechado** no commit seguinte a este handoff: C18–C34; C32 usa `TestSessionLocal`
  para verificar após `sync_connection` (a sessão do teste ficava com MissingGreenlet).
