Verdict: PASS
Profile: light
Diff range: 9a7cb44..da706b1
Round: 2 - scoped
Verifier: independent

HEAD `da706b1cc94642c0190e2db2fa64eb0aac2814a5` (`da706b1`). Proofs deste HEAD (um vitest com os 15 nomes alternados num `-t`, mais o teste de paridade). Exit 0. Um proof verde antigo não entra.

Round 1 (`29348e6`) marcou C1 e C3 como FAIL: a largura `((50000 − 29128.52) / 50000) × 100` estava em `barWidth`, e as classes `bg-emerald-500`, `bg-blue-500`, `bg-amber-400`, `bg-rose-500` com os cortes `20`, `29.99`, `30`, `69.99`, `70`, `89.99`, `90`, `100` estavam em `band.color` / `usedPct`. `da706b1` põe esses literais na expressão do `expect`. C1 e C3 foram lidos de novo neste arquivo. C2 e C4–C15 são carried from round 1: `da706b1` não altera o corpo desses `it`.

## Proofs

`cd frontend && npx vitest run src/pages/accounts-card-list.test.tsx --reporter=verbose -t "shows the used limit bar with pt-BR amounts on a manual card|labels the used limit bar in English|colors the used limit bar with the account page bands|hides the used limit bar when limit or available credit is missing|shows the open bill line in pt-BR when the close date is today or later|shows the open bill line in English when the close date is today or later|shows the closed bill line in pt-BR when the close date is past|shows the closed bill line in English when the close date is past|hides the bill state line without cycle days or dates and keeps the due badge|shows future installments in pt-BR|shows future installments in English|hides future installments for zero null or loading without a skeleton|shows limit bar bill state and future installments on manual and connected cards in that order|hides card facts on other types and on closed cards|does not show minimum payment brand or card level on the list"`

Saída: 15 passed. Cada nome abaixo apareceu com `✓`.

`cd frontend && npx vitest run src/locales/i18n.test.ts --reporter=verbose -t "all languages contain all keys from en.json"`

Saída: 14 passed (de, el, es, fr, hi, it, ja, nl, pl, pt-BR, pt-PT, ru, sk, uk). `en` é a fonte e não entra nesse filtro.

## Checks

15/15 PASS.

**C1** — PASS. Evidência nova. A largura `((50000 - 29128.52) / 50000) * 100` e a classe `bg-blue-500` estão na expressão do `expect`:

- `frontend/src/pages/accounts-card-list.test.tsx:194` — `expect(within(link).getByText('Limite usado')).toBeTruthy()`
- `frontend/src/pages/accounts-card-list.test.tsx:196` — `expect(amounts?.textContent).toBe(limitLine(20871.48, limit))`
- `frontend/src/pages/accounts-card-list.test.tsx:197` — `expect(compact(amounts?.textContent)).toBe(compact('R$ 20.871,48 de R$ 50.000,00'))`
- `frontend/src/pages/accounts-card-list.test.tsx:200` — `` expect(fill.style.width).toBe(`${Math.min(100, Math.max(0, ((50000 - 29128.52) / 50000) * 100))}%`) ``
- `frontend/src/pages/accounts-card-list.test.tsx:201` — `expect(fill.classList.contains('bg-blue-500')).toBe(true)`
- `frontend/src/pages/accounts-card-list.test.tsx:202` — `expect(utilizationColor(((50000 - 29128.52) / 50000) * 100)).toBe('bg-blue-500')`

Proof neste HEAD: `shows the used limit bar with pt-BR amounts on a manual card` passed.

**C2** — PASS, carried from round 1. Proof neste HEAD: `labels the used limit bar in English` passed.

**C3** — PASS. Evidência nova. Cada classe e cada corte estão na expressão do `expect`, e a largura de cada faixa também:

