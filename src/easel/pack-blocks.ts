// REPORT-003: one neutral reading of a published pack that the PDF and
// PowerPoint renderers share, so every format states the same figures.
// Blocks are built only from the immutable snapshot body.
import { monthLabel } from './months'
import { formatMoney } from './units'
import type { Data } from './types'

export type Chart = { title: string; months: string[]; series: { name: string; values: number[] }[] }
export type Block =
 | { type: 'heading'; text: string }
 | { type: 'text'; text: string }
 | { type: 'table'; heads: string[]; rows: string[][]; caption?: string }
 | { type: 'chart'; chart: Chart; currency: string }

const has = (b: Data, section: string) => !b.sections || b.sections.includes(section)

export function packBlocks(sn: Data): { title: string; subtitle: string; blocks: Block[] } {
 const b = sn.body, cur = b.currency, money = (n: number | null | undefined) => n === null || n === undefined ? '—' : formatMoney(n, cur)
 const blocks: Block[] = []
 const table = (heads: string[], rows: unknown[][], caption?: string) => blocks.push({ type: 'table', heads, rows: rows.map(r => r.map(v => String(v ?? ''))), ...(caption ? { caption } : {}) })
 blocks.push({ type: 'text', text: `Published by ${b.publishedBy.name} (${b.publishedBy.email}) at ${b.publishedAt}. Snapshot ${sn.id}, SHA-256 ${sn.sha256}.` })
 blocks.push({ type: 'text', text: `Approved budget revision ${b.budget.revision}, approved by ${b.budget.approvedBy?.name ?? ''} at ${b.budget.approvedAt ?? ''}. Forecast ${b.forecast.name} revision ${b.forecast.revision}, actuals through ${monthLabel(b.forecast.actualsThrough)}.` })
 if (has(b, 'kpis') && b.kpis) {
  blocks.push({ type: 'heading', text: 'Key figures' })
  table(['KPI', 'Actual', 'Budget', 'Difference'], b.kpis.map((k: Data) => { const f = (n: number | null) => k.unit === 'count' ? (n === null ? '—' : String(n)) : money(n); return [k.label, f(k.actual), f(k.budget), k.actual === null || k.budget === null ? '—' : f(k.actual - k.budget)] }))
 }
 if (has(b, 'statements') && b.lines) {
  blocks.push({ type: 'heading', text: `Profit and loss, ${b.label ?? monthLabel(b.month)}` })
  table(['Line', 'Actual', 'Budget', 'YTD actual', 'YTD budget'], [...b.lines.map((l: Data) => [l.line, money(l.actual), money(l.budget), money(l.ytdActual), money(l.ytdBudget)]), ['Profit', money(b.profit?.month?.profit), money(b.profit?.budget?.profit), '', '']])
  blocks.push({ type: 'heading', text: 'Cash' })
  table(['Month', 'Forecast closing cash', 'Budget closing cash', 'Completeness'], (b.cash ?? []).map((m: Data) => [monthLabel(m.month), money(m.closing), money(m.budget), m.incompleteReasons?.join(' ') ?? '']))
  if (b.balanceSheet) { blocks.push({ type: 'heading', text: 'Balance sheet' }); table(['Month', 'Cash', 'Receivables', 'Deferred revenue', 'Assets', 'Liabilities', 'Equity'], b.balanceSheet.map((m: Data) => [monthLabel(m.month), money(m.cash), money(m.receivables), money(m.deferredRevenue), money(m.assets), money(m.liabilities), money(m.equity)])) }
  if (b.cashFlow) { blocks.push({ type: 'heading', text: 'Indirect cash flow' }); table(['Month', 'Net income', 'Operating', 'Investing', 'Financing', 'Closing cash'], b.cashFlow.map((m: Data) => [monthLabel(m.month), money(m.netIncome), money(m.operating), money(m.investing), money(m.financing), money(m.closing)])) }
 }
 if (has(b, 'charts') && b.charts) for (const chart of b.charts) { blocks.push({ type: 'heading', text: chart.title }); blocks.push({ type: 'chart', chart, currency: cur }) }
 if (has(b, 'commentary') && b.variances) {
  blocks.push({ type: 'heading', text: 'Variances and explanations' })
  table(['Line · department', 'Actual', 'Budget', 'Variance', 'Explanation'], b.variances.map((v: Data) => [`${v.line} · ${v.department}`, money(v.actual), money(v.budget), `${money(v.variance)}${v.favourable === null ? '' : v.favourable ? ' (favourable)' : ' (unfavourable)'}`, v.explanation ? `${v.explanation.text} [${v.explanation.status}${v.explanation.confirmedBy ? ` by ${v.explanation.confirmedBy}` : ''}]${v.evidence.length ? ` Evidence: ${v.evidence.join('; ')}` : ''}` : 'No explanation recorded']))
 }
 if (has(b, 'commentary') && b.versionComparison) {
  blocks.push({ type: 'heading', text: 'Actual against every version' })
  const vs: Data[] = b.versionComparison.versions
  table(['Line · department', `Actual (${cur})`, ...vs.map(v => `${v.name} (${v.currency}) rev ${v.revision}`)], b.versionComparison.rows.map((r: Data) => [`${r.lineName} · ${r.departmentName}`, money(r.actual), ...vs.map(v => { const x = r.comparisons.find((cmp: Data) => cmp.id === v.id); return `${x.amount === null ? '—' : formatMoney(x.amount, v.currency)} · Δ ${money(x.variance)}` })]))
 }
 if (has(b, 'decisions')) {
  blocks.push({ type: 'heading', text: 'Decisions and actions' })
  if (b.decisions.length) table(['Decision or action', 'Owner', 'Due'], b.decisions.map((d: Data) => [d.text, d.owner, d.due])); else blocks.push({ type: 'text', text: 'No decisions recorded.' })
 }
 if (has(b, 'appendix')) {
  if (b.contracts) { blocks.push({ type: 'heading', text: 'Bookings, billings, revenue and collections' }); table(['Month', 'Bookings', 'Billings', 'Revenue', 'Collections', 'Receivables', 'Deferred revenue'], b.contracts.months.map((m: Data) => [monthLabel(m.month), ...['bookings', 'billings', 'revenue', 'collections', 'receivables', 'deferredRevenue'].map(k => money(m[k]))])) }
  if (b.sources) { blocks.push({ type: 'heading', text: 'Sources' }); table(['Accepted import', 'SHA-256', 'Rows', 'Accepted by'], b.sources.map((x: Data) => [x.file, x.sha256, x.rows, `${x.acceptedBy} at ${x.acceptedAt}`])) }
 }
 return { title: `${b.title} · ${b.company}`, subtitle: `${b.label ?? monthLabel(b.month)} · ${cur}`, blocks }
}
