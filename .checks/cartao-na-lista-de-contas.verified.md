# Cartão na lista de Contas — verified

- Verdict: **FAIL**
- Profile: light
- Diff range: `9a7cb44..29348e6`
- Round: 1
- Verifier: independent

HEAD verificado: `29348e66a9c6a066efd562852635ce02bb49d707` (`29348e6`).

Regra desta rodada: para cada check, o valor do checklist (copy, número, classe de cor) tem de estar legível na expressão da asserção. Se esse valor só aparece dentro de `i18n.t` ou de um helper chamado pela asserção, o check é FAIL. Um teste verde não substitui essa leitura.

## Proofs

Comando (os 15 nomes alternados num `-t`):

`npx vitest run src/pages/accounts-card-list.test.tsx --reporter=verbose -t "shows the used limit bar with pt-BR amounts on a manual card|labels the used limit bar in English|colors the used limit bar with the account page bands|hides the used limit bar when limit or available credit is missing|shows the open bill line in pt-BR when the close date is today or later|shows the open bill line in English when the close date is today or later|shows the closed bill line in pt-BR when the close date is past|shows the closed bill line in English when the close date is past|hides the bill state line without cycle days or dates and keeps the due badge|shows future installments in pt-BR|shows future installments in English|hides future installments for zero null or loading without a skeleton|shows limit bar bill state and future installments on manual and connected cards in that order|hides card facts on other types and on closed cards|does not show minimum payment brand or card level on the list"`

Saída: 15 passed. Cada nome abaixo apareceu com `✓`.

`npx vitest run src/locales/i18n.test.ts --reporter=verbose -t "all languages contain all keys from en.json"`

Saída: 14 passed (de, el, es, fr, hi, it, ja, nl, pl, pt-BR, pt-PT, ru, sk, uk). `en` é a fonte e não entra nesse filtro.

## Checks

