import { useEffect, useState } from 'react'
import { Action, api, Field, Form, Table } from './shared'

type Connection = {
 configured: boolean; connected: boolean; origin: string | null; suffix?: string; owner?: string
 connectedAt?: string; lastRefresh?: string; rowCount?: number
 scope: 'utilization:read'; schedule: 'Manual'; error: string | null; rateLimit: string | null
}

export function GaugeConnection() {
 const [connection, setConnection] = useState<Connection | null>(null)
 const [error, setError] = useState('')
 const load = async () => { setError(''); try { setConnection(await api('connections/gauge')) } catch (e) { setError((e as Error).message) } }
 useEffect(() => { void load() }, [])
 return <section className="card">
  <h2>Connections</h2>
  <h3>Gauge utilization</h3>
  <p className="muted">Read approved billable time and available time into a services driver. Refreshes are manual. Imported data stays in Easel after disconnecting, and frozen versions retain their captured data.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {!connection && !error && <p role="status">Loading Gauge connection…</p>}
  <Action label="Refresh connection status" kind="quiet" run={load} />
  {connection && <>
   <Table caption="Gauge connection" heads={['Setting', 'Value']}>
    <tr><td>Status</td><td>{connection.connected ? 'Key stored; checked when you preview an import' : 'Disconnected'}</td></tr>
    <tr><td>Origin</td><td>{connection.origin ?? 'Not configured'}</td></tr>
    <tr><td>Read scope</td><td>{connection.scope}</td></tr>
    <tr><td>Schedule</td><td>{connection.schedule}</td></tr>
    {connection.suffix && <tr><td>Stored key</td><td>••••{connection.suffix}</td></tr>}
    {connection.owner && <tr><td>Owner</td><td>{connection.owner}</td></tr>}
    {connection.connectedAt && <tr><td>Connected at</td><td>{connection.connectedAt}</td></tr>}
    <tr><td>Last successful refresh</td><td>{connection.lastRefresh ?? 'No successful refresh yet'}</td></tr>
    {connection.rowCount !== undefined && <tr><td>Last refresh rows</td><td>{connection.rowCount}</td></tr>}
    {connection.rateLimit && <tr><td>Rate limit</td><td>{connection.rateLimit}</td></tr>}
   </Table>
   {connection.error && <p role="alert" className="error">{connection.error}</p>}
   {!connection.configured && <p className="notice">Ask the installation owner to configure GAUGE_ORIGIN before connecting Gauge.</p>}
   {connection.configured && <Form submit={connection.connected ? 'Replace Gauge key' : 'Connect Gauge'} onSubmit={async (v, form) => {
    await api('connections/gauge/connect', { key: v.key }); form.reset(); await load()
   }}>
    <Field label="Gauge read key" name="key" type="password" hint="Create a utilization:read key in Gauge Access. The connection is verified when you preview an import." />
   </Form>}
   {connection.connected && <Action label="Disconnect Gauge" kind="danger" run={async () => { await api('connections/gauge/disconnect', {}); await load() }} />}
   <p className="muted">Disconnect removes the stored key from Easel. The Gauge owner can revoke it in Gauge Access; this bearer key cannot revoke itself.</p>
  </>}
 </section>
}
