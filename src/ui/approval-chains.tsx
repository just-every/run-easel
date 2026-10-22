import { useEffect, useState } from 'react'
import { Action, api, command, Field, Form, useDate, type D } from './shared'
import type { Shared } from './app'

function ChainEditor({ row, view, reload }: { row: D; view: D; reload: () => Promise<void> }) {
 const current = row.configuration
 const [steps, setSteps] = useState<D[]>(current?.steps.length ? current.steps : [{ name: '', members: [], groups: [] }])
 const update = (i: number, field: string, value: unknown) => setSteps(steps.map((s, n) => n === i ? { ...s, [field]: value } : s))
 return <details><summary>Configure {row.name} approval chain</summary>
  <p>Saving creates the next version. In-flight submissions keep their recorded version until you explicitly restart them. Removing a reviewer ends their authority immediately.</p>
  <Form submit={`Save ${row.name} chain`} onSubmit={async () => { await command('approval-chain-save', { department: row.department, version: current?.version ?? null, steps }); await reload() }}>
   {steps.map((step, i) => <fieldset key={step.id ?? i} style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }}><legend>Step {i + 1}</legend>
    <label>Step {i + 1} name<input aria-label={`Step ${i + 1} name`} value={step.name} required onChange={e => update(i, 'name', e.target.value)} /></label>
    <label>Step {i + 1} people<select aria-label={`Step ${i + 1} people`} multiple value={step.members} onChange={e => update(i, 'members', [...e.target.selectedOptions].map(o => o.value))}>{view.people.map((p: D) => <option key={p.email} value={p.email}>{p.name || p.email}</option>)}</select></label>
    <label>Step {i + 1} groups<select aria-label={`Step ${i + 1} groups`} multiple value={step.groups} onChange={e => update(i, 'groups', [...e.target.selectedOptions].map(o => o.value))}>{view.groups.map((g: D) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    <div className="row">{i > 0 && <button type="button" className="quiet" onClick={() => { const next = [...steps]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setSteps(next) }}>Move step {i + 1} up</button>}{steps.length > 1 && <button type="button" className="quiet" onClick={() => setSteps(steps.filter((_, n) => n !== i))}>Remove step {i + 1}</button>}</div>
   </fieldset>)}
   <button type="button" className="quiet" onClick={() => setSteps([...steps, { name: '', members: [], groups: [] }])}>Add review step</button>
  </Form>
  {!!current?.steps.length && <Action label={`Delete ${row.name} chain`} confirm="Remove the chain for future submissions? In-flight submissions keep their version until explicitly restarted." run={async () => { await command('approval-chain-delete', { department: row.department, version: current.version }); await reload() }} />}
 </details>
}

export function ApprovalChains({ state, refresh, budget }: Pick<Shared, 'state' | 'refresh'> & { budget: D }) {
 const [view, setView] = useState<D | null>(null), [error, setError] = useState(''), date = useDate()
 const read = async () => { try { setView(await api(`approval-chains/${budget.id}`)); setError('') } catch (e) { setError((e as Error).message) } }
 const reload = async () => { await refresh(); await read() }
 useEffect(() => { void read() }, [state, budget.id])
 if (state.me.role === 'viewer') return null
 return <section className="card" id="approval-chains"><h2>Department approval chains</h2>
  <p className="muted">Review the submitted department inputs in Plan before approving. Each step approves that exact content. Changed inputs restart the review; other departments keep their progress.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {view?.departments.map((row: D) => {
   const sub = row.submission, review = sub?.review
   return <article key={row.department} aria-label={`${row.name} approval chain`} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
    <h3>{row.name}</h3>
    {review && <p>Submitted revision {review.content.revision} · {sub.status}. <small>Content {review.content.digest.slice(0, 12)}</small></p>}
    {row.changed && <p role="status">Department inputs changed. Review will restart at step one.</p>}
    {row.steps.length ? <ol className="plain">{row.steps.map((step: D, i: number) => <li key={step.id}>
     <strong>{i + 1}. {step.name}</strong> — <span className="pill">{step.status}</span>
     {step.reason && <p role="status">Blocked: {step.reason}</p>}
     {step.reviewers.length > 0 && <p className="muted">Eligible now: {step.reviewers.join(', ')}</p>}
     {step.canApprove && <Action label={`Approve ${row.name}: ${step.name}`} confirm="Approve this department's exact submitted content?" run={async () => { await command('approval-step', { scenario: budget.id, department: row.department, step: step.id, pass: review.pass, digest: review.content.digest }); await reload() }} />}
    </li>)}</ol> : row.nextVersion?.steps.length ? <p>Next submission uses version {row.nextVersion.number}: {row.nextVersion.steps.map((step: D) => step.name).join(' → ')}.</p> : <p>No department review steps. The finance approval step still applies.</p>}
    {row.canReturn && <Form submit={`Return ${row.name}`} onSubmit={async v => { await command('return-submission', { scenario: budget.id, department: row.department, reason: v.reason }); await reload() }}><Field label={`Reason to return ${row.name}`} name="reason" /></Form>}
    {view.manage && budget.status === 'working' && <>
     <ChainEditor key={row.configuration?.version ?? 'new'} row={row} view={view} reload={reload} />
     {row.configuration && sub && ['reviewing', 'submitted'].includes(sub.status) && <Form submit={`Restart ${row.name} on version ${row.configuration.number}`} onSubmit={async v => { await command('approval-chain-restart', { scenario: budget.id, department: row.department, pass: review?.pass, version: row.configuration.version, reason: v.reason }); await reload() }}><Field label={`Reason to restart ${row.name}`} name="reason" /></Form>}
    </>}
    {sub && <details><summary>{row.name} review history</summary><ol>{sub.history.map((entry: D, i: number) => <li key={i}><strong>{entry.status}</strong> · {entry.by} · {date(entry.at)}{entry.reason && ` — ${entry.reason}`}{entry.content && <small> · revision {entry.content.revision}, content {entry.content.digest.slice(0, 12)}</small>}{entry.voidedDecisions?.length > 0 && <span> · {entry.voidedDecisions.length} prior decision(s) voided</span>}</li>)}</ol></details>}
   </article>
  })}
 </section>
}
