import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { api, command, Field, Form, money, Table, useDate, type D } from './shared'
export function WeeklyCash({ state, refresh, scenario, editable }: Pick<Shared, 'state' | 'refresh'> & { scenario: string; editable: boolean }) {
 const [view, setView] = useState<D | null>(null), [start, setStart] = useState(''), [basis, setBasis] = useState('plan'), [error, setError] = useState('')
 const date = useDate()
 useEffect(() => { setBasis('plan'); setStart('') }, [scenario, editable])
 useEffect(() => { let live = true; setView(null); setError(''); api(`weekly-cash/${scenario}?basis=${basis}${start ? `&start=${start}` : ''}`).then(v => { if (live) setView(v) }, e => { if (live) setError(e.message) }); return () => { live = false } }, [scenario, start, basis, state])
 return <section className="card" aria-label="13-week planned cash">
  <h2>13-week planned cash</h2>
  {state.me.role === 'finance' && editable && <label>Cash basis<select aria-label="Weekly cash basis" value={basis} onChange={e => { setBasis(e.target.value); setStart('') }}><option value="plan">Planned opening cash</option><option value="bank">Observed Plaid bank balance</option></select></label>}
  <label>First day<input aria-label="Weekly cash first day" type="date" value={start || view?.start || ''} onChange={e => setStart(e.target.value)} /></label>
  {error && <p role="alert" className="error">{error}</p>}
  {view && !view.available && <p>{view.reason}</p>}
  {view?.available && <>
   <p className="muted">{view.basis}</p>
   <a href={`/api/easel/weekly-cash/${scenario}/document.xlsx?start=${view.start}&basis=${basis}`} download>Download weekly cash Excel</a>
   <Table caption="Weekly planned cash" heads={['Week', 'Opening', 'Collections', 'Payments', 'Adjustment', 'Closing', 'Note']}>
    {view.weeks.map((w: D) => <tr key={w.start}><td>{date(w.start)}–{date(w.end)}{w.assumedDates && <small> · includes assumed dates</small>}</td>{w.available ? <>{['opening', 'collections', 'payments', 'adjustment', 'closing'].map(k => <td className="num" key={k}>{money(w[k], view.currency)}</td>)}<td>{w.note || '—'}</td></> : <td colSpan={6}>Outside the plan horizon; unavailable</td>}</tr>)}
   </Table>
   <h3>Month-end reconciliation</h3>
   <Table caption="Weekly to monthly cash reconciliation" heads={['Period end', 'Monthly forecast', 'Dated schedule', 'Overrides to date', 'Weekly closing', 'Difference']}>
    {view.reconciliation.map((r: D) => <tr key={r.month}><td>{date(r.date)}{r.incomplete && <small> · incomplete source</small>}</td>{['monthly', 'scheduled', 'adjustment', 'weekly', 'difference'].map(k => <td className="num" key={k}>{money(r[k], view.currency)}</td>)}</tr>)}
   </Table>
   {state.me.role === 'finance' && editable && <Form key={`${scenario}-${view.start}`} submit="Save weekly adjustment" onSubmit={async v => { await command('weekly-cash-override', { ...v, scenario }); await refresh() }}>
    <Field label="Week starting" name="start" type="select" options={view.weeks.filter((w: D) => w.available).map((w: D) => ({ value: w.start, label: `${date(w.start)}–${date(w.end)}` }))} />
    <Field label="Cash adjustment" name="adjustment" hint="Signed amount added at week end; replaces this week's prior adjustment." />
    <Field label="Adjustment note" name="note" />
   </Form>}
  </>}
 </section>
}
