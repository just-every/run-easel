import { useEffect, useState } from 'react'
import { Action, api, Field, Form, money, options, Table, type D } from './shared'

export function BillingConnection() {
 const [status, setStatus] = useState<D|null>(null), [error, setError] = useState('')
 const load = async () => { try { setStatus(await api(['connections','stripe'].join('/'))); setError('') } catch (e) { setError((e as Error).message) } }
 useEffect(() => { void load() }, [])
 return <section className="card" aria-label="Stripe Billing connection"><h2>Subscription billing connection</h2>
  {error && <p role="alert" className="error">{error}</p>}
  {status && <>
   <Table caption="Stripe connection" heads={['Setting','Value']}>
    <tr><td>Status</td><td>{status.connected ? `Connected · ending ${status.suffix}` : 'Disconnected'}</td></tr>
    <tr><td>Read scope</td><td>{status.scope}</td></tr><tr><td>Schedule</td><td>{status.schedule}</td></tr>
    <tr><td>Connected by</td><td>{status.owner ?? '—'}</td></tr><tr><td>Last accepted pull</td><td>{status.lastRefresh ?? '—'}</td></tr>
    <tr><td>Source rows</td><td>{status.rowCount ?? 0}</td></tr><tr><td>Rate limit</td><td>{status.rateLimit ?? 'No limit reported'}</td></tr>
   </Table>
   {status.error && <p role="alert" className="error">{status.error}</p>}
   {status.providerRevocation?.ownerAction && <p role="status">{status.providerRevocation.ownerAction}</p>}
   {!status.connected ? <Form submit="Connect Stripe Billing" onSubmit={async (v, form) => { await api(['connections','stripe','connect'].join('/'), v); form.reset(); await load() }}>
    <Field label="Stripe restricted read-only key" name="key" type="password" hint="Create a restricted key with read access to invoices, subscriptions, prices, credit notes, invoice payments and refunds. Credentials are encrypted and excluded from archives."/>
    <Field label="I approve read-only subscription billing access" name="consent" type="checkbox"/>
   </Form> : <><Action label="Check Stripe access" kind="quiet" run={async()=>{await api(['connections','stripe','check'].join('/'),{});await load()}}/><Action label="Disconnect Stripe Billing" kind="danger" confirm="Delete the local key? Accepted subscription history remains. Revoke the restricted key separately in Stripe." run={async () => { await api(['connections','stripe','disconnect'].join('/'), {}); await load() }}/></>}
  </>}
 </section>
}

export function BillingImport({ scenario, revision, drivers, currency, onChange }: { scenario:string; revision:number; drivers:D[]; currency:string; onChange:()=>Promise<void> }) {
 const [preview, setPreview] = useState<D|null>(null), [draft, setDraft] = useState<D|null>(null), [notes, setNotes] = useState<D>({}), [history, setHistory] = useState<D[]>([]), [reviewed, setReviewed] = useState(false)
 useEffect(() => { void api(`billing/${scenario}`).then(setHistory).catch(() => setHistory([])) }, [scenario, revision])
 const review = async (input:D) => { const result = await api(['billing','preview'].join('/'), input); setDraft(input); setPreview(result); setReviewed(true) }
 return <section className="card"><h2>Subscription actuals</h2>
  <details><summary>Import Stripe Billing</summary>
   <p>Review complete calendar months against accepted ledger revenue for the selected driver’s line and department. Run rates remain distinct from accounting revenue.</p>
   <p>This driver receives the Stripe account’s complete recurring totals. A month can be assigned to one subscription driver in each scenario.</p>
   <Form submit="Preview subscription actuals" onSubmit={v => review({ ...v, scenario, scenarioRevision:revision, explanations:notes })}>
    <Field label="Subscription driver" name="driver" options={options(drivers)}/><Field label="Billing from month" name="from" type="month"/><Field label="Billing through month" name="to" type="month"/>
   </Form>
  </details>
  {preview && draft && <>
   <h3>Review subscription movements</h3><BillingTables value={preview} currency={currency}/>
   {preview.reconciliation.map((r:D) => <label key={r.month}>Explanation for {r.month}<textarea aria-label={`Explanation for ${r.month}`} value={notes[r.month] ?? ''} onChange={e => { setNotes({ ...notes, [r.month]:e.target.value }); setReviewed(false) }}/></label>)}
   {reviewed && <Action label="Accept subscription actuals" run={async () => { await api(['billing','accept'].join('/'), { ...draft, digest:preview.digest }); setPreview(null); await onChange() }}/>}
  </>}
  {draft && !reviewed && <Action label="Review billing explanations" run={() => review({ ...draft, explanations:notes })}/>}
  {history.map(value => <details key={value.id}><summary>{value.from} through {value.to} · accepted subscription review</summary><BillingTables value={value} currency={currency}/></details>)}
  {drivers.filter(d => d.billingUndo?.resultingRevision === revision).map(d => <Action key={d.id} label={`Undo billing import · ${d.name}`} kind="quiet" run={async () => { await api(['billing','undo'].join('/'), { scenario, scenarioRevision:revision, driver:d.id }); await onChange() }}/>) }
 </section>
}

function BillingTables({ value, currency }: { value:D; currency:string }) {
 const amount = (n:number|null) => money(n, currency)
 return <>
  <Table caption="ARR bridge" heads={['Month','Opening MRR','New','Expansion','Contraction','Churn','Reactivation','Ending MRR','ARR','Customers','Gross retention','Net retention']}>
   {value.bridge.map((r:D) => <tr key={`${r.month}:${r.currency}`}><td>{r.month}</td>{['openingMrrCents','newMrrCents','expansionMrrCents','contractionMrrCents','churnMrrCents','reactivationMrrCents','endingMrrCents','arrCents'].map(k => <td key={k} className="num">{amount(r[k])}</td>)}<td>{r.activeCustomers}</td><td>{r.grossRevenueRetentionBps === null ? '—' : `${r.grossRevenueRetentionBps / 100}%`}</td><td>{r.netRevenueRetentionBps === null ? '—' : `${r.netRevenueRetentionBps / 100}%`}</td></tr>)}
  </Table>
  <Table caption="Monthly subscription cohorts" heads={['Cohort','Month','Original customers','Active customers','MRR']}>
   {value.cohorts.map((r:D) => <tr key={`${r.cohortMonth}:${r.month}:${r.currency}`}><td>{r.cohortMonth}</td><td>{r.month}</td><td>{r.customers}</td><td>{r.activeCustomers}</td><td className="num">{amount(r.mrrCents)}</td></tr>)}
  </Table>
  <Table caption="Billing to ledger reconciliation" heads={['Month','Service revenue','Ledger revenue','Difference','Deferred balance','Refunds','Tax','Explanation']}>
   {value.reconciliation.map((r:D) => <tr key={r.month}><td>{r.month}</td>{['serviceRevenueCents','ledgerRevenueCents','differenceCents','deferredCents','refundsCents','taxCents'].map(k => <td key={k} className="num">{amount(r[k])}</td>)}<td>{r.ledgerRevenueCents === null ? 'Accepted ledger revenue unavailable' : r.explanation || (r.complete ? 'Reconciled' : 'Explain this difference')}</td></tr>)}
  </Table>
 </>
}
