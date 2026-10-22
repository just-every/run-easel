import { useEffect, useState } from 'react'
import { Action, api, command, Field, Form, Person, useDate, type D } from './shared'

const INPUT_LABELS: Record<string, string> = { startDate: 'Contract start', plannedStartDate: 'Hire start', paymentDate: 'Vendor payment' }
const CHOICES = [{ value: 'yes', label: 'Yes, keep the expected date' }, { value: 'no', label: 'No, date is still uncertain' }, { value: 'new-date', label: 'Use a new date' }]
const inputKey = (i: D) => `${i.kind}:${i.originId}:${i.field}`

function AnswerForm({ question, override, run }: { question: D; override?: boolean; run: (op: string, body: D) => Promise<unknown> }) {
 const [choice, setChoice] = useState('')
 return <Form submit={override ? 'Save finance override' : 'Record my answer'} onSubmit={v => run(override ? 'owner-question-override' : 'owner-question-answer', { id: question.id, revision: question.revision, choice: v.choice, ...(v.choice === 'new-date' ? { date: v.date } : {}), ...(override ? { note: v.note } : {}) })}>
  <label>{override ? 'Finance answer' : 'My answer'}<select aria-label={override ? 'Finance answer' : 'My answer'} name="choice" value={choice} required onChange={e => setChoice(e.target.value)}><option value="">Choose…</option>{CHOICES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  {choice === 'new-date' && <Field label={override ? 'Finance replacement date' : 'My new date'} name="date" type="date" />}
  {override && <Field label="Reason for finance override" name="note" type="textarea" />}
 </Form>
}

/** Native, attributed answers create draft proposals; finance retains ordinary promotion authority. */
export function OwnerQuestions({ state, forecast, refresh }: { state: D; forecast: D; refresh: () => Promise<unknown> }) {
 const [view, setView] = useState<D | null>(null), [error, setError] = useState(''), [selected, setSelected] = useState(''), [created, setCreated] = useState<D | null>(null)
 const displayDate = useDate(), finance = state.me.role === 'finance'
 const load = async () => { const result = await api(`owner-questions?scenario=${encodeURIComponent(forecast.id)}`); setView(result); setError('') }
 useEffect(() => { let active = true; setView(null); setError(''); api(`owner-questions?scenario=${encodeURIComponent(forecast.id)}`).then(v => { if (active) setView(v) }, e => { if (active) setError(e.message) }); return () => { active = false } }, [forecast.id, forecast.revision, state])
 const run = async (op: string, body: D) => { const result = await command(op, body); await load(); await refresh(); return result }
 const candidate = view?.inputs.find((i: D) => inputKey(i) === selected)
 return <section className="card" aria-label="Owner questions">
  <h2>Owner questions</h2>
  <p className="muted">Ask the person responsible for an uncertain date. Their signed-in answer keeps its source and attribution. An answered date can become a recalculated draft proposal; finance reviews, submits and promotes it under Scenarios. Unanswered questions escalate to finance and keep the existing assumption.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {!view && !error && <p role="status">Reading owner questions…</p>}
  {view && <>
   <p>Owner questions are <strong>{view.enabled ? 'enabled' : 'disabled'}</strong>.</p>
   {finance && <Form key={String(view.enabled)} submit="Save question settings" onSubmit={v => run('owner-question-settings', { enabled: v.enabled })}>
    <Field label="Enable owner questions" name="enabled" type="checkbox" defaultValue={view.enabled} />
   </Form>}
   {finance && view.enabled && <details>
    <summary>Ask an input owner</summary>
    {view.inputs.length ? <Form submit="Ask owner" onSubmit={async (v, form) => {
     const input = view.inputs.find((i: D) => inputKey(i) === v.input)
     if (!input) throw new Error('Choose a current forecast input')
     const deadline = new Date(v.dueAt)
     if (!Number.isFinite(deadline.getTime())) throw new Error('Choose a valid answer deadline')
     await run('owner-question-ask', { scenario: forecast.id, scenarioRevision: forecast.revision, kind: input.kind, originId: input.originId, field: input.field, owner: v.owner, source: v.source, question: v.question, dueAt: deadline.toISOString() })
     form.reset(); setSelected('')
    }}>
     <label>Uncertain input<select aria-label="Uncertain input" name="input" value={selected} required onChange={e => setSelected(e.target.value)}><option value="">Choose…</option>{view.inputs.map((i: D) => <option key={inputKey(i)} value={inputKey(i)}>{i.name} — {INPUT_LABELS[i.field] ?? i.field}</option>)}</select></label>
     {candidate && <p className="muted">Current expected date: <span className="date-token">{displayDate(candidate.value)}</span></p>}
     <Field label="Input owner" name="owner" options={view.owners.map((o: D) => ({ value: o.email, label: `${o.name || o.email} (${o.email})` }))} />
     <Field label="Source reference" name="source" hint="Identify the reviewed source and why this person owns the input." />
     <Field label="Question for the owner" name="question" type="textarea" />
     <Field label="Answer deadline" name="dueAt" type="datetime-local" hint="Your browser’s local time; saved as an exact UTC instant." />
    </Form> : <p className="muted">No eligible dated inputs in this forecast. Enter a future contract start, planned hire start or one-off vendor payment date first.</p>}
   </details>}
   {!view.questions.length && <p className="muted">No owner questions yet.</p>}
   {view.questions.map((q: D) => <article key={q.id} className="pack" aria-label={q.question}>
    <h3>{q.question}</h3>
    <p>{q.inputName} · {INPUT_LABELS[q.field] ?? q.field} · {q.status}</p>
    <p>Owner: <Person state={state} email={q.owner} />. Expected date: <span className="date-token">{displayDate(q.expectedDate)}</span>. Answer due: <span className="date-token">{displayDate(q.dueAt)}</span>.</p>
    <p className="muted">Source: {q.source}</p>
    {q.escalatedAt && <p>Escalated to finance at <span className="date-token">{displayDate(q.escalatedAt)}</span>; {q.answer ? 'the answer remains attributed below.' : 'no answer recorded; the assumption stays unchanged.'}</p>}
    {q.answer && <div>
     <p>Answer: <strong>{q.answer.choice === 'new-date' ? 'New date' : q.answer.choice === 'yes' ? 'Yes' : 'No — still uncertain'}</strong>{q.answer.date && <> · <span className="date-token">{displayDate(q.answer.date)}</span></>} by <Person state={state} email={q.answer.by} /> at <span className="date-token">{displayDate(q.answer.at)}</span>.</p>
     {q.answer.source && <p className="muted">Answer source: {q.answer.source}</p>}
     {q.answer.note && <p>Finance override note: {q.answer.note}</p>}
     {q.answer.proposal && <p>Draft proposal created. <a href={`/app?tab=scenarios&compareFrom=${encodeURIComponent(q.scenario)}&compareTo=${encodeURIComponent(q.answer.proposal)}`}>Review changed cells under Scenarios</a>.</p>}
    </div>}
    {view.enabled && q.status === 'open' && q.owner === state.me.email && <AnswerForm key={`answer-${q.revision}`} question={q} run={run} />}
    {view.enabled && finance && q.status !== 'canceled' && <>
     <details><summary>Override with a finance note</summary><AnswerForm key={`override-${q.revision}`} question={q} override run={run} /></details>
     {q.answer && q.answer.choice !== 'no' && !q.answer.proposal && <Action label="Create date proposal" run={async () => { const result = await run('owner-question-propose', { id: q.id, revision: q.revision }); setCreated(result.proposal ?? result) }} />}
     {q.status === 'open' && !q.escalatedAt && <Action kind="quiet" label="Check unanswered escalation" run={() => run('owner-question-escalate', { id: q.id, revision: q.revision })} />}
     {q.status === 'open' && <details><summary>Cancel this question</summary><Form submit="Cancel question" onSubmit={v => run('owner-question-cancel', { id: q.id, revision: q.revision, reason: v.reason })}><Field label="Reason for canceling the question" name="reason" type="textarea" /></Form></details>}
    </>}
    {q.history?.length > 0 && <details><summary>Question history</summary><ul className="plain">{q.history.map((h: D, i: number) => <li key={i}>{h.kind ?? h.action ?? h.status} {h.by && <>by <Person state={state} email={h.by} /></>}{h.at && <> at <span className="date-token">{displayDate(h.at)}</span></>}{h.note && <> · {h.note}</>}{h.reason && <> · {h.reason}</>}</li>)}</ul></details>}
   </article>)}
   {created && <p role="status">Draft proposal{created.name ? ` “${created.name}”` : ''} created. The official forecast stays unchanged until finance submits and promotes it.</p>}
  </>}
 </section>
}
