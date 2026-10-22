import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { Action, api, Field, Form, type D } from './shared'

const usd = (micro: number = 0) => `${Math.floor(micro / 1_000_000)}.${String(micro % 1_000_000).padStart(6, '0')}`
const route = 'commentary'

/** An explicit preview/send boundary. The model's draft uses ordinary human confirmation. */
export function CommentaryModel({ state, month, refresh }: Pick<Shared, 'state' | 'refresh'> & { month: string }) {
 const [status, setStatus] = useState<D | null>(null), [rows, setRows] = useState<D[]>([]), [preview, setPreview] = useState<D | null>(null), [outcome, setOutcome] = useState<D | null>(null), [error, setError] = useState('')
 const allowed = state.me.role === 'finance' || state.me.role === 'contributor'
 async function reload() { setStatus(await api(`${route}/status`)); await refresh() }
 useEffect(() => {
  let live = true
  setPreview(null); setError('')
  if (allowed) Promise.all([api(`${route}/status`), month ? api(`variance/${month}`) : Promise.resolve({ rows: [] })]).then(([s, v]) => { if (live) { setStatus(s); setRows(v.rows) } }, e => { if (live) setError(e.message) })
  return () => { live = false }
 }, [state, month, allowed])
 if (!allowed) return null
 const selectable = rows.filter(r => !r.payroll && (state.me.role === 'finance' || state.me.departments.includes(r.department)))
 const drafts = selectable.filter(r => r.explanation?.claims?.length)
 return <section className="card" aria-label="Model variance commentary">
  <h2>Model variance commentary</h2>
  <p>Ask your chosen OpenAI model to draft one non-pay variance. Review the exact request before sending. Evidence citations identify accepted rows; they do not prove a narrative claim. A person confirms the explanation before finance publishes it.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {status && <>
   <p>{status.enabled ? 'Enabled' : 'Disabled'} · {status.stopped ? 'Stopped' : 'Ready'} · {status.connected ? 'Owner key connected' : 'Owner key required'}</p>
   <p>Conservative allowance reserved for {status.billingMonth}: USD {usd(status.reservedMicroUsd)} of USD {usd(status.budgetMicroUsd)}. This is a budget allowance, not provider-reported cost. Each attempt retains its allowance, including refused or unknown outcomes.</p>
   {status.error && <p role="alert">{status.error}</p>}
   {state.me.role === 'finance' && <>
    <details><summary>Configure model and budget</summary>
     <Form key={status.revision} submit="Save commentary settings" onSubmit={async values => { await api(`${route}/settings/configure`, values); setPreview(null); await reload() }}>
      <Field label="Owner-chosen OpenAI model" name="model" defaultValue={status.model} />
      <Field label="Input USD per million tokens" name="inputUsdPerMillion" defaultValue={status.inputRateMicroUsd ? usd(status.inputRateMicroUsd) : ''} hint="Enter the chosen model's current input rate; up to six decimal places." />
      <Field label="Output USD per million tokens" name="outputUsdPerMillion" defaultValue={status.outputRateMicroUsd ? usd(status.outputRateMicroUsd) : ''} />
      <Field label="Monthly commentary budget (USD)" name="monthlyUsd" defaultValue={status.budgetMicroUsd ? usd(status.budgetMicroUsd) : ''} />
      <Field label="Enable variance commentary" name="enabled" type="checkbox" defaultValue={status.enabled} required={false} />
      <Field label="I consent to reviewed non-pay variance requests being sent to OpenAI" name="consent" type="checkbox" required={false} />
      <p>The destination is fixed to OpenAI Responses. Finance must also resume commentary after initial configuration or a stop.</p>
     </Form>
    </details>
    <details><summary>Owner-provided OpenAI key</summary>
     <p>The key is sealed for this installation and excluded from archives. Reconnect after a restore. Sending a request requires separate consent below.</p>
     <Form submit="Store OpenAI key" onSubmit={async (values, form) => { await api(`${route}/connection/connect`, values); form.reset(); setPreview(null); await reload() }}>
      <Field label="OpenAI API key" name="key" type="password" />
      <Field label="I consent to sealed storage of this owner-provided key" name="consent" type="checkbox" required={false} />
     </Form>
     {status.connected && <Action label="Disconnect commentary key" run={async () => { await api(`${route}/connection/disconnect`, {}); setPreview(null); await reload() }} />}
    </details>
    <Action label={status.stopped ? 'Resume variance commentary' : 'Stop variance commentary'} kind={status.stopped ? 'quiet' : 'danger'} run={async () => { await api(`${route}/settings/${status.stopped ? 'resume' : 'stop'}`, {}); setPreview(null); await reload() }} />
   </>}
   {status.enabled && !status.stopped && month && selectable.length > 0 && <Form key={month} submit="Preview model request" onSubmit={async values => {
    setPreview(null); setOutcome(null)
    const row = selectable.find(r => r.key === values.variance)
    if (!row) throw new Error('Choose a variance')
    setPreview(await api(`${route}/preview`, { month, line: row.line, department: row.department }))
   }}>
    <Field label="Variance for model draft" name="variance" options={selectable.map(r => ({ value: r.key, label: `${r.lineName} · ${r.departmentName}` }))} />
   </Form>}
  </>}
  {preview && <div aria-label="Exact model request">
   <h3>Review the exact request</h3>
   <p>To: https://api.openai.com/v1/responses</p>
   <p>Conservative allowance: USD {usd(preview.reserveMicroUsd)}. Input allowance: {preview.inputTokenAllowance} tokens (UTF-8 request bytes plus 4,096); output limit: {preview.maxOutputTokens} tokens.</p>
   <p style={{ overflowWrap: 'anywhere' }}>Request fingerprint: {preview.fingerprint}</p>
   <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%' }}>{JSON.stringify(preview.request, null, 2)}</pre>
   <Form key={preview.fingerprint} submit="Generate model draft" onSubmit={async values => {
    const result = await api(`${route}/generate`, { month: preview.month, line: preview.line, department: preview.department, fingerprint: preview.fingerprint, consent: values.consent })
    setPreview(null); await reload(); setOutcome(result)
   }}>
    <Field label="I consent to sending this exact request to OpenAI and reserving this allowance" name="consent" type="checkbox" required={false} />
   </Form>
  </div>}
  {outcome && <p role="status">{outcome.status === 'draft' ? 'Agent draft saved for human review. Confirm or rewrite it in the variance above.' : outcome.reason} Conservative allowance retained: USD {usd(outcome.reserveMicroUsd)}.</p>}
  {drafts.map(row => <div key={row.key} className="card-row">
   <h3>{row.lineName} · {row.departmentName}</h3>
   <p>Agent work · {row.explanation.model} · explanation {row.explanation.status}</p>
   {row.explanation.claims.map((claim: D, i: number) => <div key={i}>
    <p><strong>{claim.label === 'evidence' ? 'Evidence' : 'Hypothesis'}:</strong> {claim.text}</p>
    {claim.citationIds.length > 0 && <ul>{claim.citationIds.map((id: string) => {
     const citation = row.citations.find((r: D) => r.id === id)
     return <li key={id} style={{ overflowWrap: 'anywhere' }}>{citation ? `${citation.file}, line ${citation.line}: ${citation.description || citation.reference || citation.account}` : 'Source no longer visible; review the variance before confirmation'} · {id}</li>
    })}</ul>}
   </div>)}
  </div>)}
 </section>
}
