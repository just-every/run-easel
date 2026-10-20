import { useDate } from './shared'
import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { ReforecastComparison } from './reforecast-comparison'
import { ParallelMonth } from './parallel-month'
import { DepartmentStatements } from './department-statements'
import { PackActionDepartment } from './pack-action-departments'
import { Action, addMonths, api, command, Field, Form, money, monthLabel, Person, Table, type D } from './shared'

/** Closing months, variance explanations and review packs. */
export function Review({ state, refresh }: Shared) {
 const displayDate = useDate()
 const me = state.me
 const currency = state.workspace.currency
 const forecast = state.scenarios.find((s: D) => s.kind === 'forecast' && !s.alternativeBudget)
 const closedMonths: string[] = []
 if (forecast?.actualsThrough) for (let m = state.workspace.planStart; m <= forecast.actualsThrough; m = addMonths(m, 1)) closedMonths.push(m)
 const [month, setMonth] = useState(() => {
  const remembered = typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('reviewMonth')
  return remembered && closedMonths.includes(remembered) ? remembered : closedMonths[closedMonths.length - 1] ?? ''
 })
 const [v, setV] = useState<D | null>(null)
 const [error, setError] = useState('')
 useEffect(() => { let live = true; setV(null); setError(''); if (month) api(`variance/${month}`).then(v => { if (live) setV(v) }, e => setError(e.message)); return () => { live = false } }, [month, state])
 useEffect(() => { if (!month && closedMonths.length) setMonth(closedMonths[closedMonths.length - 1]) }, [forecast?.actualsThrough])
 useEffect(() => { if (month) { const url = new URL(window.location.href); url.searchParams.set('reviewMonth', month); window.history.replaceState(window.history.state, '', url) } }, [month])
 const next = forecast ? (forecast.actualsThrough ? addMonths(forecast.actualsThrough, 1) : state.workspace.planStart) : ''
 const reviewState = { ...state, actorNames: { ...state.actorNames, ...v?.actorNames } }
 const packs = state.packs.filter((p: D) => !month || p.month === month)
 return <>
  <section className="card">
   <h2>Monthly review</h2>
   {v && <p><a href={`/api/easel/variance/${month}/document.xlsx`} download>Download variances (Excel)</a></p>}
   {!forecast && <p>The forecast opens when the budget is approved.</p>}
   {forecast && <p className="muted">{forecast.name} · revision {forecast.revision} · actuals through {monthLabel(forecast.actualsThrough)}</p>}
   {forecast && <p className="muted">Forecast through {monthLabel(addMonths(state.workspace.planStart, (forecast.horizon ?? state.workspace.horizon) - 1))}{forecast.rollingWindow ? ` · always ${forecast.rollingWindow} months ahead` : ' · fixed horizon'}. Approved budgets keep their original months.</p>}
   {forecast && me.role === 'finance' && <Form key={`window-${forecast.revision}`} submit="Save rolling window" onSubmit={async values => { await command('forecast-window', { scenario: forecast.id, revision: forecast.revision, months: values.months }); await refresh() }}>
    <Field label="Months ahead" name="months" defaultValue={String(forecast.rollingWindow ?? 18)} hint="12 to 60 future months. Each close keeps the current forecast, then extends its end by one month using its drivers." />
   </Form>}
   <div className="row spread">
   {forecast && me.role === 'finance' && <Action label={`Close ${monthLabel(next)}`} confirm={`Replace the plan for ${monthLabel(next)} with accepted actuals? The current forecast is kept first.`} run={async () => { await command('close-month', { scenario: forecast.id, month: next }); setMonth(next); await refresh() }} />}
   {closedMonths.length > 0 && <label className="inline">Month<select aria-label="Month" value={month} onChange={e => setMonth(e.target.value)}>{closedMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>}
   </div>
   {error && <p role="alert" className="error">{error}</p>}
  </section>
  {v && <section className="card">
   <h2>Variances, {v.label}</h2>
   <p className="muted">Against the approved budget (revision {v.budget.revision}, approved by <span title={v.budget.approvedBy?.email}>{v.budget.approvedBy?.name ?? <Person state={state} email={v.budget.approvedBy?.email} />}</span>) and the forecast kept before the month closed. Drafts cite accepted rows; anything else is marked as a hypothesis.</p>
   <div className="variance-head" aria-hidden="true"><span>Line</span><span>Actual</span><span>Budget</span><span>Variance</span><span className="variance-prior">Prior forecast</span><span>Explanation</span></div>
   {v.rows.map((r: D) => <details key={r.key} className="card-row">
    <summary className="variance-summary"><strong className="variance-line">{r.lineName} · {r.departmentName}</strong><span className="variance-number"><small>Actual</small>{money(r.actual, currency)}</span><span className="variance-number"><small>Budget</small>{money(r.budget, currency)}</span><span className={`variance-number${r.favourable === false ? ' variance-unfavourable' : ''}`} aria-label={`Variance ${money(r.variance, currency)}${r.favourable === null ? '' : r.favourable ? ', favourable' : ', unfavourable'}`}><small>Variance</small>{money(r.variance, currency)}</span><span className="variance-number variance-prior">{money(r.priorForecast, currency)}</span><span className="variance-status">{r.explanation ? <span className="pill">explanation {r.explanation.status}</span> : <span className="muted">No explanation</span>}</span></summary>
    <p className="trace">{r.draft}</p>
    {r.citations.length > 0 && <Table caption="Accepted rows" heads={['File', 'Line', 'Date', 'Description', 'Reference', 'Amount']}>{r.citations.map((c: D, i: number) => <tr key={i}><td>{c.file}</td><td className="num">{c.line}</td><td><span className="date-token">{displayDate(c.date)}</span></td><td>{c.description}</td><td>{c.reference}</td><td className="num">{money(c.amount, currency)}</td></tr>)}</Table>}
    {r.explanation && <p><strong>Explanation ({r.explanation.status}{r.explanation.confirmedBy && <> by <Person state={reviewState} email={r.explanation.confirmedBy} /></>}):</strong> {r.explanation.text}</p>}
    {(me.role === 'finance' || me.departments.includes(r.department)) && <>
     <Form key={`${r.key}-${r.explanation?.at ?? ''}`} submit="Save explanation" onSubmit={async x => { await command('explanation', { month: v.month, line: r.line, department: r.department, text: x.text }); await refresh() }}>
      <Field label={`Explanation for ${r.lineName} · ${r.departmentName}`} name="text" type="textarea" defaultValue={r.explanation?.text ?? ''} />
     </Form>
     {r.explanation && r.explanation.status !== 'confirmed' && <Action label="Confirm explanation" run={async () => { await command('explanation-confirm', { month: v.month, line: r.line, department: r.department }); await refresh() }} />}
    </>}
   </details>)}
  </section>}
  {v?.versions && <ReforecastComparison versions={v.versions} rows={v.rows} currency={currency} />}
  {(me.role === 'finance' || me.role === 'contributor') && closedMonths.includes(month) && <DepartmentStatements state={state} month={month} setMonth={setMonth} refresh={refresh} />}
  {me.role === 'finance' && closedMonths.includes(month) && <ParallelMonth key={month} state={state} month={month} />}
  <section className="card">
   <h2>Review packs</h2>
   {me.role === 'finance' && month && !packs.some((p: D) => p.status === 'draft') && <Action label={`Start the ${monthLabel(month)} pack`} run={async () => { await command('pack-create', { month }); await refresh() }} />}
   {packs.map((p: D) => <div key={p.id} className="pack">
    <h3>{p.title} · {p.status}</h3>
    {p.decisions.length > 0 && <ul className="plain">{p.decisions.map((d: D) => <li key={d.id}>{d.text}{d.owner ? ` — ${d.owner}` : ''}{d.due && <>, due <span className="date-token">{displayDate(d.due)}</span></>}{p.progress?.[d.id] ? ` (${p.progress[d.id].status})` : ''}
     {p.status === 'published' && me.role === 'finance' && p.progress?.[d.id]?.status !== 'done' && <Action kind="quiet" label="Mark done" run={async () => { await command('action-status', { pack: p.id, decision: d.id, status: 'done' }); await refresh() }} />}
     <PackActionDepartment state={state} pack={p} decision={d} refresh={refresh} /></li>)}</ul>}
    {p.status === 'draft' && me.role === 'finance' && <>
     <Form submit="Record decision" onSubmit={async (x, form) => { await command('pack-decision', { pack: p.id, ...x }); form.reset(); await refresh() }}>
      <Field label="Decision or action" name="text" />
      <Field label="Owner" name="owner" required={false} />
      <Field label="Due" name="due" type="date" required={false} />
      <Field label="Department" name="department" required={false} defaultValue="" options={state.departments.map((d: D) => ({ value: d.id, label: d.name }))} />
     </Form>
     <Action label="Publish pack" confirm="Publish this pack? Its numbers, explanations and decisions are fixed once published." run={async () => { await command('pack-publish', { pack: p.id }); await refresh() }} />
    </>}
    {p.status === 'published' && <p>Published by <Person state={state} email={p.publishedBy} /> at <span className="date-token">{displayDate(p.publishedAt)}</span> · <a href={`/api/easel/pack/${p.id}/document.html`} download>Download pack (HTML)</a> · <a href={`/api/easel/pack/${p.id}/document.csv`} download>Download pack (CSV)</a> · <a href={`/api/easel/pack/${p.id}/document.xlsx`} download>Download pack (Excel)</a></p>}
   </div>)}
   {!packs.length && <p className="muted">No packs for this month yet.</p>}
  </section>
 </>
}
