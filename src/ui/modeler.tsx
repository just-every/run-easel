import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { Action, api, decimalText, Field, Form, money, monthLabel, Table, type D } from './shared'

const usd = (n = 0) => `${Math.floor(n / 1_000_000)}.${String(n % 1_000_000).padStart(6, '0')}`
const wrapped = { whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const, maxWidth: '100%' }
export function Modeler({ state, refresh }: Pick<Shared, 'state' | 'refresh'>) {
 const [status, setStatus] = useState<D | null>(null), [preview, setPreview] = useState<D | null>(null), [outcome, setOutcome] = useState<D | null>(null), [chosen, setChosen] = useState(''), [proof, setProof] = useState<D | null>(null), [error, setError] = useState('')
 const allowed = state.me.role === 'finance' && state.me.payDetail && state.me.capabilities.includes('model-structure')
 const sources = state.scenarios.filter((s: D) => s.status === 'working' && s.kind !== 'proposal' && !s.sandbox)
 const proposals = state.scenarios.filter((s: D) => s.modelerRun)
 const reload = async () => { setStatus(await api('modeler/status')); await refresh() }
 useEffect(() => { let live = true; setPreview(null); if (allowed) api('modeler/status').then(s => { if (live) setStatus(s) }, e => { if (live) setError(e.message) }); return () => { live = false } }, [state, allowed])
 useEffect(() => { let live = true; setProof(null); if (allowed && chosen) api(`modeler/proposal/${chosen}`).then(p => { if (live) setProof(p) }, e => { if (live) setError(e.message) }); return () => { live = false } }, [chosen, state, allowed])
 if (!allowed) return null
 return <section className="card" aria-label="Modeler proposals">
  <h2>Modeler proposals</h2>
  <p>Describe a planning change. Your chosen model can draft salary positions, simple volume revenue drivers and scalar formulas using existing planning lines and departments. Each result stays a separate draft proposal with exact diffs, recalculated cells and local expected-value checks. Finance reviews and promotes through the ordinary proposal flow.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {status && <>
   <p>{status.enabled ? 'Enabled' : 'Disabled'} · {status.stopped ? 'Stopped' : 'Ready'} · {status.model || 'No model configured'}</p>
   <p>Modeler conservative allowance for {status.billingMonth}: USD {usd(status.reservedMicroUsd)} of USD {usd(status.budgetMicroUsd)}. This is separate from the commentary budget. Every attempted call retains its allowance, including refused or unknown results; this is not provider-reported cost.</p>
   {(!status.providerConfigured || !status.connected) && <p>Configure the owner-chosen OpenAI model, rates and sealed key under <a href="/app?tab=review">Review → Model variance commentary</a> before drafting. Modeler needs its own consent and enablement below.</p>}
   <details><summary>Configure modeler</summary>
    <Form key={status.revision} submit="Save modeler settings" onSubmit={async values => { await api('modeler/settings/configure', values); setPreview(null); await reload() }}>
     <Field label="Monthly modeler budget (USD)" name="monthlyUsd" defaultValue={status.budgetMicroUsd ? usd(status.budgetMicroUsd) : ''} />
     <Field label="Enable modeler" name="enabled" type="checkbox" defaultValue={status.enabled} required={false} />
     <Field label="I consent to reusing the owner-chosen OpenAI model and sealed key for reviewed planning requests, including pay assumptions" name="consent" type="checkbox" required={false} />
    </Form>
   </details>
   <Action label={status.stopped ? 'Resume modeler' : 'Stop modeler'} kind={status.stopped ? 'quiet' : 'danger'} run={async () => { await api(`modeler/settings/${status.stopped ? 'resume' : 'stop'}`, {}); setPreview(null); await reload() }} />
   {status.enabled && !status.stopped && status.connected && status.providerConfigured && sources.length > 0 && <Form submit="Preview modeler request" onSubmit={async values => { setOutcome(null); setPreview(await api('modeler/preview', values)) }}>
    <Field label="Modeler source plan" name="from" options={sources.map((s: D) => ({ value: s.id, label: `${s.name} · revision ${s.revision}` }))} />
    <Field label="Planning change for modeler" name="request" type="textarea" />
   </Form>}
  </>}
  {preview && <div aria-label="Exact modeler request">
   <h3>Review the exact modeler request</h3>
   <p>Send source revision {preview.sourceRevision} to your chosen OpenAI model. This request can contain planning salaries; person and holder identities are excluded.</p>
   <p>Conservative allowance for this request: USD {usd(preview.reserveMicroUsd)}.</p>
   <details><summary>Inspect the complete provider request</summary>
    <p>Destination: https://api.openai.com/v1/responses. Input allowance: {preview.inputTokenAllowance} tokens; output limit: {preview.maxOutputTokens} tokens.</p>
    <p style={{ overflowWrap: 'anywhere' }}>Request fingerprint: {preview.fingerprint}</p>
    <pre style={wrapped}>{JSON.stringify(preview.request, null, 2)}</pre>
   </details>
   <Form key={preview.fingerprint} submit="Generate draft proposal" onSubmit={async values => {
    const result = await api('modeler/generate', { from: preview.from, request: preview.requestText, fingerprint: preview.fingerprint, consent: values.consent })
    setPreview(null); await reload(); setOutcome(result); if (result.proposal) setChosen(result.proposal)
   }}>
    <Field label="I consent to sending this exact modeler request and reserving this allowance" name="consent" type="checkbox" required={false} />
   </Form>
  </div>}
  {outcome && <p role="status">{outcome.status === 'draft' ? 'Agent draft proposal created for review. The source plan is unchanged.' : outcome.reason} Conservative allowance retained: USD {usd(outcome.reserveMicroUsd)}.</p>}
  {proposals.length > 0 && <label>Review modeler proposal<select aria-label="Review modeler proposal" value={chosen} onChange={e => setChosen(e.target.value)}><option value="">Choose…</option>{proposals.map((p: D) => <option key={p.id} value={p.id}>{p.name} · {p.proposalStatus}</option>)}</select></label>}
  {proof && <ModelerProof proof={proof} state={state} />}
 </section>
}

