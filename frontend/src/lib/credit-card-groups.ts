import type { Transaction } from '@/types'
import { transactionAmountForBalance } from './account-detail-utils'

/**
 * Splitting an open credit-card bill by the card that made each charge
 * (`.checks/fatura-por-cartao.md` S2). The rows come from the bill's own
 * transaction list; the subtotal filter mirrors the backend's
 * `counts_on_bill` so the group subtotals sum to the bill total the page
 * already shows (`projected_expenses` — pending rows included).
 */

type BillRow = Pick<
  Transaction,
  'source' | 'transfer_pair_id' | 'is_ignored' | 'type' | 'category' | 'card_number'
>

/**
 * Client mirror of the backend's `counts_on_bill` SQL filter, plus the
 * `opening_balance` exclusion the callers there already apply:
 * out go paired transfers, ignored rows (transaction or category),
 * settlement debits, and credits in a `treat_as_transfer` category.
 * Debits in those categories stay — a charge doesn't stop being owed to
 * the bank because of how it was tagged afterwards. No status clause:
 * the bill total is `projected_expenses`, which counts pending rows.
 */
export function countsOnBill(tx: BillRow): boolean {
  if (tx.source === 'opening_balance') return false
  if (tx.transfer_pair_id) return false
  if (tx.is_ignored || tx.category?.is_ignored) return false
  if (tx.source === 'settlement' && tx.type === 'debit') return false
  if (tx.type === 'credit' && tx.category?.treat_as_transfer) return false
  return true
}

export interface CardGroup<T extends BillRow> {
  /** Null is the no-card bucket ("Sem cartão"). */
  cardNumber: string | null
  rows: T[]
}

/**
 * Bucket the bill's rows by `card_number`, in display order: the card equal
 * to the account's own `masked_number` first, the other cards in ascending
 * lexicographic order, the no-card bucket last. Rows keep the relative
 * order the list already uses. Returns null while there is nothing to
 * split — zero or one bucket — so the list renders flat, as today.
 */
export function groupBillByCard<T extends BillRow>(
  rows: T[],
  accountMaskedNumber: string | null | undefined,
): CardGroup<T>[] | null {
  const buckets = new Map<string | null, T[]>()
  for (const row of rows) {
    const key = row.card_number ?? null
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else buckets.set(key, [row])
  }
  if (buckets.size <= 1) return null

  const cards = [...buckets.keys()]
    .filter((key): key is string => key !== null)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const ordered: (string | null)[] = []
  if (accountMaskedNumber && buckets.has(accountMaskedNumber)) {
    ordered.push(accountMaskedNumber)
  }
  ordered.push(...cards.filter((card) => card !== accountMaskedNumber))
  if (buckets.has(null)) ordered.push(null)

  return ordered.map((cardNumber) => ({ cardNumber, rows: buckets.get(cardNumber)! }))
}

/**
 * A group's share of the bill total, in the currency the page is showing.
 * Debits add, credits subtract — same arithmetic as the running total.
 */
export function cardGroupSubtotal(
  rows: (BillRow & Pick<Transaction, 'amount' | 'amount_primary' | 'currency'>)[],
  usePrimary: boolean,
  displayCurrency: string,
): number {
  let subtotal = 0
  for (const row of rows) {
    if (!countsOnBill(row)) continue
    const amount = transactionAmountForBalance(row, usePrimary, displayCurrency)
    if (amount == null) continue
    subtotal += row.type === 'debit' ? amount : -amount
  }
  return subtotal
}
