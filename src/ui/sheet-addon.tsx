import { useEffect, useState } from 'react'
import { Action, api, Field, Form, Table, type D } from './shared'
import './sheet-addon.css'

/** Uses the same finance-only Connections surface as the other providers. */
export function SheetAddon() {
 const [status, setStatus] = useState<D | null>(null), [error, setError] = useState(''), [confirmation, setConfirmation] = useState('')
 const load = async () => { try { setStatus(await api('connections/sheets-addon')); setError('') } catch (e) { setStatus(null); setError((e as Error).message) } }
 useEffect(() => { void load() }, [])
 return <section className="card" aria-label="Google Sheets add-on" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
  <h2>Google Sheets add-on</h2>
  <p>Keep Easel values and report ranges live in a Google spreadsheet. Each connection belongs to one Easel person and one spreadsheet. Every refresh and input uses that person’s current permissions.</p>
  <p className="notice">Refreshed amounts are shared with everyone who can read the spreadsheet. Only aggregate cells and reports are pulled; individual compensation inputs and traces stay in Easel.</p>
  <p><a href="/google-sheets/Code.gs" download>Apps Script source</a> · <a href="/google-sheets/appsscript.json" download>Manifest</a> · <a href="/google-sheets/Sidebar.html" download>Sidebar</a></p>
  <p className="muted">Install these three files as an Editor add-on in your Google Workspace test deployment. Connect from its sidebar, then install the refresh triggers. Google host qualification requires a Workspace test domain.</p>
  {error && <p role="alert" className="error">{error}</p>}
  <Action label="Refresh add-on status" kind="quiet" run={load} />
  <Form submit="Create spreadsheet connection" onSubmit={async (values, form) => {
   setConfirmation(''); const result = await api('connections/sheets-addon/connect', values); form.reset()
   // Publish the confirmation link together with the refreshed connection status.
   await load(); setConfirmation(result.confirmationPath)
  }}>
   <Field label="Add-on connection name" name="label" />
   <Field label="Easel person email" name="person" type="email" hint="This person must already have signed in. Their current role, departments, dimensions and pay permissions are the maximum authority of this key." />
   <Field label="Google spreadsheet ID" name="spreadsheet" hint="The ID between /d/ and /edit in the spreadsheet URL. The key refuses every other spreadsheet." />
   <Field label="Add-on refresh schedule" name="schedule" options={[{ value: 'manual', label: 'On demand and on open' }, { value: 'hourly', label: 'Also hourly while closed' }]} />
   <Field label="Connection lifetime (days)" name="expiresInDays" type="number" defaultValue="30" />
   <Field label="Allow reviewed input write-back" name="writeBack" type="checkbox" required={false} hint="Viewers always read only. Existing browser submission and revision rules still apply." />
  </Form>
  {confirmation && <p className="notice" role="status">Connection approved. The named person must <a href={confirmation}>sign in and confirm their spreadsheet connection</a> to receive its private key. Share this link with them; it contains no credential.</p>}
  {status && !status.connections.length && <p>No spreadsheet add-on connections yet.</p>}
  {status?.connections.map((connection: D) => <article key={connection.id}>
   <h3>{connection.label}</h3>
   <Table className="sheet-addon-status" caption={`Add-on connection · ${connection.label}`} heads={['Setting', 'Value']}>
    <tr><td>Status</td><td>{connection.awaitingConfirmation ? 'Waiting for the named person to confirm' : connection.connected ? 'Connected' : 'Disconnected'}</td></tr>
    <tr><td>Private credential</td><td>{connection.credential ?? 'Removed'}</td></tr>
    <tr><td>Person refreshing</td><td>{connection.person}</td></tr>
    <tr><td>Finance owner</td><td>{connection.owner}</td></tr>
    <tr><td>Spreadsheet</td><td>{connection.spreadsheet}</td></tr>
    <tr><td>Scope</td><td>{connection.scope}</td></tr>
    <tr><td>Schedule</td><td>{connection.schedule === 'hourly' ? 'Hourly approved; sync triggers in the add-on' : 'On demand and on open'}</td></tr>
    <tr><td>Last successful refresh</td><td>{connection.lastRefresh ?? 'No successful refresh yet'}</td></tr>
    <tr><td>Last reported attempt</td><td>{connection.lastAttempt ?? 'No attempt reported yet'}{connection.reportedBy ? ` · ${connection.reportedBy}` : ''}</td></tr>
    <tr><td>Refreshed bindings</td><td>{connection.rowCount ?? 0}</td></tr>
    <tr><td>Errors</td><td>{connection.error ?? 'None recorded'}</td></tr>
    <tr><td>Rate limit</td><td>{connection.rateLimit ?? 'None recorded'}</td></tr>
    <tr><td>Expires</td><td>{new Date(connection.expiresAt).toISOString()}</td></tr>
   </Table>
   {connection.connected && <Action label={`Change refresh schedule · ${connection.label}`} kind="quiet" run={async () => { await api('connections/sheets-addon/schedule', { id: connection.id, schedule: connection.schedule === 'hourly' ? 'manual' : 'hourly' }); await load() }} />}
   {connection.configured && <Action label={`Disconnect add-on · ${connection.label}`} kind="danger" run={async () => { await api('connections/sheets-addon/disconnect', { id: connection.id }); await load() }} />}
   {connection.providerRevocation && <p role="status">Easel confirmed revocation of this add-on key. {connection.providerRevocation.ownerAction}.</p>}
  </article>)}
  <p className="muted">Disconnect deletes the sealed Easel key immediately and blocks further refreshes and writes. Google’s authorization is separate: remove it in Google Account → Security → Third-party connections, and remove the Apps Script triggers in Google. This installation does not hold or revoke a Google OAuth grant for the add-on.</p>
 </section>
}