function ModelerProof({ proof, state }: { proof: D; state: D }) {
 const line = (id: string) => state.lines.find((l: D) => l.id === id)?.name ?? id
 const department = (id: string) => state.departments.find((d: D) => d.id === id)?.name ?? id
 return <div aria-label="Modeler proposal evidence">
  <h3>Agent work · {proof.model}</h3>
  <p>Captured proposal revision {proof.proposalRevision}, from source revision {proof.sourceRevision}. <a href={`/app?tab=scenarios&compareFrom=${proof.from}&compareTo=${proof.proposal}`}>Review in native comparison</a></p>
  {proof.stale && <p role="alert">The proposal or its source changed after these checks. These are the recorded creation results; review the current comparison before submission or promotion.</p>}
  <h4>Structure and input diff</h4>
  <p>Existing lines: {proof.structureDiff.reusedLines.map((l: D) => l.after.name).join(', ')}. Existing departments: {proof.structureDiff.reusedDepartments.map((d: D) => d.after.name).join(', ')}.</p>
  {proof.inputDiff.map((change: D, i: number) => <details key={i}><summary>{change.change === 'added' ? 'Added' : 'Changed'} {change.kind}: {change.name}</summary>
   {change.after?.formula && <p>Formula: <code style={{ overflowWrap: 'anywhere' }}>{change.after.formula}</code></p>}
   <pre style={wrapped}>{JSON.stringify({ before: change.before ?? null, after: change.after ?? null }, null, 2)}</pre>
  </details>)}
  <h4>Recalculated changed cells ({proof.changedCells.length})</h4>
  <Table caption="Modeler changed cells" heads={['Month', 'Line', 'Department', 'Before', 'After', 'Difference']}>{proof.changedCells.map((c: D) => <tr key={`${c.month}|${c.line}|${c.department}`}><td>{monthLabel(c.month)}</td><td>{line(c.line)}</td><td>{department(c.department)}</td><td className="num">{money(c.before, state.workspace.currency)}</td><td className="num">{money(c.after, state.workspace.currency)}</td><td className="num">{money(c.difference, state.workspace.currency)}</td></tr>)}</Table>
  <h4>Expected-value checks</h4>
  <p>Each entered expectation matched Easel's deterministic calculation when the proposal was created. These checks establish numeric consistency; review whether the proposal meets your request.</p>
  <Table caption="Modeler expected-value checks" heads={['Target', 'Month', 'Expected', 'Calculated', 'Result']}>{proof.expectedTests.map((t: D, i: number) => <tr key={i}><td>{t.target === 'driver' ? t.driver : `${line(t.line)} · ${department(t.department)}`}</td><td>{monthLabel(t.month)}</td><td className="num">{t.unit === 'money' ? money(t.expectedMinor, state.workspace.currency) : decimalText(t.expectedMinor)}</td><td className="num">{t.unit === 'money' ? money(t.actualMinor, state.workspace.currency) : decimalText(t.actualMinor)}</td><td>Passed when created</td></tr>)}</Table>
 </div>
}
