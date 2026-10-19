import { useEffect, useState } from 'react'
import { api, command, decimalText, Field, Form, money, monthLabel, Table, type D } from './shared'

/** Annual strategy alongside the scenario comparison, using the existing form
 * and scrollable statement components. No position-level inputs are needed. */
export function LongRange({ state, refresh }: { state: D; refresh: () => Promise<void> }) {
 const [plans, setPlans] = useState<D[]>([]), [selected, setSelected] = useState('')
 const [view, setView] = useState<D | null>(null), [error, setError] = useState('')
 const [years, setYears] = useState(5), [editing, setEditing] = useState(false)
 const budget = state.scenarios.find((s: D) => s.kind === 'budget')
 useEffect(() => { let live = true; api('long-range').then(v => { if (live) { setPlans(v); setSelected(id => v.some((p: D) => p.id === id) ? id : v[0]?.id ?? '') } }, e => { if (live) setError(e.message) }); return () => { live = false } }, [state])
 useEffect(() => { let live = true; setView(null); setError(''); if (selected) api(`long-range/${selected}`).then(v => { if (live) { setView(v); setYears(v.plan.years) } }, e => { if (live) setError(e.message) }); return () => { live = false } }, [selected, state])
 const definition = editing ? view?.plan : null
 const currency = view?.currency ?? state.workspace.currency
 return <section className="card">
  <h2>Long-range plan</h2>
  <p className="muted">Year one follows the operating budget. Later years use annual assumptions. Gaps are plan minus target; negative amounts are shortfalls. Headcount is people at year end.</p>
  {plans.length > 0 && <label>Annual plan<select aria-label="Annual plan" value={selected} onChange={e => { setSelected(e.target.value); setEditing(false) }}>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
  {error && <p role="alert" className="error">{error}</p>}
  {view && <>
   <h3>{view.plan.name}</h3>
   <p>{view.source.name} · revision {view.source.revision} · {view.source.status === 'frozen' ? 'approved, frozen arithmetic' : 'live working budget'}. {view.source.sha256 && <span className="muted">Snapshot SHA-256: <span style={{ overflowWrap: 'anywhere' }}>{view.source.sha256}</span></span>}</p>
   <p><a href={`/api/easel/long-range/${selected}/document.xlsx`} download>Download long-range plan (Excel)</a></p>
   <Table caption="Annual plan and target reconciliation" heads={['Metric', ...view.rows.map((r: D) => <span key={r.year}>Year {r.year}<small style={{ display: 'block', whiteSpace: 'nowrap' }}>{monthLabel(r.start)} – {monthLabel(r.end)}</small></span>)]}>
    {[
     ['Revenue', 'revenue'], ['Operating costs', 'costs'], ['Operating profit', 'profit'], ['Operating margin', 'marginBps'], ['Year-end headcount', 'headcount'], ['Opening cash', 'openingCash'], ['Net cash change', 'cashChange'], ['Year-end cash', 'closingCash'],
     ['Revenue target', 'targetRevenue'], ['Revenue gap', 'revenueGap'], ['Profit target', 'targetProfit'], ['Profit gap', 'profitGap'], ['Headcount target', 'targetHeadcount'], ['Headcount gap', 'headcountGap'], ['Cash target', 'targetCash'], ['Cash gap', 'cashGap'],
    ].map(([label, key]) => <tr key={key}><th scope="row">{label}</th>{view.rows.map((r: D) => <td key={r.year} className="num">{key.toLowerCase().includes('headcount') ? r[key] : key === 'marginBps' ? r[key] === null ? '—' : `${decimalText(r[key])}%` : money(r[key], currency)}</td>)}</tr>)}
   </Table>
   <details><summary>Annual calculation traces</summary><ul>{view.rows.map((r: D) => <li key={r.year}>Year {r.year}: {r.trace}</li>)}</ul></details>
  </>}
  {state.me.role === 'finance' && budget && <>
   {view && <div className="row"><button type="button" className="quiet" onClick={() => { setYears(view.plan.years); setEditing(true) }}>Edit annual assumptions</button><button type="button" className="quiet" onClick={() => { setYears(5); setEditing(false) }}>New long-range plan</button></div>}
   <label>Plan years<select aria-label="Plan years" value={years} onChange={e => setYears(Number(e.target.value))}>{[3, 4, 5].map(y => <option key={y} value={y}>{y} years</option>)}</select></label>
   <Form key={`${editing ? selected : 'new'}-${definition?.revision ?? 0}-${years}`} submit="Save long-range plan" onSubmit={async v => {
    const saved = await command('long-range-save', { ...(definition ? { id: definition.id, revision: definition.revision } : {}), budget: budget.id, budgetRevision: budget.revision, name: v.name, years, priorYearRevenue: v.priorYearRevenue,
     targets: { growthPercent: v.targetGrowth, marginPercent: v.targetMargin, headcount: v.targetHeadcount, cash: v.targetCash },
     drivers: Array.from({ length: years - 1 }, (_, i) => ({ growthPercent: v[`growth${i}`], marginPercent: v[`margin${i}`], headcountChange: v[`headcount${i}`], cashChange: v[`cash${i}`] })),
    })
    setSelected(saved.id); setEditing(true); await refresh()
   }}>
    <Field label="Long-range plan name" name="name" defaultValue={definition?.name} />
    <Field label="Prior-year revenue" name="priorYearRevenue" defaultValue={decimalText(definition?.priorYearRevenueCents)} hint="Revenue for the year before the operating budget; the target grows from this baseline." />
    <Field label="Target annual revenue growth %" name="targetGrowth" defaultValue={decimalText(definition?.targets.growthBps)} />
    <Field label="Target operating margin %" name="targetMargin" defaultValue={decimalText(definition?.targets.marginBps)} />
    <Field label="Target year-end headcount" name="targetHeadcount" defaultValue={definition?.targets.headcount} />
    <Field label="Target year-end cash" name="targetCash" defaultValue={decimalText(definition?.targets.cashCents)} />
    {Array.from({ length: years - 1 }, (_, i) => <fieldset key={i}><legend>Year {i + 2} annual drivers</legend>
     <Field label={`Year ${i + 2} revenue growth %`} name={`growth${i}`} defaultValue={decimalText(definition?.drivers[i]?.growthBps)} />
     <Field label={`Year ${i + 2} operating margin %`} name={`margin${i}`} defaultValue={decimalText(definition?.drivers[i]?.marginBps)} />
     <Field label={`Year ${i + 2} headcount change`} name={`headcount${i}`} defaultValue={definition?.drivers[i]?.headcountChange} />
     <Field label={`Year ${i + 2} net cash change`} name={`cash${i}`} defaultValue={decimalText(definition?.drivers[i]?.cashChangeCents)} hint="Explicit annual cash movement, independent of accounting profit." />
    </fieldset>)}
   </Form>
  </>}
  {!plans.length && state.me.role !== 'finance' && <p>Finance has not saved a long-range plan yet.</p>}
 </section>
}
