import { SavedReportPanel } from './saved-reports'
import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { ClosingCashChart } from './chart'
import { Action, api, command, decimalText, Field, Form, money, monthLabel, options, Person, Table, type D } from './shared'
import { Dots, glue } from './dots'

type Metric = 'runway' | 'arr' | 'headcount' | 'revenue' | 'grossMargin' | 'burn' | 'closingCash'
type Display = 'tile' | 'chart' | 'table'
type Widget = { metric: Metric; display: Display }
const metrics: Record<Metric, string> = { runway: 'Runway', arr: 'ARR', headcount: 'Headcount', revenue: 'Revenue', grossMargin: 'Gross margin', burn: 'Net burn', closingCash: 'Closing cash' }
const metricOptions = Object.entries(metrics).map(([value, label]) => ({ value, label }))
const displays: Display[] = ['tile', 'chart', 'table']
const audiences = [{ value: 'private', label: 'Private' }, { value: 'leadership', label: 'Leadership' }, { value: 'board', label: 'Board' }, { value: 'department', label: 'Department' }]

function basis(row: D, metric: Metric) {
 if (metric === 'arr') return row.arrBasis
 if (['runway', 'burn', 'closingCash'].includes(metric)) {
  return ({ 'not-burning': 'Not burning', 'cash-exhausted': 'Cash exhausted', 'trailing-net-burn': 'Closing cash ÷ trailing average net burn', 'Company cash only': 'Company cash unavailable in a department view' } as Record<string, string>)[row.runwayBasis] ?? row.runwayBasis
 }
 return ''
}
function valueText(row: D, metric: Metric, currency: string) {
 const value = row[metric]
 if (value === null || value === undefined) return basis(row, metric) || 'Unavailable'
 if (metric === 'headcount') return `${value.toLocaleString()} people`
 if (metric === 'runway') return `${decimalText(value)} months`
 return money(value, currency)
}

