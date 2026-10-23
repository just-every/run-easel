import { OfficeReports } from './office-reports'
import { BiFeeds } from './bi-feeds'
import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { Action, api, command, decimalText, Field, Form, money, options, Table, type D } from './shared'

const rows = ['department', 'line', 'dimension', 'hierarchy'].map(value => ({ value, label: ({ department: 'Departments', line: 'Lines', dimension: 'Dimension members', hierarchy: 'Account hierarchy' } as D)[value] }))
const periods = ['month', 'quarter', 'year'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))
const audiences = [{ value: 'private', label: 'Private' }, { value: 'leadership', label: 'Leadership' }, { value: 'board', label: 'Board' }, { value: 'department', label: 'Department' }]
const percent = (v: number | null) => v === null ? 'Unavailable' : `${decimalText(v)}%`

/** Shared by the report page and report-backed dashboard sections. */
export function SavedReportPanel({ id }: { id: string }) {
 const [view, setView] = useState<D | null>(null), [error, setError] = useState(''), [display, setDisplay] = useState('table')
 useEffect(() => { let live = true; setView(null); setError(''); api(`dashboards/${encodeURIComponent(id)}/report`).then(v => { if (live) { setView(v); setDisplay(v.reportDisplay) } }, e => { if (live) setError(e.message) }); return () => { live = false } }, [id])
 if (error) return <p role="alert" className="error">{error}</p>
 if (!view) return <p role="status">Loading saved report…</p>
 const values = view.rows.flatMap((r: D) => [r.actual, r.budget]).filter((v: unknown) => typeof v === 'number'), maximum = Math.max(1, ...values.map((v: number) => Math.abs(v)))
 return <><p>{view.sourceName} · {view.currency}. Unavailable periods remain blank in Excel. Hierarchy totals include their children and are not additive.</p>
  <label>Report display<select aria-label="Report display" value={display} onChange={e => setDisplay(e.target.value)}><option value="table">Table</option><option value="chart">Chart and table</option></select></label><Action label="Save my report display" run={async () => { await command('report-layout', { dashboard: id, revision: view.layoutRevision, definitionRevision: view.definitionRevision, display }); const next = await api(`dashboards/${encodeURIComponent(id)}/report`); setView(next); setDisplay(next.reportDisplay) }} />
  {display === 'chart' && <figure><figcaption>Actual and source version by row and period</figcaption>{view.rows.map((r: D) => <div key={`${r.row}:${r.period}`}><strong>{r.name} · {r.period}</strong>{[['actual', 'Actual'], ['budget', view.sourceName]].map(([key, label]) => <div key={key}>{label}: {r[key] === null ? 'Unavailable' : <><meter min={-maximum} max={maximum} value={r[key]} aria-label={`${r.name} ${r.period} ${label}`} /> {money(r[key], view.currency)}</>}</div>)}</div>)}</figure>}
  <Table caption={view.name} heads={['Row', 'Period', 'Actual', view.sourceName, ...(view.comparisonName ? [view.comparisonName] : []), 'Variance', 'Variance %', 'Prior-year actual', 'YoY change', 'YoY %', ...(view.versions ?? []).map((v: D) => v.name)]}>
   {view.rows.map((r: D) => <tr key={`${r.row}:${r.period}`}><th scope="row">{r.name}{r.rollup ? ' (total)' : ''}</th><td>{r.period}</td><td className="num">{money(r.actual, view.currency)}</td><td className="num">{money(r.budget, view.currency)}</td>{view.comparisonName && <td className="num">{money(r.comparison, view.currency)}</td>}<td className={`num${r.highlight ? ' error' : ''}`}>{money(r.variance, view.currency)}{r.highlight && ' · Above threshold'}</td><td className="num">{percent(r.varianceBps)}</td><td className="num">{money(r.priorYearActual, view.currency)}</td><td className="num">{money(r.yoy, view.currency)}</td><td className="num">{percent(r.yoyBps)}</td>{(view.versions ?? []).map((v: D) => <td className="num" key={v.id}>{money(r.versions[v.id], view.currency)}</td>)}</tr>)}
  </Table><p><a href={`/api/easel/dashboards/${encodeURIComponent(id)}/report.xlsx`} download>Download report (Excel)</a></p>
  <BiFeeds id={id} />
 </>
}

