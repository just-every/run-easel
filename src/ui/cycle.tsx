import type { Shared } from './app'
import { MetricTasks } from './metric-tasks'
import { Action, command, Field, Form, monthLabel, Person, Table, type D } from './shared'

/** Department submissions for the working budget, then approval. */
export function Cycle({ state, refresh }: Shared) {
 const me = state.me
 const budget = state.scenarios.find((s: D) => s.kind === 'budget')
 if (!budget) return <section className="card"><p>No budget yet.</p></section>
 const subs = state.submissions.filter((s: D) => s.scenario === budget.id)
 const deptName = (d: string) => state.departments.find((x: D) => x.id === d)?.name ?? '—'
 const mine = (d: string) => me.role === 'finance' || me.departments.includes(d)
 const act = (op: string, body: D) => async () => { await command(op, { scenario: budget.id, ...body }); await refresh() }
 const waiting = subs.filter((s: D) => s.status !== 'submitted')
 return <>
  <section className="card">
   <h2>{budget.name}</h2>
   <p>{budget.status === 'frozen' ? <>Approved by <Person state={state} email={budget.approval.by} /> at <span className="date-token">{budget.approval.at.slice(0, 19).replace('T', ' ')}</span> (revision {budget.approval.revision}). The approved numbers are kept exactly as approved.</> : `Working · revision ${budget.revision}`}</p>
   {me.role === 'finance' && budget.status === 'working' && <Form submit="Request submissions" onSubmit={async v => { await command('request-submissions', { scenario: budget.id, departments: v.departments, due: v.due }); await refresh() }}>
    <Field label="Departments" name="departments" multiple options={state.departments.filter((d: D) => !d.shared).map((d: D) => ({ value: d.id, label: d.name }))} />
    <Field label="Due date" name="due" type="date" required={false} />
   </Form>}
   <Table caption="Department submissions" heads={['Department', 'Status', 'Due', 'Last change', '']}>
    {subs.map((s: D) => { const last = s.history[s.history.length - 1]; return <tr key={s.id}><td>{deptName(s.department)}</td><td><span className="pill">{s.status}</span></td><td><span className="date-token">{s.due || '—'}</span></td><td className="wrap"><Person state={state} email={last.by} /> · <span className="date-token">{last.at.slice(0, 19).replace('T', ' ')}</span>{last.reason ? ` — ${last.reason}` : ''}</td><td>
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
   <ul className="plain">{state.comments.filter((c: D) => c.scenario === budget.id).map((c: D) => <li key={c.id}><strong>{deptName(c.department)}</strong> · <span title={c.author}>{c.authorName}</span> (<span className="date-token">{c.at.slice(0, 19).replace('T', ' ')}</span>, revision {c.revision}): {c.text}</li>)}</ul>
   {me.role !== 'viewer' && <Form submit="Add comment" onSubmit={async (v, form) => { await command('comment', { scenario: budget.id, department: v.department, text: v.text }); form.reset(); await refresh() }}>
    <Field label="Department" name="department" options={state.departments.filter((d: D) => mine(d.id)).map((d: D) => ({ value: d.id, label: d.name }))} />
    <Field label="Comment" name="text" type="textarea" />
   </Form>}
  </section>
  {budget.status === 'frozen' && <section className="card"><h2>After approval</h2><p>The forecast opened from the approved budget. Close months with actuals under Review; prior forecasts are kept at each close{state.scenarios.find((s: D) => s.kind === 'forecast')?.actualsThrough ? ` (actuals through ${monthLabel(state.scenarios.find((s: D) => s.kind === 'forecast').actualsThrough)})` : ''}.</p></section>}
  {me.role !== 'viewer' && <MetricTasks state={state} />}
 </>
}
