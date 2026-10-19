// A published review pack as a printable HTML document and as CSV. Both are
// rendered from the immutable pack snapshot, so a download always shows what
// was published.
import { monthLabel } from './months'
import { formatMoney } from './units'
import type { Data } from './types'

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s }

export function packHtml(sn: Data): string {
 const b = sn.body, money = (n: number | null) => n === null || n === undefined ? '—' : formatMoney(n, b.currency)
 const row = (cells: unknown[]) => `<tr>${cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(b.title)} · ${esc(b.company)}</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#1b2724}table{border-collapse:collapse;width:100%;margin:1rem 0}td,th{border:1px solid #9aa8a3;padding:.35rem .5rem;text-align:left;vertical-align:top}th{background:#eef2f0}.meta{color:#4a5a55}</style></head><body>
<h1>${esc(b.title)} · ${esc(b.company)}</h1>
<p class="meta">Published by ${esc(b.publishedBy.name)} (${esc(b.publishedBy.email)}) at ${esc(b.publishedAt)}. Snapshot ${esc(sn.id)}, SHA-256 ${esc(sn.sha256)}.</p>
<p class="meta">Approved budget: revision ${esc(b.budget.revision)}, approved by ${esc(b.budget.approvedBy?.name)} at ${esc(b.budget.approvedAt)} (snapshot SHA-256 ${esc(b.budget.sha256)}). Forecast: ${esc(b.forecast.name)} revision ${esc(b.forecast.revision)}, actuals through ${esc(monthLabel(b.forecast.actualsThrough))}.</p>
<h2>Profit and loss, ${esc(monthLabel(b.month))}</h2>
<table><thead><tr><th>Line</th><th>Actual</th><th>Budget</th><th>Year to date actual</th><th>Year to date budget</th></tr></thead><tbody>
${b.lines.map((l: Data) => row([l.line, money(l.actual), money(l.budget), money(l.ytdActual), money(l.ytdBudget)])).join('')}
${row(['Profit', money(b.profit.month?.profit), money(b.profit.budget?.profit), '', ''])}
</tbody></table>
<h2>Variances and explanations</h2>
<table><thead><tr><th>Line · department</th><th>Actual</th><th>Budget</th><th>Variance</th><th>Explanation</th><th>Evidence</th></tr></thead><tbody>
${b.variances.map((v: Data) => row([`${v.line} · ${v.department}`, money(v.actual), money(v.budget), `${money(v.variance)}${v.favourable === null ? '' : v.favourable ? ' (favourable)' : ' (unfavourable)'}`, v.explanation ? `${v.explanation.text} [${v.explanation.status}${v.explanation.confirmedBy ? ` by ${v.explanation.confirmedBy}` : ''}]` : 'No explanation recorded', v.evidence.join('; ')])).join('')}
</tbody></table>
${b.versionComparison ? `<h2>Actual against every version</h2><p>Δ = actual minus version. — means an absent month or, for Δ, differing currencies.</p><table><thead><tr><th>Line · department</th><th>Actual (${esc(b.currency)})</th>${b.versionComparison.versions.map((v: Data) => `<th>${esc(v.name)} (${esc(v.currency)}) · revision ${esc(v.revision)}</th>`).join('')}</tr></thead><tbody>${b.versionComparison.rows.map((r: Data) => row([`${r.lineName} · ${r.departmentName}`, money(r.actual), ...b.versionComparison.versions.map((v: Data) => { const value = r.comparisons.find((c: Data) => c.id === v.id); return `${value.amount === null ? '—' : formatMoney(value.amount, v.currency)} · Δ ${money(value.variance)}` })])).join('')}</tbody></table>` : ''}
<h2>Cash</h2>
<table><thead><tr><th>Month</th><th>Forecast closing cash</th><th>Budget closing cash</th></tr></thead><tbody>
${b.cash.map((m: Data) => row([monthLabel(m.month), money(m.closing), money(m.budget)])).join('')}
</tbody></table>
<h2>Decisions and actions</h2>
${b.decisions.length ? `<table><thead><tr><th>Decision or action</th><th>Owner</th><th>Due</th></tr></thead><tbody>${b.decisions.map((d: Data) => row([d.text, d.owner, d.due])).join('')}</tbody></table>` : '<p>No decisions recorded.</p>'}
<h2>Sources</h2>
<table><thead><tr><th>Accepted import</th><th>SHA-256</th><th>Rows</th><th>Accepted by</th></tr></thead><tbody>
${b.sources.map((x: Data) => row([x.file, x.sha256, x.rows, `${x.acceptedBy} at ${x.acceptedAt}`])).join('')}
</tbody></table>
</body></html>`
}

export function packCsv(sn: Data): string {
 const b = sn.body
 const lines = [['section', 'line', 'department', 'actual_minor', 'budget_minor', 'variance_minor', 'explanation', 'explanation_status', 'version_name', 'version_currency', 'version_minor', 'version_variance_minor'].join(',')]
 for (const l of b.lines) lines.push(['line', l.line, '', l.actual, l.budget, l.actual - l.budget, '', '', '', '', '', ''].map(csvCell).join(','))
 for (const v of b.variances) lines.push(['variance', v.line, v.department, v.actual, v.budget, v.variance, v.explanation?.text ?? '', v.explanation?.status ?? '', '', '', '', ''].map(csvCell).join(','))
 for (const d of b.decisions) lines.push(['decision', d.text, d.owner, '', '', '', d.due, '', '', '', '', ''].map(csvCell).join(','))
 if (b.versionComparison) for (const r of b.versionComparison.rows) for (const v of b.versionComparison.versions) {
  const value = r.comparisons.find((c: Data) => c.id === v.id)
  lines.push(['version-comparison', r.lineName, r.departmentName, r.actual, '', '', '', '', v.name, v.currency, value.amount, value.variance].map(csvCell).join(','))
 }
 return lines.join('\r\n') + '\r\n'
}