function ReportEditor({ state, definition, saved, cancel }: { state: D; definition: D | null; saved: (id: string) => Promise<void>; cancel: () => void }) {
 const finance = state.me.role === 'finance', report = definition?.report
 const departments = finance ? state.departments : state.departments.filter((d: D) => state.me.departments.includes(d.id))
 const scenarios = state.scenarios.filter((s: D) => !s.sandbox && s.kind !== 'proposal')
 const dimensions = state.dimensions ?? [], members = state.dimensionMembers ?? []
 return <section className="card"><h2>{definition ? 'Edit report' : 'Build report'}</h2><Form submit="Save report" onSubmit={async v => {
  const result = await command('report-save', { ...(definition ? { id: definition.id, revision: definition.revision } : {}), name: v.name, scenario: v.scenario, department: v.department || '', audience: v.audience,
   report: { row: v.row, dimension: v.dimension || '', dimensions: Object.fromEntries(dimensions.map((d: D) => [d.id, v[`filter:${d.id}`]]).filter(([, value]: any) => value)), period: v.period, through: v.through, lines: v.lines, comparisons: v.comparisons ?? [], comparison: v.comparison || '', highlightBps: v.highlightBps } })
  await saved(result.id)
 }}>
  <Field label="Report name" name="name" defaultValue={definition?.name} />
  <Field label="Source version" name="scenario" defaultValue={definition?.scenario ?? scenarios[0]?.id} options={options(scenarios)} />
  <Field label="Rows" name="row" defaultValue={report?.row ?? 'department'} options={rows} />
  <Field label="Columns" name="period" defaultValue={report?.period ?? 'quarter'} options={periods} hint="YTD, TTM, prior-year actual and YoY are always included." />
  <Field label="Through month" name="through" type="month" defaultValue={report?.through ?? state.workspace.planStart} />
  <Field label="Report lines" name="lines" multiple options={options(state.lines)} defaultValue={report?.lines ?? state.lines.map((l: D) => l.id)} />
  <Field label="Department filter" name="department" required={!finance} defaultValue={definition?.department ?? departments[0]?.id} options={[...(finance ? [{ value: '', label: 'All departments' }] : []), ...options(departments)]} />
  <Field label="Additional versions" name="comparisons" multiple required={false} defaultValue={report?.comparisons ?? []} options={options(scenarios)} />
  <Field label="Comparison version" name="comparison" required={false} defaultValue={report?.comparison} options={[{ value: '', label: 'No additional comparison' }, ...options(scenarios)]} />
  {!!dimensions.length && <Field label="Row dimension" name="dimension" required={false} defaultValue={report?.dimension} options={options(dimensions)} />}
  {dimensions.map((d: D) => <Field key={d.id} label={`${d.name} filter`} name={`filter:${d.id}`} required={false} defaultValue={report?.dimensions?.[d.id]} options={[{ value: '', label: 'All permitted members' }, ...options(members.filter((m: D) => m.dimension === d.id))]} hint="Includes descendants of the selected member." />)}
  <Field label="Highlight above (basis points)" name="highlightBps" type="number" defaultValue={report?.highlightBps ?? 1000} hint="1000 basis points = 10%. Unavailable percentages are never highlighted." />
  <Field label="Share with" name="audience" defaultValue={definition?.audience ?? 'private'} options={finance ? audiences : audiences.filter(a => ['private', 'department'].includes(a.value))} />
  <button type="button" className="quiet" onClick={cancel}>Cancel</button>
 </Form></section>
}

