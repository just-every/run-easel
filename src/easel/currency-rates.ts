// ENTITY-002: finance keeps one table of rates from the plan currency to the
// reporting currency. A rate is the reporting-currency amount of one unit of
// plan currency, stored as an integer in millionths so no float enters. The
// table is read when a translated view is built; it never rewrites a stored
// calculation or a frozen snapshot.
import { requireFinance } from './access'
import type { Context } from './context'
import { month } from './months'
import { decimal } from './units'
import { workspace } from './model'
import { find, put, requireThat, text, type Data } from './types'

export const RATE_SCALE = 1_000_000
export const RATE_KINDS = ['budget', 'average', 'monthEnd'] as const
export type RateKind = typeof RATE_KINDS[number]
export type RateRow = Partial<Record<RateKind, number>>
export type RateTable = { local: string; reporting: string; rates: Record<string, RateRow>; by: string; at: string }

export const formatRate = (micro: number) => (micro / RATE_SCALE).toFixed(6)

export const rateTable = (s: Context['s']): RateTable | undefined => find(s, 'fx-table', 'main') as RateTable | undefined

/** `fx-rate {month, budget?, average?, monthEnd?, reporting?}` sets or clears (empty string) one month's rates; the reporting currency is kept until finance names another. */
export function currencyRates(c: Context, op: string, b: Data): Data | undefined {
 if (op !== 'fx-rate') return undefined
 requireFinance(c.x)
 const w = workspace(c.s), existing = rateTable(c.s)
 const reporting = text(b.reporting ?? existing?.reporting ?? 'USD', 'Reporting currency').toUpperCase()
 requireThat(/^[A-Z]{3}$/.test(reporting), 'Use a three-letter currency code such as USD')
 requireThat(reporting !== w.currency, `The plan is already in ${w.currency}; choose a different reporting currency`)
 const m = month(b.month, 'Rate month')
 // A different pair starts a new table: rates quoted for another pair never carry over.
 const keep = existing && existing.local === w.currency && existing.reporting === reporting ? existing.rates : {}
 const row: RateRow = { ...keep[m] }
 let given = 0
 for (const kind of RATE_KINDS) {
  if (b[kind] === undefined) continue
  given++
  if (b[kind] === '' || b[kind] === null) delete row[kind]
  else row[kind] = decimal(b[kind], `${kind} rate`, 6, { max: 10n ** 9n })
  requireThat(row[kind] === undefined || row[kind]! > 0, `${kind} rate must be above zero`)
 }
 requireThat(given > 0, 'Send at least one of budget, average or monthEnd')
 const rates = { ...keep }
 if (Object.keys(row).length) rates[m] = row; else delete rates[m]
 const table: RateTable = { local: w.currency, reporting, rates, by: c.x.actor.email, at: c.now }
 put(c.s, 'fx-table', 'main', table)
 c.activity.push({ action: op, record: 'main', detail: { month: m, reporting, row: rates[m] ?? null } })
 return table
}
