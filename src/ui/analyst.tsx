import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { Action, api, Field, Form, money, type D } from './shared'

export function Analyst({ state, refresh }: Shared) {
 const [saved, setSaved] = useState<D>({ missions: [], runs: [] })
 const [whatIf, setWhatIf] = useState<D | null>(null)
 const [expenses, setExpenses] = useState<D[]>([])
 const [revenues, setRevenues] = useState<D[]>([])
 const [whatIfKind, setWhatIfKind] = useState('expense')
 const [missionError, setMissionError] = useState('')
 const reloadMissions = async () => setSaved(await api('./missions'))
 const [mission, setMission] = useState<D | null>(null)
 const [preview, setPreview] = useState<D | null>(null), [answer, setAnswer] = useState<D | null>(null)
 useEffect(() => { if (state.me.role === 'finance') reloadMissions().catch(e => setMissionError(e.message)) }, [state, mission])
 return <section className="card" aria-label="Cited analyst">
  <h2>Cited analyst</h2>
  <p>Ask about a plan month. Only visible aggregate cells are sent to the chosen model. Answers explain cited totals and reference differences; model prose is discarded. This read-only analysis cannot change the plan. Finance must first enable Analyst and set the shared allowance.</p>
  <Form submit="Preview analyst request" onSubmit={async values => { setPreview(null); setAnswer(null); setPreview(await api('./analyst/preview', values)); const view = await api(`./scenario/${values.scenario}`); setExpenses(view.inputs.expense.filter((row: D) => ['recurring', 'one-off'].includes(row.kind))); setRevenues(view.inputs.revenue) }}>
   <Field label="Analysis scenario" name="scenario" options={state.scenarios.map((s: D) => ({ value: s.id, label: s.name }))} />
   <Field label="Reference scenario" name="compare" options={[{ value: '', label: 'No comparison' }, ...state.scenarios.filter((s: D) => !s.sandbox).map((s: D) => ({ value: s.id, label: s.name }))]} required={false} />
   <Field label="Analysis month" name="month" type="month" defaultValue={state.workspace.planStart} />
   <Field label="Analysis question" name="question" type="textarea" />
  </Form>
  {preview && <div>
   <h3>Exact analyst request</h3>
   <p>Reserved allowance: USD {(preview.reserveMicroUsd / 1_000_000).toFixed(6)}. Destination: OpenAI Responses.</p>
   <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%' }}>{JSON.stringify(preview.request, null, 2)}</pre>
   <Form submit="Ask analyst" onSubmit={async values => { const result = await api('./analyst/generate', { scenario: preview.scenario, compare: preview.compare, month: preview.month, question: preview.question, fingerprint: preview.fingerprint, consent: values.consent }); setPreview(null); setAnswer(result) }}>
    <Field label="I consent to sending this exact aggregate request and reserving its allowance" name="consent" type="checkbox" required={false} />
   </Form>
  </div>}
  {answer && <div role="status"><h3>{answer.label}</h3><p>{answer.model} · {answer.status}</p>{answer.reason && <p>{answer.reason}</p>}
   {answer.explanation?.map((part: D, index: number) => <p key={index} style={{ overflowWrap: 'anywhere' }}>{part.text}<br />Citations: {part.citationIds.join(', ')}</p>)}
   <ul>{answer.citations.map((cell: D) => <li key={cell.id} style={{ overflowWrap: 'anywhere' }}>{cell.department} · {cell.line} · {cell.month}: {money(cell.amount, answer.currency)}<br />Citation: {cell.id}</li>)}</ul>
  </div>}
  {answer?.status === 'answered' && state.me.role !== 'viewer' && (expenses.length > 0 || revenues.length > 0) && <details><summary>Create a private what-if</summary>
   <label>What-if action<select aria-label="What-if action" value={whatIfKind} onChange={event => setWhatIfKind(event.target.value)}><option value="expense">Change an expense amount</option><option value="remove-revenue">Lose a customer or revenue source</option></select></label>
   <Form key={whatIfKind} submit="Create private what-if" onSubmit={async values => { setWhatIf(await api('./analyst/what-if', { ...values, kind: whatIfKind, run: answer.id })); await refresh() }}>
    <Field label="Private what-if name" name="name" />
    <Field label={whatIfKind === 'expense' ? 'What-if expense' : 'Lost revenue source'} name="origin" options={(whatIfKind === 'expense' ? expenses : revenues).map((row: D) => ({ value: row.originId, label: row.name }))} />
    {whatIfKind === 'expense' && <Field label="What-if amount" name="amount" />}
    <p>Changes only your selected input in your private sandbox, using your current planning permissions. Share or submit it under Scenarios.</p>
   </Form>
  </details>}
  {whatIf && <div role="status"><p>{whatIf.label}. Open it under Scenarios.</p><ul>{whatIf.cash.map((row: D) => <li key={row.month} style={{ overflowWrap: 'anywhere' }}>{row.month}: {money(row.closing, whatIf.currency)} · {row.citation}</li>)}</ul></div>}
  {state.me.role === 'finance' && answer?.status === 'answered' && <details><summary>Approve a weekly mission from this answer</summary>
   <Form submit="Approve Monday mission" onSubmit={async values => { setMission(await api('./missions/approve', { ...values, run: answer.id, recipients: String(values.recipients).split(',').map((s: string) => s.trim()).filter(Boolean) })) }}>
    <Field label="Mission name" name="name" />
    <Field label="Finance recipients (comma separated emails)" name="recipients" hint="Active native finance people only. Their authority is checked again before each delivery." />
    <Field label="I approve weekly aggregate model requests and delivery to this exact audience" name="consent" type="checkbox" required={false} />
    <p>Runs Monday at 08:00 in the saved company time zone, for this scenario and month. Connected sources older than 24 hours, without a refresh or with an error produce a stale notice instead. Finance must enable Recurring missions.</p>
   </Form>
  </details>}
  {mission && <div role="status"><p>{mission.name}: {mission.schedule} ({mission.zone})</p><button type="button" onClick={async () => { try { await api('./missions/stop', { id: mission.id }); setMission(null) } catch (e) { setMission({ ...mission, error: (e as Error).message }) } }}>Stop this mission</button>{mission.error && <p role="alert">{mission.error}</p>}</div>}
  {state.me.role === 'finance' && <details><summary>Saved missions</summary>
   {missionError && <p role="alert">{missionError}</p>}
   {saved.missions.length === 0 && <p>No saved missions yet.</p>}
   {saved.missions.map((m: D) => <div key={m.id} className="card-row" style={{ overflowWrap: 'anywhere' }}>
    <h3>{m.name}</h3><p>{m.enabled ? 'Enabled' : 'Stopped'} · {m.schedule} · {m.zone}</p>
    <p>Approved by {m.approvedBy}. Audience: {m.recipients.join(', ')}.</p>
    {m.enabled && <Action label={`Stop mission ${m.name}`} kind="danger" run={async () => { await api('./missions/stop', { id: m.id }); await reloadMissions() }} />}
    <ul>{saved.runs.filter((r: D) => r.mission === m.id).map((r: D) => <li key={r.id}>{r.date}: {r.status}{r.stale.length > 0 ? `; stale: ${r.stale.join(', ')}` : ''}. Delivery outcomes: {Object.entries(r.deliveries).map(([email, status]) => `${email}: ${status}`).join(', ') || 'None'}.</li>)}</ul>
   </div>)}
  </details>}
 </section>
}