function ReportSchedules({ state, reports }: { state: D; reports: D[] }) {
 const [data, setData] = useState<D | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0)
 useEffect(() => { let live = true; api('report-schedules').then(v => { if (live) { setData(v); setError('') } }, e => { if (live) setError(e.message) }); return () => { live = false } }, [revision, state])
 const reload = async () => setRevision(r => r + 1)
 return <section className="card"><h2>Scheduled reports</h2><p>Company zone: {state.workspace.timeZone ?? 'America/New_York'}. Dispatch follows daylight saving time. Each named person receives their current permitted view.</p>
  {error && <p role="alert" className="error">{error}</p>}
  <Form submit="Schedule report" onSubmit={async v => { await command('report-schedule-save', { ...v, recipients: String(v.recipientsText).split(',').map(s => s.trim()).filter(Boolean), enabled: true }); await reload() }}>
   <Field label="Scheduled report" name="dashboard" options={options(reports)} />
   <Field label="Named recipients (emails, separated by commas)" name="recipientsText" hint="Recipients must have active accounts and access to this shared report." />
   <Field label="Frequency" name="cadence" defaultValue="weekly" options={['daily', 'weekly', 'monthly'].map(value => ({ value, label: value }))} />
   <Field label="Local hour (0–23)" name="hour" type="number" defaultValue={8} />
   <Field label="Weekly day" name="weekday" defaultValue="1" options={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((label, i) => ({ label, value: String(i) }))} />
   <Field label="Monthly day (1–28)" name="day" type="number" defaultValue={1} />
  </Form>
  {data?.schedules.map((s: D) => <div key={s.id}><p>{reports.find(r => r.id === s.dashboard)?.name ?? 'Unavailable report'} · {s.cadence} at {s.hour}:00 · {s.recipients.join(', ')}</p><Action kind="danger" label="Remove schedule" run={async () => { await command('report-schedule-delete', { id: s.id, revision: s.revision }); await reload() }} /></div>)}
  {!!data?.deliveries.length && <Table caption="Scheduled and actual dispatch" heads={['Recipient', 'Zone', 'Scheduled', 'Actual dispatch', 'Outcome', '']}>
   {data.deliveries.map((d: D) => <tr key={d.id}><th scope="row">{d.recipient}</th><td>{d.zone}</td><td>{new Date(d.scheduledAt).toLocaleString('en-US', { timeZone: d.zone })}</td><td>{d.dispatchedAt ? new Date(d.dispatchedAt).toLocaleString('en-US', { timeZone: d.zone }) : 'Not dispatched'}</td><td className="wrap">{d.label ?? d.status}{d.reason && ` · ${d.reason}`}</td><td>{['pending', 'blocked', 'suppressed'].includes(d.status) && <Action label="Retry refused email" run={async () => { await command('report-schedule-retry', { id: d.id }); await reload() }} />}</td></tr>)}
  </Table>}
 </section>
}

export function SavedReports({ state, refresh }: Shared) {
 const [reports, setReports] = useState<D[]>([]), [selected, setSelected] = useState(''), [edit, setEdit] = useState<'new' | 'edit' | null>(null), [error, setError] = useState('')
 useEffect(() => { let live = true; api('reports').then(v => { if (live) { setReports(v); setSelected(id => v.some((r: D) => r.id === id) ? id : v[0]?.id ?? ''); setError('') } }, e => { if (live) setError(e.message) }); return () => { live = false } }, [state])
 const definition = reports.find(r => r.id === selected), creator = definition?.createdBy === state.me.email && state.me.role !== 'viewer'
 const saved = async (id: string) => { setSelected(id); setEdit(null); await refresh() }
 return <><section className="card"><h2>Saved reports</h2>{state.me.role !== 'viewer' && <button className="quiet" type="button" onClick={() => setEdit('new')}>Build report</button>}{error && <p role="alert" className="error">{error}</p>}
  {!!reports.length && <label>Saved report<select aria-label="Saved report" value={selected} onChange={e => { setSelected(e.target.value); setEdit(null) }}>{reports.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
  {!reports.length && <p>No saved reports are available.</p>}
  {creator && definition && <div className="row"><button className="quiet" type="button" onClick={() => setEdit('edit')}>Edit report</button><Action kind="danger" label="Delete report" confirm={`Delete ${definition.name}?`} run={async () => { await command('report-delete', { id: definition.id, revision: definition.revision }); await saved('') }} /></div>}
 </section>
 <OfficeReports report={definition} />
 {edit && <ReportEditor key={`${edit}:${definition?.id}:${definition?.revision}`} state={state} definition={edit === 'new' ? null : definition ?? null} saved={saved} cancel={() => setEdit(null)} />}
 {definition && <section className="card"><h2>{definition.name}</h2><SavedReportPanel key={`${definition.id}:${definition.revision}`} id={definition.id} /></section>}
 {state.me.role === 'finance' && <ReportSchedules state={state} reports={reports} />}
 </>
}
