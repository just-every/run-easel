import { useEffect, useState } from 'react'
import { Action, api, Field, Form, Table, type D } from './shared'

const CONNECT: Record<string, [string, string][]> = {
 snowflake: [['account', 'Snowflake account'], ['token', 'Snowflake token'], ['warehouse', 'Warehouse'], ['role', 'Role']],
 bigquery: [['projectId', 'BigQuery project ID'], ['clientId', 'Google OAuth client ID'], ['clientSecret', 'Google OAuth client secret'], ['refreshToken', 'Google refresh token']],
 databricks: [['host', 'Databricks workspace host'], ['token', 'Databricks token'], ['warehouseId', 'SQL warehouse ID']],
}
const secret = /secret|token/i

/** Warehouse metrics: finance connects a warehouse, reviews one read-only query per metric and approves its result. */
export function WarehouseInputs() {
 const [view, setView] = useState<D | null>(null), [error, setError] = useState(''), [preview, setPreview] = useState<D | null>(null)
 const load = async () => { setError(''); try { setView(await api('warehouse')) } catch (e) { setError((e as Error).message) } }
 useEffect(() => { void load() }, [])
 const connected = view?.connections.filter((c: D) => c.connected) ?? []
 return <section className="card" aria-label="Warehouse metrics">
  <h2>Warehouse metrics</h2>
  <p className="muted">Operational metrics such as active users flow in from Snowflake, BigQuery or Databricks through one read-only query per metric that finance reviews. Previewing changes nothing; a refresh runs only the approved query text; a usage revenue driver bound to the metric uses the measured month. Use a read-only role or grant. Easel parses one supported SELECT, refuses unknown functions, and limits each response to 600 rows and 4 MB within 25 seconds. Credentials are sealed and excluded from archives.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {view && <>
   {view.connections.map((c: D) => <div key={c.warehouse} className="pack">
    <h3>{c.label}{c.connected ? ' · connected' : ''}</h3>
    {c.connected
     ? <><p className="muted">{c.target}</p><Action kind="danger" label={`Disconnect ${c.label}`} confirm={`Disconnect ${c.label}? Stored metric values stay.`} run={async () => { await api(`warehouse/${c.warehouse}/disconnect`, {}); await load() }} /></>
     : <Form submit={`Connect ${c.label}`} onSubmit={async (v, form) => { await api(`warehouse/${c.warehouse}/connect`, v); form.reset(); await load() }}>
       {CONNECT[c.warehouse].map(([name, label]) => <Field key={name} label={label} name={name} type={secret.test(label) ? 'password' : 'text'} required={!['warehouse', 'role'].includes(name)} />)}
      </Form>}
   </div>)}
   {view.queries.map((q: D) => <div key={q.id} className="pack">
    <h3>{q.name} · {q.metric}</h3>
    <p className="muted">{q.warehouse} · {q.approved ? `approved by ${q.approved.by}` : 'needs review'}{q.lastRefresh ? ` · last refresh ${q.lastRefresh.at} (${q.lastRefresh.rows} months)` : ''}{q.periods.length ? ` · months ${q.periods[0]} to ${q.periods.at(-1)}` : ''}</p>
    <pre className="trace">{q.sql}</pre>
    <Action label="Preview result" run={async () => { const r = await api('warehouse-command/warehouse-query-preview', { id: q.id, revision: q.revision }); setPreview(r); await load() }} />
    {preview && preview.id === q.id && <Table caption={`Result of ${q.name}`} heads={['Period', 'Value']}>{preview.rows.map((r: D) => <tr key={r.period}><td>{r.period}</td><td className="num">{(r.hundredths / 100).toFixed(2)}</td></tr>)}</Table>}
    {preview && preview.id === q.id && <Action label="Approve this query and result" run={async () => { await api('warehouse-command/warehouse-query-approve', { id: q.id, revision: preview.revision, fingerprint: preview.fingerprint }); setPreview(null); await load() }} />}
    {q.approved && <Action label="Refresh metric" run={async () => { await api('warehouse-command/warehouse-refresh', { id: q.id, revision: q.revision }); await load() }} />}
    <Action kind="danger" label="Delete query" confirm="Delete this query and its stored metric values?" run={async () => { await api('warehouse-command/warehouse-query-delete', { id: q.id, revision: q.revision }); await load() }} />
   </div>)}
   {connected.length > 0 && <Form submit="Save query" onSubmit={async (v, form) => { await api('warehouse-command/warehouse-query-save', v); form.reset(); await load() }}>
    <Field label="Query name" name="name" />
    <Field label="Warehouse" name="warehouse" options={connected.map((c: D) => ({ value: c.warehouse, label: c.label }))} />
    <Field label="Metric name" name="metric" hint="Lowercase letters, digits and underscores. Bind a usage revenue driver to it by this name." />
    <Field label="Read-only query" name="sql" type="textarea" hint="Return a period (YYYY-MM) and a value, one row per month." />
   </Form>}
  </>}
 </section>
}
