import { useEffect, useState } from 'react'
import { Action, api, command, Field, Form, money, monthLabel, type D } from './shared'

const KINDS = [{ value: 'hire-start', label: 'Delay a hire (months)' }, { value: 'spend-cut', label: 'Cut spend (percent)' }, { value: 'collection-days', label: 'Collect a contract sooner (days)' }]
const field = { 'hire-start': 'position', 'spend-cut': 'expense', 'collection-days': 'revenue' } as const

/** Finance reads the decision items the constraint watch opened, marks adjustable levers and asks for responses. */
export function ConstraintWatch({ state, forecast, refresh }: { state: D; forecast: D; refresh: () => Promise<unknown> }) {
 const [view, setView] = useState<D | null>(null), [inputs, setInputs] = useState<D | null>(null), [kind, setKind] = useState('hire-start'), [error, setError] = useState('')
 const currency = state.workspace.currency
 const load = async () => { setError(''); try { setView(await api('constraints')); setInputs((await api(`scenario/${forecast.id}`)).inputs) } catch (e) { setError((e as Error).message) } }
 useEffect(() => { void load() }, [forecast.id, forecast.revision])
 const candidates = (inputs?.[field[kind as keyof typeof field]] ?? []).filter((r: D) => kind !== 'collection-days' || r.kind === 'contract').filter((r: D) => kind !== 'spend-cut' || ['recurring', 'one-off'].includes(r.kind))
 if (!view && !error) return null
 return <section className="card" aria-label="Constraint watch">
  <h2>Constraint watch</h2>
  <p className="muted">After every refresh, close and promoted change the agent checks the agreed cash floor and runway minimum. A breach opens one decision item naming the crossing month, the gap and the input changes behind it. Responses use only the levers you mark adjustable here, are recalculated before they are offered and arrive as draft proposals; nothing changes until you submit and promote one.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {view && <>
   {view.items.length === 0 && <p>No decision items: the forecast keeps every agreed constraint.</p>}
   {view.items.map((item: D) => <div key={item.id} className="pack" aria-label={`Decision item ${item.constraint}`}>
    <h3>{item.constraint === 'cash-floor' ? 'Cash floor' : 'Runway minimum'} · {item.status}</h3>
    <p>{item.summary}</p>
    {item.causes?.changes?.length > 0 && <><p className="muted">Input changes since {item.causes.reference}:</p><ul className="plain">{item.causes.changes.slice(0, 8).map((c: D) => <li key={`${c.kind}:${c.origin}`}>{c.name} · {c.change}{c.fields.slice(0, 3).map((f: D) => ` · ${f.field} ${f.from ?? '—'} → ${f.to ?? '—'}`).join('')}</li>)}</ul></>}
    {item.status === 'open' && !item.responses?.length && <>
     <Action label="Find responses" run={async () => { await command('constraint-respond', { item: item.id, revision: forecast.revision }); await load(); await refresh() }} />
    </>}
    {item.responses?.length > 0 && <><p className="muted">Draft proposals bound to forecast revision {item.forecastRevision} (promote one under Scenarios, or reject them all):</p>
     <ul className="plain">{item.responses.map((r: D) => <li key={r.proposal}>{r.changes.join('; ')} — lowest cash {money(r.newLowestCash.closingCents, currency)} in {monthLabel(r.newLowestCash.month)}; revenue forgone {money(r.cost.revenueForgoneCents, currency)}</li>)}</ul></>}
    {item.status === 'open' && item.responses?.length > 0 && <Form submit="Reject every response" onSubmit={async (v, form) => { await command('constraint-reject', { item: item.id, reason: v.reason }); form.reset(); await load(); await refresh() }}><Field label="Reason for rejecting every response" name="reason" /></Form>}
   </div>)}
   <h3>Adjustable levers</h3>
   {view.levers.length === 0 && <p className="muted">None marked: the agent changes nothing it was not allowed to.</p>}
   <ul className="plain">{view.levers.map((l: D) => <li key={l.id}>{l.label} · up to {l.max} {l.kind === 'hire-start' ? 'months' : l.kind === 'spend-cut' ? 'percent' : 'days'} <Action kind="quiet" label={`Remove ${l.label}`} run={async () => { await command('lever-delete', { id: l.id }); await load() }} /></li>)}</ul>
   <Form key={kind} submit="Mark adjustable" onSubmit={async (v, form) => { await command('lever-save', { kind, scenario: forecast.id, origin: v.origin, max: v.max }); form.reset(); await load() }}>
    <label>Lever<select aria-label="Lever kind" value={kind} onChange={e => setKind(e.target.value)}>{KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
    <Field label="Input" name="origin" options={candidates.map((r: D) => ({ value: r.originId, label: kind === 'hire-start' ? `${r.title} (starts ${monthLabel(r.start)})` : r.name }))} />
    <Field label="Largest change" name="max" hint="Months, percent or days, as the lever kind says." />
   </Form>
  </>}
 </section>
}