/** Dashboard charts preserve the established chart styles and show missing months as gaps. */
function MetricChart({ rows, metric, currency }: { rows: D[]; metric: Metric; currency: string }) {
 const complete = rows.every(row => row[metric] !== null && row[metric] !== undefined)
 if (complete && metric !== 'runway' && metric !== 'headcount') return <ClosingCashChart label={`${metrics[metric]} by month`} title={metrics[metric]} months={rows.map(r => r.month)} series={[{ name: metrics[metric], values: rows.map(r => r[metric]) }]} currency={currency} axis="quarters" ticks />
 const values = rows.map(r => r[metric]).filter((v): v is number => typeof v === 'number')
 if (!values.length) return <p>{rows.length ? basis(rows[rows.length - 1], metric) || 'No values available.' : 'No months available.'}</p>
 const low = Math.min(0, ...values), high = Math.max(1, ...values)
 const x = (i: number) => rows.length < 2 ? 50 : 3 + i * 94 / (rows.length - 1)
 const y = (v: number) => 95 - (v - low) * 85 / (high - low)
 const segments: string[][] = [[]]
 rows.forEach((row, i) => { if (typeof row[metric] !== 'number') segments.push([]); else segments[segments.length - 1].push(`${x(i)},${y(row[metric])}`) })
 return <figure className="cc cc-app cc-axis-ends"><figcaption className="cc-head"><span className="cc-title">{metrics[metric]}</span><span>{valueText({ [metric]: high }, metric, currency)} maximum</span></figcaption><div className="cc-frame"><div className="cc-plot">
  <svg className="cc-lines" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${metrics[metric]} by month; exact values in the table below`}><title>{metrics[metric]} by month</title>{segments.filter(s => s.length > 1).map((segment, i) => <polyline key={i} className="cc-line" points={segment.join(' ')} vectorEffect="non-scaling-stroke" />)}</svg>
  {rows.map((row, i) => typeof row[metric] === 'number' && <i key={row.month} className="cc-dot" aria-hidden="true" style={{ left: `${x(i)}%`, top: `${y(row[metric])}%` }} />)}
 </div><div className="cc-axis"><span className="cc-axis-start" style={{ left: '0%' }}>{monthLabel(rows[0]?.month)}</span><span className="cc-axis-end" style={{ left: '100%' }}>{monthLabel(rows[rows.length - 1]?.month)}</span></div></div></figure>
}

function MetricTable({ rows, metric, currency }: { rows: D[]; metric: Metric; currency: string }) {
 return <Table caption={`${metrics[metric]} by month`} heads={['Month', metrics[metric], ...(metric === 'arr' || ['runway', 'burn', 'closingCash'].includes(metric) ? ['Basis'] : [])]}>{rows.map(row => <tr key={row.month}><th scope="row">{monthLabel(row.month)}</th><td className="num">{valueText(row, metric, currency)}</td>{(metric === 'arr' || ['runway', 'burn', 'closingCash'].includes(metric)) && <td className="wrap">{basis(row, metric)}</td>}</tr>)}</Table>
}

function WidgetControls({ widgets, setWidgets, remove = false }: { widgets: Widget[]; setWidgets: (widgets: Widget[]) => void; remove?: boolean }) {
 const move = (index: number, step: number) => { const next = [...widgets]; [next[index], next[index + step]] = [next[index + step], next[index]]; setWidgets(next) }
 return <div className="wide"><Table caption={remove ? 'Configured dashboard widgets' : 'My widget layout'} heads={['Metric', 'Display', 'Order', ...(remove ? [''] : [])]}>{widgets.map((widget, index) => <tr key={widget.metric}><th scope="row">{metrics[widget.metric]}</th><td><select aria-label={`${metrics[widget.metric]} display`} value={widget.display} onChange={e => setWidgets(widgets.map((w, i) => i === index ? { ...w, display: e.target.value as Display } : w))}>{displays.map(display => <option key={display} value={display}>{display[0].toUpperCase() + display.slice(1)}</option>)}</select></td><td><button type="button" className="quiet" disabled={index === 0} aria-label={`Move ${metrics[widget.metric]} up`} onClick={() => move(index, -1)}>Up</button> <button type="button" className="quiet" disabled={index === widgets.length - 1} aria-label={`Move ${metrics[widget.metric]} down`} onClick={() => move(index, 1)}>Down</button></td>{remove && <td><button type="button" className="quiet" aria-label={`Remove ${metrics[widget.metric]}`} onClick={() => setWidgets(widgets.filter((_, i) => i !== index))}>Remove</button></td>}</tr>)}</Table></div>
}

function DefinitionEditor({ state, definition, saved, cancel }: { state: D; definition: D | null; saved: (id?: string) => Promise<void>; cancel: () => void }) {
 const scenarios = state.scenarios.filter((s: D) => s.kind !== 'proposal' && !s.sandbox)
 const [widgets, setWidgets] = useState<Widget[]>(definition?.widgets ?? [])
 const [audience, setAudience] = useState(definition?.audience ?? 'private')
 const [add, setAdd] = useState('')
 return <section className="card"><h2>{definition ? 'Edit and share dashboard' : 'Create dashboard'}</h2><Form submit={definition ? 'Save dashboard definition' : 'Create dashboard'} onSubmit={async v => {
  if (!widgets.length) throw new Error('Add at least one metric widget.')
  if (!scenarios.some((s: D) => s.id === v.scenario)) throw new Error('Choose an available scenario.')
  if (audience === 'department' && !v.department) throw new Error('Choose the department that can read this dashboard.')
  const result = await command('dashboard-save', { ...(definition ? { id: definition.id, revision: definition.revision } : {}), name: v.name, scenario: v.scenario, department: v.department || '', audience, widgets })
  await saved(result.id ?? result.dashboard?.id)
 }}>
  <Field label="Dashboard name" name="name" defaultValue={definition?.name} />
  <Field label="Source scenario" name="scenario" defaultValue={definition?.scenario} options={options(scenarios)} />
  <label>Audience<select name="audience" aria-label="Audience" value={audience} onChange={e => setAudience(e.target.value)}>{audiences.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></label>
  <Field label="Department" name="department" defaultValue={definition?.department} required={audience === 'department'} options={[{ value: '', label: 'Company-wide' }, ...options(state.departments)]} hint="A department view does not include company cash, burn or runway." />
  <p className="muted wide">Private dashboards are visible to their creator. Sharing follows each reader’s current workspace access.</p>
  <div className="row wide"><label>Add metric<select aria-label="Add metric" value={add} onChange={e => setAdd(e.target.value)}><option value="">Choose…</option>{metricOptions.filter(m => !widgets.some(w => w.metric === m.value)).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label><button className="quiet" type="button" disabled={!add} onClick={() => { setWidgets([...widgets, { metric: add as Metric, display: 'tile' }]); setAdd('') }}>Add widget</button></div>
  <WidgetControls widgets={widgets} setWidgets={setWidgets} remove />
  <button type="button" className="quiet" onClick={cancel}>Cancel</button>
 </Form></section>
}

export function Dashboards({ state, refresh }: Shared) {
 const [list, setList] = useState<D[] | null>(null)
 const [selected, setSelected] = useState('')
 const [view, setView] = useState<D | null>(null)
 const [widgets, setWidgets] = useState<Widget[]>([])
 const [error, setError] = useState('')
 const [reload, setReload] = useState(0)
 const [editor, setEditor] = useState<'new' | 'edit' | null>(null)
 useEffect(() => { let live = true; setError(''); api('dashboards').then((dashboards: D[]) => { if (!live) return; setList(dashboards); setSelected(current => dashboards.some(d => d.id === current) ? current : dashboards[0]?.id ?? '') }, e => { if (live) { setError(e.message); setList(null); setView(null) } }); return () => { live = false } }, [state, reload])
 useEffect(() => { let live = true; setView(null); setWidgets([]); setError(''); if (selected) api(`dashboards/${encodeURIComponent(selected)}`).then(v => { if (live) { setView(v); setWidgets(v.widgets) } }, e => { if (live) setError(e.message) }); return () => { live = false } }, [selected, state, reload])
 const changed = async (id?: string) => { setEditor(null); if (id) setSelected(id); setReload(n => n + 1); await refresh() }
 const definition = view?.dashboard
 const creator = state.me.role === 'finance' && definition?.createdBy === state.me.email
 const dirty = !!view && JSON.stringify(widgets) !== JSON.stringify(view.widgets)
 return <>
  <section className="card"><h2>Dashboards</h2>
   {state.me.role === 'finance' && <button type="button" className="quiet" onClick={() => setEditor('new')}>Create dashboard</button>}
   {error && <p role="alert" className="error">{error}</p>}
   {!list && !error && <p role="status">Loading dashboards…</p>}
   {list?.length === 0 && <p>No dashboards are shared with you yet.{state.me.role === 'finance' ? ' Create one from a planning scenario.' : ''}</p>}
   {!!list?.length && <label>Dashboard<select aria-label="Dashboard" value={selected} onChange={e => { setSelected(e.target.value); setEditor(null) }}>{list.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
   <Action kind="quiet" label="Reload dashboards" run={async () => { setEditor(null); setReload(n => n + 1) }} />
  </section>
  {editor && (editor === 'new' || creator) && <DefinitionEditor key={editor === 'new' ? 'new' : `${definition.id}:${definition.revision}`} state={state} definition={editor === 'new' ? null : definition} saved={changed} cancel={() => setEditor(null)} />}
  {selected && !view && !error && <section className="card"><p role="status">Loading dashboard…</p></section>}
  {view && <>
   <section className="card"><h2>{definition.name}</h2><Dots as="p">{glue(view.scenarioName)}{view.departmentName || 'Company-wide'}{audiences.find(a => a.value === definition.audience)?.label}{`Revision ${definition.revision}`}</Dots><p>Created by <Person state={state} email={definition.createdBy} /></p>
    {creator && <div className="row"><button type="button" className="quiet" onClick={() => setEditor('edit')}>Edit and share</button><Action kind="danger" label="Delete dashboard" confirm={`Delete ${definition.name} for everyone who can read it?`} run={async () => { await command('dashboard-delete', { id: definition.id, revision: definition.revision }); setView(null); await changed() }} /></div>}
    <p><a href={`/api/easel/dashboards/${encodeURIComponent(definition.id)}/document.xlsx`} download>Download dashboard (Excel)</a></p>
    {definition.report && <p><a href={`/api/easel/dashboards/${encodeURIComponent(definition.id)}/report.xlsx`} download>Download saved report (Excel)</a></p>}
    {view.blocked && <p role="alert" className="error">{view.blocked}</p>}
    {definition.department && <p>Company cash, burn and runway are unavailable in this department view.</p>}
    <details><summary>Arrange my dashboard</summary><p>Choose the order and display for your own view. The shared definition stays available to every reader.</p><WidgetControls widgets={widgets} setWidgets={setWidgets} /><Action label="Save my layout" run={async () => { await command('dashboard-layout', { dashboard: definition.id, revision: view.layoutRevision, definitionRevision: definition.revision, widgets }); await changed(definition.id) }} />{dirty && <p role="status">You have unsaved layout changes.</p>}</details>
   </section>
   {definition.report && <section className="card"><h2>Saved report</h2><SavedReportPanel key={`${definition.id}:${definition.revision}`} id={definition.id} /></section>}
   {!view.blocked && widgets.map(widget => <section className="card" key={widget.metric}><h2>{metrics[widget.metric]}</h2>
    {widget.metric === 'arr' && <p className="muted">Accepted billing uses the end-month recurring run rate × 12. Other open months use planned recurring revenue; a closed month needs a classified billing observation.</p>}
    {widget.metric === 'grossMargin' && <p className="muted">Revenue less cost of sales, in {view.currency}.</p>}
    {widget.metric === 'runway' && <p className="muted">Closing cash divided by the current and up to two preceding months’ average net burn.</p>}
    {!view.rows.length ? <p>No months are available for this scenario.</p> : widget.display === 'tile' ? <><p className="lead">{valueText(view.rows[view.rows.length - 1], widget.metric, view.currency)}</p><Dots as="p">{monthLabel(view.rows[view.rows.length - 1].month)}{basis(view.rows[view.rows.length - 1], widget.metric)}</Dots></> : <>{widget.display === 'chart' && <MetricChart rows={view.rows} metric={widget.metric} currency={view.currency} />}<MetricTable rows={view.rows} metric={widget.metric} currency={view.currency} /></>}
   </section>)}
  </>}
 </>
}
