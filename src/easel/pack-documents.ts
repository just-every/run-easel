// A published review pack as a printable HTML document and as CSV. Both are
// rendered from the immutable pack snapshot, so a download always shows what
// was published.
import { monthLabel } from './months'
import { formatHundredths, formatMoney } from './units'
import { packChartMonth, packDate } from './pack-presentation'
import type { Data } from './types'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^\s*[=+\-@]/.test(s) ? `"${(/^\s*[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s }

const has = (b: Data, section: string) => !b.sections || b.sections.includes(section)
const chartSvg = (chart: Data, currency: string) => {
 const values = chart.series.flatMap((s: Data) => s.values), max = Math.max(1, ...values), min = Math.min(0, ...values), span = max - min, slot = 600 / chart.months.length, bar = slot * 0.7 / chart.series.length, y = (v: number) => 170 - (v - min) / span * 150
 return `<div style="max-width:100%;overflow-x:auto"><svg role="img" aria-label="${esc(chart.title)}" viewBox="0 0 700 225" width="700" style="display:block"><text x="0" y="14" font-size="13">${esc(formatMoney(max, currency))}</text><text x="0" y="172" font-size="13">${esc(formatMoney(min, currency))}</text>${chart.months.map((m: string, i: number) => chart.series.map((s: Data, k: number) => `<rect x="${90 + i * slot + slot * 0.15 + k * bar}" y="${Math.min(y(s.values[i]), y(0))}" width="${bar}" height="${Math.max(0.5, Math.abs(y(s.values[i]) - y(0)))}" fill="${k % 2 ? '#a6a6a6' : '#26598c'}"><title>${esc(s.name)} ${esc(monthLabel(m))}: ${esc(formatMoney(s.values[i], currency))}</title></rect>`).join('') + `<text x="${90 + i * slot + 2}" y="186" font-size="13">${esc(packChartMonth(m))}</text>`).join('')}<text x="90" y="218" font-size="13">${chart.series.map((s: Data, k: number) => `${k % 2 ? 'Grey' : 'Blue'} = ${esc(s.name)}`).join('   ')}</text></svg></div>`
}

export function packHtml(sn: Data): string {
 const b = sn.body, money = (n: number | null) => n === null || n === undefined ? '—' : formatMoney(n, b.currency)
 const date = (value: string) => packDate(b, value)
 const row = (cells: unknown[]) => `<tr>${cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`
 const statement = (heading: string, values: Data[] | undefined, fields: [string, string][]) => values ? `<h2>${esc(heading)}</h2><table><thead><tr><th>Month</th>${fields.map(([, label]) => `<th>${esc(label)}</th>`).join('')}<th>Completeness</th></tr></thead><tbody>${values.map(m => row([monthLabel(m.month), ...fields.map(([key]) => money(m[key])), m.incompleteReasons?.join(' ') ?? 'Complete planning schedule'])).join('')}</tbody></table>` : ''
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(b.title)} · ${esc(b.company)}</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#1b2724;overflow-wrap:anywhere}table{display:block;overflow-x:auto;max-width:100%;border-collapse:collapse;width:100%;margin:1rem 0}td,th{overflow-wrap:normal;border:1px solid #9aa8a3;padding:.35rem .5rem;text-align:left;vertical-align:top}th{background:#eef2f0}.meta{color:#4a5a55}</style></head><body>
<h1>${esc(b.title)} · ${esc(b.company)}</h1>
<p class="meta">Published by ${esc(b.publishedBy.name)} (${esc(b.publishedBy.email)}) on ${esc(date(b.publishedAt))}.</p>
<p class="meta">Approved budget: revision ${esc(b.budget.revision)}, approved by ${esc(b.budget.approvedBy?.name)} on ${esc(date(b.budget.approvedAt))}. Forecast: ${esc(b.forecast.name)} revision ${esc(b.forecast.revision)}, actuals through ${esc(monthLabel(b.forecast.actualsThrough))}.</p>
${has(b, 'kpis') ? `<h2>Key figures</h2><table><thead><tr><th>KPI</th><th>Actual</th><th>Budget</th></tr></thead><tbody>${b.kpis.map((k: Data) => row([k.label, k.unit === 'count' ? k.actual : money(k.actual), k.unit === 'count' ? k.budget : money(k.budget)])).join('')}</tbody></table>` : ''}
${has(b, 'statements') ? `<h2>Profit and loss, ${esc(b.label ?? monthLabel(b.month))}</h2>
<table><thead><tr><th>Line</th><th>Actual</th><th>Budget</th><th>Year to date actual</th><th>Year to date budget</th></tr></thead><tbody>
${b.lines.map((l: Data) => row([l.line, money(l.actual), money(l.budget), money(l.ytdActual), money(l.ytdBudget)])).join('')}
${row(['Profit', money(b.profit.month?.profit), money(b.profit.budget?.profit), '', ''])}
</tbody></table>` : ''}
${has(b, 'charts') ? b.charts.map((chart: Data) => `<h2>${esc(chart.title)}</h2>${chartSvg(chart, b.currency)}`).join('') : ''}
${has(b, 'commentary') ? `<h2>Variances and explanations</h2>
<table><thead><tr><th>Line · department</th><th>Actual</th><th>Budget</th><th>Variance</th><th>Explanation</th><th>Evidence</th></tr></thead><tbody>
${b.variances.map((v: Data) => row([`${v.line} · ${v.department}`, money(v.actual), money(v.budget), `${money(v.variance)}${v.favourable === null ? '' : v.favourable ? ' (favourable)' : ' (unfavourable)'}`, v.explanation ? `${v.explanation.text} [${v.explanation.status}${v.explanation.confirmedBy ? ` by ${v.explanation.confirmedBy}` : ''}]` : 'No explanation recorded', v.evidence.join('; ')])).join('')}
</tbody></table>` : ''}
${has(b, 'commentary') && b.versionComparison ? `<h2>Actual against every version</h2><p>Δ = actual minus version. — means an absent month or, for Δ, differing currencies.</p><table><thead><tr><th>Line · department</th><th>Actual (${esc(b.currency)})</th>${b.versionComparison.versions.map((v: Data) => `<th>${esc(v.name)} (${esc(v.currency)}) · revision ${esc(v.revision)}</th>`).join('')}</tr></thead><tbody>${b.versionComparison.rows.map((r: Data) => row([`${r.lineName} · ${r.departmentName}`, money(r.actual), ...b.versionComparison.versions.map((v: Data) => { const value = r.comparisons.find((c: Data) => c.id === v.id); return `${value.amount === null ? '—' : formatMoney(value.amount, v.currency)} · Δ ${money(value.variance)}` })])).join('')}</tbody></table>` : ''}
${has(b, 'statements') ? `<h2>Cash</h2>
<table><thead><tr><th>Month</th><th>Forecast closing cash</th><th>Budget closing cash</th><th>Completeness</th></tr></thead><tbody>
${b.cash.map((m: Data) => row([monthLabel(m.month), money(m.closing), money(m.budget), m.incompleteReasons?.join(' ') ?? ''])).join('')}
</tbody></table>` : ''}
${has(b, 'appendix') && b.contracts ? `<h2>Bookings, billings, revenue and collections</h2><p>Captured contract planning assumptions; invoices and collections are not billing actuals.</p><table><thead><tr><th>Month</th><th>Bookings</th><th>Billings</th><th>Revenue</th><th>Collections</th><th>Receivables</th><th>Deferred revenue</th></tr></thead><tbody>${b.contracts.months.map((m: Data) => row([monthLabel(m.month), ...['bookings', 'billings', 'revenue', 'collections', 'receivables', 'deferredRevenue'].map(k => money(m[k]))])).join('')}</tbody></table>` : ''}
${has(b, 'statements') ? statement('Balance sheet', b.balanceSheet, [['cash', 'Cash'], ['prepaid', 'Prepaid expenses'], ['accruedLiabilities', 'Accrued liabilities'], ['receivables', 'Receivables'], ['deferredRevenue', 'Deferred revenue'], ['assets', 'Assets'], ['liabilities', 'Liabilities'], ['equity', 'Equity'], ['balanceDifference', 'Reconciliation difference']]) : ''}
${has(b, 'statements') ? statement('Indirect cash flow', b.cashFlow, [['netIncome', 'Net income'], ['prepaidChange', 'Prepaid change'], ['accruedLiabilitiesChange', 'Accrued liabilities change'], ['receivablesChange', 'Receivables change'], ['deferredRevenueChange', 'Deferred revenue change'], ['operating', 'Operating cash'], ['investing', 'Investing cash'], ['financing', 'Financing cash'], ['closing', 'Closing cash'], ['difference', 'Reconciliation difference']]) : ''}
${has(b, 'decisions') ? `<h2>Decisions and actions</h2>
${b.decisions.length ? `<table><thead><tr><th>Decision or action</th><th>Owner</th><th>Due</th></tr></thead><tbody>${b.decisions.map((d: Data) => row([d.text, d.owner, date(d.due)])).join('')}</tbody></table>` : '<p>No decisions recorded.</p>'}` : ''}
${has(b, 'appendix') ? `<h2>Sources</h2>
<table><thead><tr><th>Accepted import</th><th>Rows</th><th>Accepted by</th><th>Accepted on</th></tr></thead><tbody>
${b.sources.map((x: Data) => row([x.file, x.rows, x.acceptedBy, date(x.acceptedAt)])).join('')}
</tbody></table>` : ''}
</body></html>`
}