- `frontend/src/pages/accounts-card-list.test.tsx:236` — `expect(((100 - 80) / 100) * 100).toBe(20)`
- `frontend/src/pages/accounts-card-list.test.tsx:237` — `expect(fill20.classList.contains('bg-emerald-500')).toBe(true)`
- `frontend/src/pages/accounts-card-list.test.tsx:238` — `expect(utilizationColor(20)).toBe('bg-emerald-500')`
- `frontend/src/pages/accounts-card-list.test.tsx:239` — `expect(fill20.style.width).toBe('20%')`
- `frontend/src/pages/accounts-card-list.test.tsx:242` — `expect(((10000 - 7001) / 10000) * 100).toBeCloseTo(29.99)`
- `frontend/src/pages/accounts-card-list.test.tsx:243` — `expect(fill2999.classList.contains('bg-emerald-500')).toBe(true)`
- `frontend/src/pages/accounts-card-list.test.tsx:244` — `expect(utilizationColor(((10000 - 7001) / 10000) * 100)).toBe('bg-emerald-500')`
- `frontend/src/pages/accounts-card-list.test.tsx:245` — `` expect(fill2999.style.width).toBe(`${Math.min(100, Math.max(0, ((10000 - 7001) / 10000) * 100))}%`) ``
- `frontend/src/pages/accounts-card-list.test.tsx:248` — `expect(((100 - 70) / 100) * 100).toBe(30)`
- `frontend/src/pages/accounts-card-list.test.tsx:249` — `expect(fill30.classList.contains('bg-blue-500')).toBe(true)`
- `frontend/src/pages/accounts-card-list.test.tsx:250` — `expect(utilizationColor(30)).toBe('bg-blue-500')`
- `frontend/src/pages/accounts-card-list.test.tsx:251` — `expect(fill30.style.width).toBe('30%')`
- `frontend/src/pages/accounts-card-list.test.tsx:254` — `expect(((10000 - 3001) / 10000) * 100).toBeCloseTo(69.99)`
- `frontend/src/pages/accounts-card-list.test.tsx:255` — `expect(fill6999.classList.contains('bg-blue-500')).toBe(true)`
- `frontend/src/pages/accounts-card-list.test.tsx:256` — `expect(utilizationColor(((10000 - 3001) / 10000) * 100)).toBe('bg-blue-500')`
- `frontend/src/pages/accounts-card-list.test.tsx:257` — `` expect(fill6999.style.width).toBe(`${Math.min(100, Math.max(0, ((10000 - 3001) / 10000) * 100))}%`) ``
- `frontend/src/pages/accounts-card-list.test.tsx:260` — `expect(((100 - 30) / 100) * 100).toBe(70)`
- `frontend/src/pages/accounts-card-list.test.tsx:261` — `expect(fill70.classList.contains('bg-amber-400')).toBe(true)`
- `frontend/src/pages/accounts-card-list.test.tsx:262` — `expect(utilizationColor(70)).toBe('bg-amber-400')`
- `frontend/src/pages/accounts-card-list.test.tsx:263` — `expect(fill70.style.width).toBe('70%')`
- `frontend/src/pages/accounts-card-list.test.tsx:266` — `expect(((10000 - 1001) / 10000) * 100).toBeCloseTo(89.99)`
- `frontend/src/pages/accounts-card-list.test.tsx:267` — `expect(fill8999.classList.contains('bg-amber-400')).toBe(true)`
- `frontend/src/pages/accounts-card-list.test.tsx:268` — `expect(utilizationColor(((10000 - 1001) / 10000) * 100)).toBe('bg-amber-400')`
- `frontend/src/pages/accounts-card-list.test.tsx:269` — `` expect(fill8999.style.width).toBe(`${Math.min(100, Math.max(0, ((10000 - 1001) / 10000) * 100))}%`) ``
- `frontend/src/pages/accounts-card-list.test.tsx:272` — `expect(((100 - 10) / 100) * 100).toBe(90)`
- `frontend/src/pages/accounts-card-list.test.tsx:273` — `expect(fill90.classList.contains('bg-rose-500')).toBe(true)`
- `frontend/src/pages/accounts-card-list.test.tsx:274` — `expect(utilizationColor(90)).toBe('bg-rose-500')`
- `frontend/src/pages/accounts-card-list.test.tsx:275` — `expect(fill90.style.width).toBe('90%')`
- `frontend/src/pages/accounts-card-list.test.tsx:278` — `expect(((100 - 0) / 100) * 100).toBe(100)`
- `frontend/src/pages/accounts-card-list.test.tsx:279` — `expect(fill100.classList.contains('bg-rose-500')).toBe(true)`
- `frontend/src/pages/accounts-card-list.test.tsx:280` — `expect(utilizationColor(100)).toBe('bg-rose-500')`
- `frontend/src/pages/accounts-card-list.test.tsx:281` — `expect(fill100.style.width).toBe('100%')`

Proof neste HEAD: `colors the used limit bar with the account page bands` passed.

**C4** — PASS, carried from round 1. Proof neste HEAD: `hides the used limit bar when limit or available credit is missing` passed.

**C5** — PASS, carried from round 1. Proof neste HEAD: `shows the open bill line in pt-BR when the close date is today or later` passed.

**C6** — PASS, carried from round 1. Proof neste HEAD: `shows the open bill line in English when the close date is today or later` passed.

**C7** — PASS, carried from round 1. Proof neste HEAD: `shows the closed bill line in pt-BR when the close date is past` passed.

**C8** — PASS, carried from round 1. Proof neste HEAD: `shows the closed bill line in English when the close date is past` passed.

**C9** — PASS, carried from round 1. Proof neste HEAD: `hides the bill state line without cycle days or dates and keeps the due badge` passed.

**C10** — PASS, carried from round 1. Proof neste HEAD: `shows future installments in pt-BR` passed.

**C11** — PASS, carried from round 1. Proof neste HEAD: `shows future installments in English` passed.

**C12** — PASS, carried from round 1. Proof neste HEAD: `hides future installments for zero null or loading without a skeleton` passed.

**C13** — PASS, carried from round 1. Proof neste HEAD: `shows limit bar bill state and future installments on manual and connected cards in that order` passed.

**C14** — PASS, carried from round 1. Proof neste HEAD: `hides card facts on other types and on closed cards` passed.

**C15** — PASS, carried from round 1. Proof neste HEAD: `does not show minimum payment brand or card level on the list` passed.

Paridade de chaves (cobertura do checklist, fora de C1–C15): PASS, carried from round 1. Proof neste HEAD: `all languages contain all keys from en.json` passou nos 14 locales. `frontend/src/locales/i18n.test.ts:147` `expect(missing, \`Keys missing in ${locale}:\`).toEqual([])`. As cinco chaves continuam em `frontend/src/locales/en.json:1206-1210` (`limitUsed`, `limitUsedOf`, `listBillOpen`, `listBillClosed`, `futureInstallments`).

## Gate

PASS. 15/15 checks passam. C1 e C3, que falharam no round 1, agora têm a largura e a classe legíveis na expressão do `expect`. Nada fica em FAIL.