| Check | Resultado | Asserção | Valor do checklist na expressão |
| --- | --- | --- | --- |
| C1 | FAIL | `frontend/src/pages/accounts-card-list.test.tsx:210` `expect(fill.style.width).toBe(barWidth(limit, available))` | A largura `((50000 − 29128.52) / 50000) × 100` não está nessa expressão. `50000` e `29128.52` estão nas consts das linhas 190–191; a conta está em `usedPct` / `barWidth` (linhas 121–128), helpers chamados pela asserção. `Limite usado` está em `:203` `expect(within(link).getByText('Limite usado')).toBeTruthy()`. `R$ 20.871,48 de R$ 50.000,00` está em `:206` `expect(compact(amounts?.textContent)).toBe(compact('R$ 20.871,48 de R$ 50.000,00'))`. `bg-blue-500` está em `:211` `expect(fill.classList.contains('bg-blue-500')).toBe(true)`. O check falha pela largura. |
| C2 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:228` `expect(within(link).getByText('Limit used')).toBeTruthy()` | `Limit used` está no `expect`. |
| C3 | FAIL | `frontend/src/pages/accounts-card-list.test.tsx:255` `expect(fill.classList.contains(band.color)).toBe(true)` | `bg-emerald-500`, `bg-blue-500`, `bg-amber-400` e `bg-rose-500` não estão nessa expressão. Estão no array `bands` (`color: 'bg-emerald-500'` e as outras, linhas 233–240). A mesma indireção vale para `:254` `expect(utilizationColor(pct)).toBe(band.color)`. A largura em `:256` `expect(fill.style.width).toBe(\`${Math.min(100, Math.max(0, pct))}%\`)` usa `pct` de `usedPct` (linha 252). Os cortes `20`, `29.99`, `30`, `69.99`, `70`, `89.99`, `90` e `100` não aparecem no `expect`. |
| C4 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:300` `expect(availableRow).toContain('Limite disponível')` | `Limite disponível` está no `expect`. `Available credit` está em `:309` `expect(limitRow).not.toContain('Available credit')`. `Limite usado` está em `:298`, `:306` e `:318` `queryByText('Limite usado')`. O número `100` está em `:301` `expect(compact(availableRow)).toContain(compact(formatCurrency(100, 'BRL', 'pt-BR')))`. Os saldos `11`, `42` e `7` estão em `:302`, `:310` e `:314` como argumentos de `formatCurrency`. A ausência da barra está em `:297`, `:305`, `:313` e `:317` `queryByRole('progressbar')`. |
| C5 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:344` `expect(within(future).getByText('fatura aberta · fecha em 15 out · vence em 22 out').textContent).toBe('fatura aberta · fecha em 15 out · vence em 22 out')` | Essa copy está no `expect`. `Vence em 14 dias` está em `:345` `expect(within(future).getByText('Vence em 14 dias')).toBeTruthy()`. A de hoje está em `:348` `expect(within(today).getByText('fatura aberta · fecha em 08 out · vence em 20 out').textContent).toBe('fatura aberta · fecha em 08 out · vence em 20 out')`. |
| C6 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:375` `expect(within(future).getByText('open bill · closes 15 Oct · due 22 Oct').textContent).toBe('open bill · closes 15 Oct · due 22 Oct')` | Essa copy está no `expect`. `Due in 14 days` está em `:376`. A de hoje está em `:379` `expect(within(today).getByText('open bill · closes 08 Oct · due 20 Oct').textContent).toBe('open bill · closes 08 Oct · due 20 Oct')`. |
| C7 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:397` `expect(line.textContent).toBe('fatura fechada · vence em 18 out')` | Essa copy está no `expect`. A data de fechamento fora da linha está em `:398` `expect(line.textContent).not.toContain('07 out')`. `Vence em 10 dias` está em `:399` `expect(within(link).getByText('Vence em 10 dias')).toBeTruthy()`. |
| C8 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:418` `expect(line.textContent).toBe('closed bill · due 18 Oct')` | Essa copy está no `expect`. `:419` `expect(line.textContent).not.toContain('07 Oct')`. `Due in 10 days` está em `:420` `expect(within(link).getByText('Due in 10 days')).toBeTruthy()`. |
| C9 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:468` `expect(within(link).queryByText(/fatura aberta\|fatura fechada\|listBillOpen\|listBillClosed/)).toBeNull()` | `fatura aberta` e `fatura fechada` estão no `expect`. O badge está em `:470` e `:471` `expect(within(missingCloseDay).getByText('Vence em 10 dias')).toBeTruthy()` e o equivalente de `missingDueDay`. |
| C10 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:484` `expect(compact(line.textContent)).toBe(compact('R$ 12.840,72 em parcelas futuras entram nas próximas faturas'))` | Essa copy está no `expect`, como argumento. O número `12840.72` também está em `:483` `expect(line.textContent).toBe(futureLine(12840.72))`. |
| C11 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:499` `expect(compact(line.textContent)).toBe(compact('R$ 12,840.72 in future installments hit upcoming bills'))` | Essa copy está no `expect`, como argumento. O número `12840.72` também está em `:498` `expect(line.textContent).toBe(futureLine(12840.72))`. |
| C12 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:515` `expect(within(link).queryByText(/parcelas futuras\|future installments\|futureInstallments/)).toBeNull()` | `parcelas futuras` e `future installments` estão no `expect`. A mesma expressão está em `:524`. `.animate-pulse` está em `:525` `expect(link.querySelector('.animate-pulse')).toBeNull()`. |
| C13 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:559` `within(link).getByText('fatura aberta · fecha em 15 out · vence em 22 out')` e `:561` `expect(bar.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()` | A copy da fatura aberta está na busca que a asserção de ordem usa. A linha de parcelas está em `:560` `within(link).getByText(/em parcelas futuras entram nas próximas faturas/)` e em `:562` `expect(state.compareDocumentPosition(future) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()`. O href está em `:556` `expect(link).toHaveAttribute('href', \`/accounts/${id}\`)`. A ausência de outro link está em `:564` `expect(screen.queryByRole('link', { name: /ver fatura\|view bill/i })).toBeNull()`. |
| C14 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:600` `expect(screen.queryByText('Limite usado')).toBeNull()` | `Limite usado` está no `expect`. A fatura está em `:601` `expect(screen.queryByText(/fatura aberta\|fatura fechada/)).toBeNull()`. `parcelas futuras` está em `:602`. `upcomingBills` está em `:598` `expect(api.accounts.upcomingBills).not.toHaveBeenCalled()`. O cartão encerrado está em `:596` `expect(await screen.findByText('Cartão encerrado')).toBeTruthy()`. |
| C15 | PASS | `frontend/src/pages/accounts-card-list.test.tsx:620` `expect(screen.queryByText('Visa Infinite X')).toBeNull()` | `Visa Infinite X` está no `expect`. `Ultraviolet` está em `:621` `expect(screen.queryByText('Ultraviolet')).toBeNull()`. `150.5` está em `:622` `expect(screen.queryByText('150.5')).toBeNull()` e em `:623` `expect(compact(document.body.textContent)).not.toContain(compact(formatCurrency(150.5, 'BRL', 'pt-BR')))`. |

Paridade de chaves (cobertura do checklist, fora de C1–C15): PASS. `frontend/src/locales/i18n.test.ts:147` `expect(missing, \`Keys missing in ${locale}:\`).toEqual([])`. As cinco chaves estão em `frontend/src/locales/en.json:1206-1210` (`limitUsed`, `limitUsedOf`, `listBillOpen`, `listBillClosed`, `futureInstallments`); o teste lê `en.json` e falha se alguma chave faltar nos outros locales. Os 14 casos passaram.

## Gate

FAIL. 13 de 15 checks passam. C1 e C3 falham: a largura de C1 só sai de `barWidth(limit, available)`, e as classes de C3 (`bg-emerald-500`, `bg-blue-500`, `bg-amber-400`, `bg-rose-500`) e os cortes `20` … `100` ficam em `band.color` / `usedPct`, fora da expressão do `expect`. Os 15 testes nomeados passaram no vitest, e a paridade `all languages contain all keys from en.json` passou. O gate desta rodada é o valor do checklist legível na asserção.
