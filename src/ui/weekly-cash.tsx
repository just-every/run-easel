import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { api, command, Field, Form, useDate, type D } from './shared'
import { CashSchedule } from './cash-schedule'
import { PantryCashReview } from './pantry-cash'
export function WeeklyCash({ state, refresh, scenario, editable }: Pick<Shared, 'state' | 'refresh'> & { scenario: string; editable: boolean }) {
 const [view, setView] = useState<D | null>(null), [start, setStart] = useState(''), [basis, setBasis] = useState('plan'), [error, setError] = useState(''), [source, setSource] = useState('plan')
 const date = useDate()
 useEffect(() => { setBasis('plan'); setStart(''); setSource('plan') }, [scenario, editable])
 useEffect(() => { let live = true; setView(null); setError(''); api(`weekly-cash/${scenario}?basis=${basis}${start ? `&start=${start}` : ''}`).then(v => { if (live) setView(v) }, e => { if (live) setError(e.message) }); return () => { live = false } }, [scenario, start, basis, state])
 return <section className="card" aria-label="13-week planned cash">
  <h2>13-week planned cash</h2>
  {state.me.role === 'finance' && editable && <label>Cash basis<select aria-label="Weekly cash basis" value={basis} onChange={e => { setBasis(e.target.value); setStart('') }}><option value="plan">Planned opening cash</option><option value="bank">Observed Plaid bank balance</option></select></label>}
  <label>First day<input aria-label="Weekly cash first day" type="date" value={start || view?.start || ''} onChange={e => setStart(e.target.value)} /></label>
  {state.me.role === 'finance' && editable && <label>Cash sources<select aria-label="Weekly cash sources" value={source} onChange={e => setSource(e.target.value)}><option value="plan">Planning schedules</option><option value="pantry">Review Pantry open items with planning schedules</option></select></label>}
  {source === 'pantry' && <PantryCashReview key={`${scenario}-${basis}-${start}-${state.scenarios.find((s: D) => s.id === scenario)?.revision}`} scenario={scenario} basis={basis} start={start} render={combined => <CashSchedule view={combined} />} />}
  {source === 'plan' && error && <p role="alert" className="error">{error}</p>}
  {source === 'plan' && view && !view.available && <p>{view.reason}</p>}
  {source === 'plan' && view?.available && <>
   <a href={`/api/easel/weekly-cash/${scenario}/document.xlsx?start=${view.start}&basis=${basis}`} download>Download weekly cash Excel</a>
   <CashSchedule view={view} />
  </>}
  {view?.available && state.me.role === 'finance' && editable && <Form key={`${scenario}-${view.start}`} submit="Save weekly adjustment" onSubmit={async v => { await command('weekly-cash-override', { ...v, scenario }); await refresh() }}>
    <Field label="Week starting" name="start" type="select" options={view.weeks.filter((w: D) => w.available).map((w: D) => ({ value: w.start, label: `${date(w.start)}–${date(w.end)}` }))} />
    <Field label="Cash adjustment" name="adjustment" hint="Signed amount added at week end; replaces this week's prior adjustment." />
    <Field label="Adjustment note" name="note" />
   </Form>}
 </section>
}
