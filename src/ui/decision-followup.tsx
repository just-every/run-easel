import { useEffect, useState } from 'react'
import { Action, api, command, decimalText, Field, Form, money, monthLabel, Person, Table, useDate, type D } from './shared'

const MEASURES: [string, string][] = [['payroll', 'Payroll'], ['revenue', 'Revenue'], ['cash', 'Closing cash'], ['headcount', 'Headcount'], ['capacityHundredths', 'Capacity (hours)']]
const HISTORY: Record<string, string> = { revised: 'Due date revised', stopped: 'Stopped', 'change-proposed': 'Change proposed', 'change-approved': 'Change approved', 'change-rejected': 'Change rejected' }

/** AGENT-006: published decisions followed through to results, beside the unchanged packs. */
export function DecisionFollowup({ state }: { state: D }) {
 const displayDate = useDate()
 const [view, setView] = useState<D | null>(null), [error, setError] = useState('')
 const load = async () => { try { setView(await api('decisions')); setError('') } catch (e) { setError((e as Error).message) } }
 useEffect(() => { load() }, [state])
 const me = state.me, currency = state.workspace.currency, finance = me.role === 'finance'
 const forecast = state.scenarios.find((s: D) => s.kind === 'forecast' && !s.alternativeBudget)
 const promoted = state.scenarios.filter((s: D) => s.kind === 'proposal' && s.proposalStatus === 'promoted' && s.promotedInto?.scenario === forecast?.id)
 const value = (measure: string, metrics?: D | null) => {
  if (!metrics) return 'Not closed'
  const n = metrics[measure]
  if (n === null || n === undefined) return 'Unavailable'
  return measure === 'headcount' ? String(n) : measure === 'capacityHundredths' ? decimalText(n) : money(n, currency)
 }
 const run = async (op: string, body: D) => { await command(op, body); await load() }
 if (!view && !error) return null
 return <section className="card">
  <h2>Decision follow-up</h2>
  <p className="muted">Open actions owned by a member's email are chased by their notification preference from {view?.chaseDays ?? 3} days before they fall due. Owners revise or stop their own actions with a reason; finance approves any change to a decision. Published packs never change.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {view && !view.decisions.length && <p className="muted">No published decisions yet.</p>}
  {view?.decisions.map((d: D) => {
   const key = `${d.pack}|${d.decision}`, mine = d.owner.trim().toLowerCase() === me.email, follows = finance || mine
   const saving = d.outcome?.payrollSaving
   return <article key={key} className="pack" aria-label={d.text}>
    <h3>{d.text} · {d.status}</h3>
    <p className="muted">{monthLabel(d.month)} pack · owner {d.owner ? <Person state={state} email={d.owner} /> : 'not set'}{d.due && <> · due <span className="date-token">{displayDate(d.due)}</span></>}</p>
    {d.chases.length > 0 && <ul className="plain">{d.chases.map((ch: D, i: number) => <li key={i}>Chased <Person state={state} email={ch.recipient} /> for the <span className="date-token">{displayDate(ch.due)}</span> due date at <span className="date-token">{displayDate(ch.at)}</span> ({ch.zone})</li>)}</ul>}
    {d.history.length > 0 && <ul className="plain">{d.history.map((h: D, i: number) => <li key={i}>{HISTORY[h.kind] ?? h.kind}{h.kind === 'revised' && <> from <span className="date-token">{displayDate(h.from)}</span> to <span className="date-token">{displayDate(h.to)}</span></>} by <Person state={state} email={h.by} />{h.reason ? `: ${h.reason}` : ''}</li>)}</ul>}
    {d.changes.filter((ch: D) => ch.status === 'pending').map((ch: D) => <div key={ch.id} className="card-row">
     <p><strong>Pending change</strong> by <Person state={state} email={ch.by} />: {ch.text || 'cite another promotion'}{ch.proposal && ` (promotion ${state.scenarios.find((s: D) => s.id === ch.proposal)?.name ?? ch.proposal})`} · {ch.reason}</p>
     {finance && <Form key={ch.id} submit="Approve change" onSubmit={values => run('decision-change-decide', { pack: d.pack, decision: d.decision, change: ch.id, approve: true, note: values.note })}>
      <Field label="Decision note" name="note" required={false} />
     </Form>}
     {finance && <Action kind="quiet" label="Reject change" run={() => run('decision-change-decide', { pack: d.pack, decision: d.decision, change: ch.id, approve: false })} />}
    </div>)}
    {d.outcome?.unavailable && <p className="muted">{d.outcome.unavailable}</p>}
    {saving && <>
     <p>Payroll saving: <strong>{money(saving.approved, currency)}</strong> approved{saving.realized === null ? ', not yet realized' : <>; <strong>{money(saving.realized, currency)}</strong> realized against {money(saving.approvedThroughClose, currency)} approved through {monthLabel(d.outcome.actualsThrough)}{saving.complete ? '' : ' (more months to close)'}</>}.</p>
     <Table caption={`Forecast effect: ${d.text}`} heads={['Month', 'Measure', 'Before', 'Approved', 'Realized']}>
      {d.outcome.months.flatMap((e: D) => MEASURES.map(([measure, label]) => <tr key={`${e.month}-${measure}`}><td>{monthLabel(e.month)}</td><td>{label}</td><td className="num">{value(measure, e.before)}</td><td className="num">{value(measure, e.approved)}</td><td className="num">{value(measure, e.closed ? e.realized : null)}</td></tr>))}
     </Table>
     <p className="muted">{d.outcome.basis}</p>
    </>}
    {follows && d.status === 'open' && <>
     <Form key={`${key}-${d.due}`} submit="Revise due date" onSubmit={values => run('action-revise', { pack: d.pack, decision: d.decision, due: values.due, reason: values.reason })}>
      <Field label="New due date" name="due" type="date" defaultValue={d.due} />
      <Field label="Reason for the new date" name="reason" />
     </Form>
     <Form key={`${key}-stop`} submit="Stop action" onSubmit={values => run('action-stop', { pack: d.pack, decision: d.decision, reason: values.reason })}>
      <Field label="Reason to stop" name="reason" />
     </Form>
    </>}
    {follows && <Form key={`${key}-change-${d.changes.length}`} submit="Propose change" onSubmit={values => run('decision-change', { pack: d.pack, decision: d.decision, text: values.text || undefined, proposal: values.proposal || undefined, reason: values.reason })}>
     <Field label="Changed decision" name="text" required={false} />
     {promoted.length > 0 && <Field label="Cite promotion" name="proposal" required={false} options={promoted.map((p: D) => ({ value: p.id, label: p.name }))} />}
     <Field label="Reason for the change" name="reason" />
    </Form>}
   </article>
  })}
 </section>
}
