import { useDate } from './shared'
import { useState } from 'react'
import type { Shared } from './app'
import { MetricTasks } from './metric-tasks'
import { PlanningCalendar } from './calendar'
import { Notifications } from './notifications'
import { Action, command, Field, Form, monthLabel, Person, Table, type D } from './shared'
import { Dots } from './dots'

/** Department submissions for the working budget, then approval. */
export function Cycle({ state, refresh }: Shared) {
 const displayDate = useDate()
 const me = state.me
 const budgets = state.scenarios.filter((s: D) => s.kind === 'budget')
 const [selected, setSelected] = useState('')
 const budget = budgets.find((s: D) => s.id === selected) ?? budgets[0]
 if (!budget) return <section className="card"><p>No budget yet.</p></section>
 const subs = state.submissions.filter((s: D) => s.scenario === budget.id)
 const deptName = (d: string) => state.departments.find((x: D) => x.id === d)?.name ?? '—'
 const mine = (d: string) => me.role === 'finance' || me.departments.includes(d)
 const act = (op: string, body: D) => async () => { await command(op, { scenario: budget.id, ...body }); await refresh() }
 const waiting = subs.filter((s: D) => s.status !== 'submitted')
 return <>
  {budgets.length > 1 && <label className="inline">Budget<select aria-label="Budget" value={budget.id} onChange={e => setSelected(e.target.value)}>{budgets.map((b: D) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
  <section className="card">
   <h2>{budget.name}</h2>
   <p>{budget.status === 'frozen' ? <>Approved by <Person state={state} email={budget.approval.by} /> at <span className="date-token">{displayDate(budget.approval.at)}</span> (revision {budget.approval.revision}). The approved numbers are kept exactly as approved.</> : <Dots>Working{`revision ${budget.revision}`}</Dots>}</p>
   {me.role === 'finance' && budget.status === 'working' && <Form submit="Request submissions" onSubmit={async v => { await command('request-submissions', { scenario: budget.id, departments: v.departments, due: v.due }); await refresh() }}>
    <Field label="Departments" name="departments" multiple options={state.departments.filter((d: D) => !d.shared).map((d: D) => ({ value: d.id, label: d.name }))} />
    <Field label="Due date" name="due" type="date" required={false} />
   </Form>}
   <Table caption="Department submissions" heads={['Department', 'Status', 'Due', 'Last change', '']}>
    {subs.map((s: D) => { const last = s.history[s.history.length - 1]; return <tr key={s.id}><td>{deptName(s.department)}</td><td><span className="pill">{s.status}</span></td><td><span className="date-token">{displayDate(s.due)}</span></td><td className="wrap"><Dots><Person state={state} email={last.by} /><><span className="date-token">{displayDate(last.at)}</span>{last.reason ? ` — ${last.reason}` : ''}</></Dots></td><td>
     {budget.status === 'working' && me.role === 'contributor' && me.departments.includes(s.department) && s.status !== 'submitted' && <Action label={`Submit ${deptName(s.department)}`} run={act('submit', { department: s.department })} />}
     {budget.status === 'working' && me.role === 'finance' && s.status === 'submitted' && <Form className="row" submit="Return" onSubmit={async v => { await command('return-submission', { scenario: budget.id, department: s.department, reason: v.reason }); await refresh() }}><Field label="Reason to return" name="reason" /></Form>}
    </td></tr> })}
   </Table>
   {me.role === 'finance' && budget.status === 'working' && <div className="row">
    {waiting.length > 0 && <span className="muted">Waiting for {waiting.map((s: D) => deptName(s.department)).join(', ')}.</span>}
    <Action label={`Approve and freeze revision ${budget.revision}`} confirm="Approve this exact revision? It will be frozen and the forecast opens from it." run={async () => { await command('approve-budget', { scenario: budget.id, revision: budget.revision }); await refresh() }} />
   </div>}
  </section>
  <section className="card">
   <h2>Comments</h2>
   <ul className="plain">{state.comments.filter((c: D) => c.scenario === budget.id).map((c: D) => <li key={c.id}><Dots><strong>{deptName(c.department)}</strong><><span title={c.author}>{c.authorName}</span> (<span className="date-token">{displayDate(c.at)}</span>, revision {c.revision}): {c.text}</></Dots></li>)}</ul>
   {me.role !== 'viewer' && <Form submit="Add comment" onSubmit={async (v, form) => { await command('comment', { scenario: budget.id, department: v.department, text: v.text }); form.reset(); await refresh() }}>
    <Field label="Department" name="department" options={state.departments.filter((d: D) => mine(d.id)).map((d: D) => ({ value: d.id, label: d.name }))} />
    <Field label="Comment" name="text" type="textarea" />
   </Form>}
  </section>
  {budget.status === 'frozen' && <section className="card"><h2>After approval</h2>{budget.alternativeBudget ? <p>This alternative budget opened its own forecast, available in Plan and Overview. The operating budget, monthly review and metric rules are unchanged.</p> : <p>The operating forecast opened from this approved budget. Close months with actuals under Review; prior forecasts are kept at each close.</p>}</section>}
  {me.role !== 'viewer' && <PlanningCalendar state={state} />}
  {me.role !== 'viewer' && <Notifications state={state} />}
  {me.role !== 'viewer' && <MetricTasks state={state} />}
 </>
}
