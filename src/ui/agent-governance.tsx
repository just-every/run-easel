import { useEffect, useState } from 'react'
import { Action, api, Field, Form, type D } from './shared'

const usd = (n: number = 0) => (n / 1_000_000).toFixed(6)
export function AgentGovernance() {
 const [status, setStatus] = useState<D | null>(null), [error, setError] = useState('')
 const reload = async () => setStatus(await api('./agents/status'))
 useEffect(() => { reload().catch(e => setError(e.message)) }, [])
 return <section className="card" aria-label="Agent governance">
  <h2>Agent governance</h2>
  <p>Finance controls each agent and can stop all agent work. Existing agents also keep their individual settings and permissions. New agents start disabled. Agents cannot approve, close, publish, promote, connect, pay or hire.</p>
  {error && <p role="alert">{error}</p>}
  {status && <>
   <p role="status">{status.stopped ? 'All agents stopped' : 'Global agent stop is released'}</p>
   <p>Monthly reserved allowance: USD {usd(status.reservedMicroUsd)}. Provider-reported cost is unavailable. Every attempted model call retains its conservative reservation.</p>
   <Action label={status.stopped ? 'Release global agent stop' : 'Stop all agents'} kind={status.stopped ? 'quiet' : 'danger'} run={async () => { await api(`./agents/settings/${status.stopped ? 'resume' : 'stop'}`, {}); await reload() }} />
   <details><summary>Agent controls and total budget</summary>
    <Form key={status.revision} submit="Save agent controls" onSubmit={async values => {
     await api('./agents/settings/configure', { monthlyUsd: values.monthlyUsd, consent: values.consent, agents: Object.fromEntries(status.agents.map((a: D) => [a.id, values[`agent-${a.id}`]])) }); await reload()
    }}>
     <Field label="Monthly total agent budget (USD)" name="monthlyUsd" defaultValue={status.budgetMicroUsd === undefined ? '' : usd(status.budgetMicroUsd)} hint="Shared ceiling across all model agents, in addition to their individual budgets. Zero prevents new model calls." />
     {status.agents.map((a: D) => <Field key={a.id} label={`Enable ${a.label}`} name={`agent-${a.id}`} type="checkbox" defaultValue={a.enabled} required={false} />)}
     <Field label="I confirm these agent controls and the shared monthly allowance" name="consent" type="checkbox" required={false} />
    </Form>
   </details>
  </>}
 </section>
}
