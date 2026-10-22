import { useEffect, useState } from 'react'
import { Action, api, Field, Form, money, Table, type D } from './shared'
export function PlaidConnection() {
 const [connection, setConnection] = useState<D | null>(null), [error, setError] = useState('')
 const load = async () => { setError(''); try { setConnection(await api('connections/plaid')) } catch (e) { setError((e as Error).message) } }
 useEffect(() => { void load() }, [])
 const snapshot = connection?.snapshot
 return <section className="card" aria-label="Plaid bank connection">
  <h2>Bank connection</h2><h3>Plaid</h3>
  <p className="muted">Read current depository balances and the last 30 days of posted transaction movement. No payment or transfer is initiated. Bank cash is restricted to finance with company-wide access. Credential administration requires a native finance session. Refreshes are manual.</p>
  {error && <p role="alert" className="error">{error}</p>}
  <Action label="Refresh Plaid status" kind="quiet" run={load} />
  {connection && <>
   <Table caption="Plaid connection" heads={['Setting', 'Value']}>
    <tr><td>Status</td><td>{connection.connected ? 'Connected' : 'Disconnected'}</td></tr>
    <tr><td>Read scope</td><td>{connection.scope}</td></tr><tr><td>Schedule</td><td>{connection.schedule}</td></tr>
    {connection.environment && <tr><td>Environment</td><td>{connection.environment}</td></tr>}
    {connection.suffix && <tr><td>Access token suffix</td><td>••••{connection.suffix}</td></tr>}
    {connection.owner && <tr><td>Owner</td><td>{connection.owner}</td></tr>}
    <tr><td>Last successful refresh</td><td>{connection.lastRefresh ?? 'No successful refresh yet'}</td></tr>
    <tr><td>Last refresh transactions</td><td>{connection.rowCount ?? 0}</td></tr>
    {connection.rateLimit && <tr><td>Rate limit</td><td>{connection.rateLimit}</td></tr>}
    {connection.providerRevocation && <tr><td>Disconnect revocation</td><td>{connection.providerRevocation.status === 'confirmed' ? 'Plaid confirmed item removal' : 'Not confirmed'} · {connection.providerRevocation.at}</td></tr>}
   </Table>
   {connection.error && <p role="alert" className="error">{connection.error}</p>}
   {!connection.connected ? <Form submit="Connect Plaid" onSubmit={async (values, form) => { await api('connections/plaid/connect', values); form.reset(); await load() }}>
    <Field label="Plaid environment" name="environment" defaultValue="sandbox" options={[{value:'sandbox',label:'Sandbox'},{value:'production',label:'Production'}]} />
    <Field label="Plaid client ID" name="clientId" type="password" />
    <Field label="Plaid secret" name="secret" type="password" />
    <Field label="Plaid access token" name="accessToken" type="password" hint="Use the access token for the bank item you have already authorized in Plaid. Credentials are sealed and excluded from archives." />
    <Field label="I approve read-only balances and transactions for every depository account in this item" name="consent" type="checkbox" />
   </Form> : <>
    <Action label="Refresh bank cash" run={async () => { await api('connections/plaid/refresh', {}); await load() }} />
    <Action label="Disconnect Plaid" kind="danger" confirm="Remove this Plaid item and delete its stored credentials?" run={async () => { await api('connections/plaid/disconnect', {}); await load() }} />
   </>}
   {snapshot && <>
    <p>Observed bank balance: {money(snapshot.balanceCents, snapshot.currency)} across {snapshot.accountCount} depository accounts · {snapshot.asOf}. Bank balances are not ledger actuals. {snapshot.excludedAccountCount} non-depository accounts excluded.</p>
    <p className="muted">Current observations expire after 24 hours or a failed refresh. Disconnect and restore retain aggregate history but require a fresh connection and refresh before using bank cash. Historical posted movements never add to the current balance again.</p>
    <Table caption="Posted bank movement" heads={['Date', 'Collections', 'Payments', 'Transactions']}>
     {snapshot.movements.map((r:D) => <tr key={r.date}><td>{r.date}</td><td className="num">{money(r.collections,snapshot.currency)}</td><td className="num">{money(r.payments,snapshot.currency)}</td><td>{r.count}</td></tr>)}
    </Table>
   </>}
   <p className="muted">Disconnect asks Plaid to remove the item and deletes local credentials even when Plaid cannot confirm removal.</p>
  </>}
 </section>
}
