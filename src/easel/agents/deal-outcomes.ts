// AGENT-004 data door: deal history. Finance records, for each deal, the close
// date the forecast expected and the date it actually closed (and, when known,
// the invoice and paid dates). Rows are reviewed numbers a person typed or
// pasted; Easel infers nothing and a later save of the same deal replaces it.
import { requireFinance } from '../access'
import type { Context } from '../context'
import { all, get, put, remove, requireThat, text, type Data } from '../types'
import { cents } from '../units'

const MAX_ROWS = 500, MAX_DEALS = 5000
export const dayStamp = (date: string) => Date.parse(`${date}T00:00:00Z`)
const realDate = (value: unknown, label: string) => {
 requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(dayStamp(value)).toISOString().slice(0, 10) === value, `${label} must be a real date written YYYY-MM-DD`)
 return value as string
}
const optionalDate = (value: unknown, label: string) => value === undefined || value === null || value === '' ? '' : realDate(value, label)
export const daysBetween = (from: string, to: string) => (dayStamp(to) - dayStamp(from)) / 86400000

export function dealRow(raw: unknown): Data {
 requireThat(raw && typeof raw === 'object' && !Array.isArray(raw), 'Each deal needs an ID, a name, the expected close date and the actual close date')
 const r = raw as Data
 const deal = text(r.deal, 'Deal ID', 100)
 requireThat(/^[A-Za-z0-9._:-]+$/.test(deal), 'Deal IDs use letters, digits and . _ : -')
 const row: Data = { deal, name: text(r.name, 'Deal name', 200), plannedClose: realDate(r.plannedClose, 'Expected close date'), actualClose: realDate(r.actualClose, 'Actual close date') }
 const contract = typeof r.contract === 'string' ? r.contract.trim() : ''
 requireThat(contract.length <= 100, 'Contract link is too long')
 if (contract) row.contract = contract
 const invoiceDate = optionalDate(r.invoiceDate, 'Invoice date'), paidDate = optionalDate(r.paidDate, 'Paid date')
 requireThat(!paidDate || invoiceDate, 'A paid date needs the invoice date')
 requireThat(!paidDate || paidDate >= invoiceDate, 'A deal cannot be paid before it was invoiced')
 if (invoiceDate) row.invoiceDate = invoiceDate
 if (paidDate) row.paidDate = paidDate
 if (r.amount !== undefined && r.amount !== '') row.amountCents = cents(r.amount, 'Invoice amount')
 return row
}

export function dealOutcomes(c: Context, op: string, b: Data): Data | undefined {
 if (op === 'deal-outcomes-save') {
  requireFinance(c.x)
  requireThat(Array.isArray(b.rows) && b.rows.length > 0 && b.rows.length <= MAX_ROWS, `Send 1 to ${MAX_ROWS} deals`)
  const rows = b.rows.map(dealRow)
  requireThat(new Set(rows.map(r => r.deal)).size === rows.length, 'Each deal ID appears once per save')
  const existing = new Set(all(c.s, 'deal-outcome').map(d => d.id))
  requireThat(existing.size + rows.filter(r => !existing.has(r.deal)).length <= MAX_DEALS, `Deal history holds at most ${MAX_DEALS} deals`)
  for (const r of rows) put(c.s, 'deal-outcome', r.deal, { ...r, savedBy: c.x.actor.email, savedAt: c.now })
  c.activity.push({ action: op, record: 'deal-history', detail: { deals: rows.length } })
  return { saved: rows.length, total: all(c.s, 'deal-outcome').length }
 }
 if (op === 'deal-outcome-delete') {
  requireFinance(c.x)
  const deal = get(c.s, 'deal-outcome', b.deal, 'deal')
  remove(c.s, 'deal-outcome', deal.id)
  c.activity.push({ action: op, record: 'deal-history', detail: { deal: deal.id } })
  return { deleted: deal.id }
 }
 return undefined
}

export const dealHistory = (c: Context) => all(c.s, 'deal-outcome').sort((a, b) => a.plannedClose.localeCompare(b.plannedClose) || a.id.localeCompare(b.id))