export function packCsv(sn: Data): string {
 const b = sn.body
 const columns = ['section', 'line', 'department', 'actual', 'budget', 'variance', 'explanation', 'explanation_status', 'version_name', 'version_currency', 'version_amount', 'version_variance', 'currency', 'owner', 'due']
 const amounts = new Set(['actual', 'budget', 'variance', 'version_amount', 'version_variance'])
 const lines = [columns.join(',')]
 const row = (values: Data) => lines.push(columns.map(key => {
  const value = values[key]
  if (!amounts.has(key)) return csvCell(value)
  if (value == null) return ''
  if (!Number.isSafeInteger(value)) throw new Error('Published pack contains an invalid minor-unit amount')
  return formatHundredths(value)
 }).join(','))
 for (const l of b.lines ?? []) row({ section: 'line', line: l.line, actual: l.actual, budget: l.budget, variance: l.actual - l.budget, currency: b.currency })
 for (const v of b.variances ?? []) row({ section: 'variance', line: v.line, department: v.department, actual: v.actual, budget: v.budget, variance: v.variance, explanation: v.explanation?.text, explanation_status: v.explanation?.status, currency: b.currency })
 for (const m of b.cash ?? []) if (m.incompleteReasons?.length) row({ section: 'cash-incomplete', line: monthLabel(m.month), actual: m.closing, explanation: m.incompleteReasons.join(' '), explanation_status: 'incomplete', currency: b.currency })
 if (b.contracts) for (const m of b.contracts.months) for (const key of ['bookings', 'billings', 'revenue', 'collections', 'receivables', 'deferredRevenue', 'unbilledRevenue']) row({ section: 'contract', line: `${monthLabel(m.month)} ${key}`, actual: m[key], explanation: 'Captured planning schedule', currency: b.currency })
 for (const d of b.decisions ?? []) row({ section: 'decision', line: d.text, owner: d.owner, due: d.due })
 if (b.versionComparison) for (const r of b.versionComparison.rows) for (const v of b.versionComparison.versions) {
  const value = r.comparisons.find((c: Data) => c.id === v.id)
  row({ section: 'version-comparison', line: r.lineName, department: r.departmentName, actual: r.actual, version_name: v.name, version_currency: v.currency, version_amount: value.amount, version_variance: value.variance, currency: b.currency })
 }
 return lines.join('\r\n') + '\r\n'
}
