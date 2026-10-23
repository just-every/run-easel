import { useEffect, useState } from 'react'
import { Action, api, Field, Form, Table } from './shared'

type Connection = {
 configured: boolean; connected: boolean; origin: string | null; suffix?: string; owner?: string
 connectedAt?: string; lastRefresh?: string; rowCount?: number; lastChecked?: string; checkedMonth?: string
 providerRevocation?: { status: string; at: string; httpStatus: number | null }
 refreshSchedule?: { cadence: string; month: string }; timeZone: string; stale: boolean; scheduledAt?: string; dispatchedAt?: string;
 scope: 'utilization:read'; schedule: string; error: string | null; rateLimit: string | null
}

export function GaugeConnection() {
 const [connection, setConnection] = useState<Connection | null>(null)
 const [error, setError] = useState('')
 const load = async () => { setError(''); try { setConnection(await api('connections/gauge')) } catch (e) { setError((e as Error).message) } }
 useEffect(() => { void load() }, [])
 return <section className="card">
  <h2>Connections</h2>
  <h3>Gauge utilization</h3>
  <p className="muted">Read approved billable time and available time into a services driver. Scheduled observations check the chosen month without changing reviewed imports. Accept model changes in Plan. Imported data stays in Easel after disconnecting, and frozen versions retain their captured data.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {!connection && !error && <p role="status">Loading Gauge connection…</p>}
  <Action label="Refresh connection status" kind="quiet" run={load} />
  {connection && <>
   <Table caption="Gauge connection" heads={['Setting', 'Value']}>
    <tr><td>Status</td><td>{connection.connected ? 'Key stored; checked when you preview an import' : 'Disconnected'}</td></tr>
    <tr><td>Origin</td><td>{connection.origin ?? 'Not configured'}</td></tr>
    <tr><td>Read scope</td><td>{connection.scope}</td></tr>
    <tr><td>Schedule</td><td>{connection.schedule} · {connection.timeZone}</td></tr>
    {connection.suffix && <tr><td>{connection.connected ? 'Stored key' : 'Last key suffix'}</td><td>••••{connection.suffix}</td></tr>}
    {connection.owner && <tr><td>Owner</td><td>{connection.owner}</td></tr>}
    {connection.connectedAt && <tr><td>Connected at</td><td>{connection.connectedAt}</td></tr>}
    {connection.lastChecked && <tr><td>Last connection check</td><td>{connection.lastChecked}</td></tr>}
    {connection.checkedMonth && <tr><td>Last checked month</td><td>{connection.checkedMonth}</td></tr>}
    <tr><td>Source freshness</td><td>{connection.stale ? 'Stale — check the source before using its numbers' : 'Current observation'}</td></tr>
    {connection.scheduledAt && <tr><td>Scheduled observation</td><td>{connection.scheduledAt} · dispatched {connection.dispatchedAt}</td></tr>}
    <tr><td>Last successful refresh</td><td>{connection.lastRefresh ?? 'No successful refresh yet'}</td></tr>
    {connection.rowCount !== undefined && <tr><td>Last refresh rows</td><td>{connection.rowCount}</td></tr>}
    {connection.providerRevocation && <tr><td>Disconnect revocation</td><td>{connection.providerRevocation.status === 'confirmed' ? 'Gauge confirmed revocation' : 'Not confirmed'} · {connection.providerRevocation.at}</td></tr>}
    {connection.rateLimit && <tr><td>Rate limit</td><td>{connection.rateLimit}</td></tr>}
   </Table>
   {connection.error && <p role="alert" className="error">{connection.error}</p>}
   {!connection.configured && <p className="notice">Ask the installation owner to configure GAUGE_ORIGIN before connecting Gauge.</p>}
   {connection.configured && <Form submit={connection.connected ? 'Replace Gauge key' : 'Connect Gauge'} onSubmit={async (v, form) => {
    await api('connections/gauge/connect', { key: v.key }); form.reset(); await load()
   }}>
    <Field label="Gauge read key" name="key" type="password" hint="Create a utilization:read key in Gauge Access. The connection is verified when you preview an import." />
   </Form>}
   {connection.connected && <Form submit="Check Gauge connection" onSubmit={async v => { await api('connections/gauge/check', { month: v.month }); await load() }}>
    <Field label="Connection check month" name="month" type="month" defaultValue={new Date().toISOString().slice(0, 7)} hint="Reads Gauge's aggregate for this month and records connection health. No utilization is imported." />
   </Form>}
   {connection.connected && <Form submit="Save Gauge schedule" onSubmit={async v => { await api('connections/gauge/schedule', { cadence: v.cadence, month: v.month, consent: v.consent === true }); await load() }}>
    <label>Observation cadence<select name="cadence" defaultValue={connection.refreshSchedule?.cadence ?? 'manual'}><option value="manual">Manual</option><option value="hourly">Hourly</option><option value="nightly">Nightly at 03:00</option><option value="weekly">Monday at 03:00</option></select></label>
    <Field label="Scheduled observation month" name="month" type="month" defaultValue={connection.refreshSchedule?.month ?? new Date().toISOString().slice(0, 7)} />
    <Field label={`Allow scheduled read-only observations in ${connection.timeZone}`} name="consent" type="checkbox" required={false} />
   </Form>}
   {connection.connected && <Action label="Disconnect Gauge" kind="danger" run={async () => { await api('connections/gauge/disconnect', {}); await load() }} />}
   <p className="muted">Disconnect asks Gauge to revoke this key and removes the stored key from Easel even when Gauge cannot confirm revocation.</p>
  </>}
 </section>
}
