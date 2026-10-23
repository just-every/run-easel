import { useEffect, useState } from 'react'
import { Action, api, money, Table, type D } from './shared'
import { officeAdapter, officeHost } from './office-runtime'

/** Uses the report page's existing controls, tables and saved version selection. */
export function OfficeReports({ report }: { report?: D }) {
 const [view, setView] = useState<D | null>(null), [period, setPeriod] = useState(''), [kind, setKind] = useState('table'), [metric, setMetric] = useState('budget'), [row, setRow] = useState('')
 const [host, setHost] = useState<D | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false)
 useEffect(() => {
  if (!new URL(window.location.href).searchParams.has('office')) return
  officeHost().then(setHost, e => setError(e.message))
 }, [])
 useEffect(() => {
  let live = true; setView(null); setMessage(''); setConsent(false)
  if (report) api(`dashboards/${encodeURIComponent(report.id)}/report`).then(v => { if (live) { setView(v); setPeriod(v.rows[0]?.period ?? ''); setRow(v.rows[0]?.row || 'unassigned'); setError('') } }, e => { if (live) setError(e.message) })
  return () => { live = false }
 }, [report?.id, report?.revision])
 const params = (binding: D) => new URLSearchParams(Object.entries(binding).filter(([, value]) => typeof value === 'string') as [string, string][]).toString()
 const load = (binding: D) => api(`dashboards/${encodeURIComponent(binding.report)}/office?${params(binding)}`)
 const selected = view?.rows.filter((r: D) => r.period === period) ?? []
 const binding = { report: report?.id, source: report?.scenario, through: report?.report.through, period, kind, metric, row: kind === 'number' ? row : 'all' }
 return <section className="card" aria-label="Linked Office reports"><h2>PowerPoint and Word links</h2>
  <p>Insert a permitted saved report into your deck or memo. Refresh updates its linked objects in place from the same source version and period. Unavailable values stay labeled.</p>
  {!host && <p>Download this installation’s <a href="/api/office/manifest/PowerPoint">PowerPoint manifest</a> or <a href="/api/office/manifest/Word">Word manifest</a>, then sideload it in Office and sign in to Easel there. <a href="https://github.com/just-every/run-easel/blob/main/docs/office-reporting.md">Installation instructions</a></p>}
  {error && <p role="alert" className="error">{error}</p>}
  {view && <>
   <p>Source: {view.sourceName} · {view.currency}. Change the source version and through month in the saved report before inserting.</p>
   <label>Linked period<select aria-label="Linked period" value={period} onChange={e => { setPeriod(e.target.value); setConsent(false) }}>{[...new Set<string>(view.rows.map((r: D) => r.period))].map(p => <option key={p}>{p}</option>)}</select></label>
   <label>Linked content<select aria-label="Linked content" value={kind} onChange={e => { setKind(e.target.value); setConsent(false) }}><option value="table">Table</option><option value="chart">Chart</option><option value="number">Single number</option></select></label>
   <label>Linked value<select aria-label="Linked value" value={metric} onChange={e => { setMetric(e.target.value); setConsent(false) }}>{[['budget', view.sourceName], ['actual', 'Actual'], ['comparison', view.comparisonName ?? 'Comparison'], ['variance', 'Variance'], ['priorYearActual', 'Prior-year actual'], ['yoy', 'YoY change']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
   {kind === 'number' && <label>Linked row<select aria-label="Linked row" value={row} onChange={e => { setRow(e.target.value); setConsent(false) }}>{selected.map((r: D) => <option key={r.row} value={r.row || 'unassigned'}>{r.name}</option>)}</select></label>}
   <Table caption="Office content preview" heads={['Row', 'Value']}>
    {selected.filter((r: D) => kind !== 'number' || (r.row || 'unassigned') === row).map((r: D) => <tr key={r.row}><th scope="row">{r.name}</th><td className="num">{r[metric] === null ? 'Unavailable' : money(r[metric], view.currency)}</td></tr>)}
   </Table>
   <p><a href={`/api/easel/dashboards/${encodeURIComponent(report!.id)}/office.xlsx?${params(binding)}`} download>Download linked report (Excel)</a></p>
   {host && <><label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I choose to place these aggregate report values in this document. Document sharing is managed in Office.</label>
    <button type="button" disabled={!consent || busy} onClick={async () => { setBusy(true); setMessage(''); try { setError(''); const payload = await load(binding), adapter = await officeAdapter(); await adapter.insertLinked(host, payload); setMessage('Linked content inserted. Save your document to retain its links.'); setConsent(false) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }}>{busy ? 'Working…' : 'Insert linked content'}</button>
   </>}
  </>}
  {host && <Action label="Refresh linked content" run={async () => { setMessage(''); const adapter = await officeAdapter(), result = await adapter.refreshLinked(host, load); setMessage(`${result.updated} linked objects refreshed. Save your document to keep these values.`) }} />}
  {message && <p role="status">{message}</p>}
  <p className="muted">Refresh checks your current access to every linked report before changing content. Revoked access refuses refresh; values already exported into an Office document cannot be recalled by Easel.</p>
 </section>
}
