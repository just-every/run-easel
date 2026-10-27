import { useEffect, useState } from 'react'
import { Action, api, Field, Form, money, Table, type D } from './shared'

const connectionPath = ['connections','spend'].join('/')
export function SpendConnections() {
 return <>{['ramp','purse'].map(provider => <SpendConnection key={provider} provider={provider} />)}</>
}
function SpendConnection({ provider }: { provider: string }) {
 const label = provider === 'ramp' ? 'Ramp' : 'Purse'
 const [status, setStatus] = useState<D | null>(null), [error, setError] = useState('')
 const load = async () => { try { setStatus(await api(`${connectionPath}/${provider}`)); setError('') } catch (e) { setError((e as Error).message) } }
 useEffect(() => { void load() }, [provider])
 return <section className="card"><h2>{label} spend connection</h2>
  {error && <p role="alert">{error}</p>}
  {status && <>
   <Table caption={`${label} spend connection`} heads={['Setting','Value']}>
    <tr><td>Status</td><td>{status.connected ? 'Connected' : 'Disconnected'}</td></tr>
    <tr><td>Scope</td><td>{status.scope}</td></tr><tr><td>Schedule</td><td>{status.schedule}</td></tr>
    {status.owner && <tr><td>Owner</td><td>{status.owner}</td></tr>}
    {status.suffix && <tr><td>Credential</td><td>••••{status.suffix}</td></tr>}
    <tr><td>Last accepted refresh</td><td>{status.lastRefresh ?? 'Not yet read'}</td></tr>
    <tr><td>Source rows</td><td>{status.rowCount ?? 0}</td></tr>
    {status.rateLimit && <tr><td>Rate limit</td><td>{status.rateLimit}</td></tr>}
   </Table>
   {status.error && <p role="alert">{status.error}</p>}
   {!status.connected && status.configured && <Form submit={`Connect ${label} spend`} onSubmit={async (v, form) => { await api(`${connectionPath}/${provider}/connect`, v); form.reset(); await load() }}>
    <Field label={`${label} read-only credential`} name="key" type="password" />
    <Field label={`Allow read-only ${label} spend access`} name="consent" type="checkbox" />
   </Form>}
   {!status.configured && <p>Ask the installation owner to configure the Purse connection.</p>}
   {status.canDisconnect && <Action label={`Disconnect ${label} spend`} kind="danger" run={async () => { await api(`${connectionPath}/${provider}/disconnect`, {}); await load() }} />}
   <p className="muted">{status.ownerStep}</p>
  </>}
 </section>
}

export function SpendReview({ state, refresh }: { state: D; refresh: () => Promise<void> }) {
 const forecasts = state.scenarios.filter((s: D) => s.kind === 'forecast' && s.status === 'working' && !s.sandbox)
 const [scenario, setScenario] = useState(forecasts[0]?.id ?? ''), [view, setView] = useState<D | null>(null), [rows, setRows] = useState<D[]>([]), [orders, setOrders] = useState<string[]>([]), [period, setPeriod] = useState(''), [driver, setDriver] = useState(''), [links, setLinks] = useState<Record<string,string>>({}), [preview, setPreview] = useState<D | null>(null), [reviews, setReviews] = useState<D[]>([]), [error, setError] = useState('')
 const load = async () => { if (scenario) setView(await api(`scenario/${scenario}`)); setReviews(await api('spend')) }
 useEffect(() => { setPreview(null); setRows([]); setDriver(''); void load().catch(e => setError(e.message)) }, [scenario, state])
 const drivers = (view?.inputs.expense ?? []).filter((d: D) => d.kind === 'one-off' && d.start === period)
 const selected = drivers.find((d: D) => d.id === driver)
 const capture = () => ({ scenario, revision: view!.scenario.revision, driver, month: selected.start, orders, mapping: rows.map(r => ({ source: `${r.provider}:${r.id}`, line: selected.line, department: selected.department, month: selected.start, ...(links[r.id] ? { order: links[r.id] } : {}) })) })
 return <section className="card"><h2>Committed spend</h2>
  <p>Review cleared Ramp cards and selected issued Purse purchase orders. Linked card payments reduce the open commitment once. Acceptance replaces the selected one-off forecast assumption; it never posts accounting entries or initiates payments.</p>
  {error && <p role="alert">{error}</p>}
  <label>Spend forecast<select aria-label="Spend forecast" value={scenario} onChange={e => setScenario(e.target.value)}>{forecasts.map((s: D) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <Form submit="Read spend sources" onSubmit={async v => { setPreview(null); setRows([]); setDriver(''); const ids = String(v.orders).split(',').map(s => s.trim()).filter(Boolean); setOrders(ids); setPeriod(v.month); setRows(await api(['spend','sources'].join('/'), { orders: ids, month: v.month })) }}>
   <Field label="Spend accounting month" name="month" type="month" defaultValue={state.workspace.planStart} />
   <Field label="Purse PO IDs, separated by commas" name="orders" />
  </Form>
  {rows.length > 0 && <>
   <label>Replace forecast expense<select aria-label="Replace forecast expense" value={driver} onChange={e => { setDriver(e.target.value); setPreview(null) }}><option value="">Choose a one-off expense</option>{drivers.map((d: D) => <option key={d.id} value={d.id}>{d.name} · {d.start}</option>)}</select></label>
   {selected && <p>Mapping: {state.lines.find((l: D) => l.id === selected.line)?.name} · {state.departments.find((d: D) => d.id === selected.department)?.name} · {selected.start}. The current assumption of {money(selected.amountCents, state.workspace.currency)} will be replaced.</p>}
   <Table caption="Spend source mapping" heads={['Provider','Source','Source date','Amount','Paid against PO']}>
    {rows.map(r => <tr key={`${r.provider}:${r.id}`}><td>{r.provider}</td><td>{r.reference}</td><td>{r.sourceDate}</td><td>{money(r.amount,r.currency)}</td><td>{r.provider === 'ramp' ? <select aria-label={`PO link for ${r.id}`} value={links[r.id] ?? ''} onChange={e => { setLinks({ ...links, [r.id]: e.target.value }); setPreview(null) }}><option value="">Separate spend</option>{rows.filter(p => p.provider === 'purse').map(p => <option key={p.id} value={p.id}>{p.reference}</option>)}</select> : 'Commitment'}</td></tr>)}
   </Table>
   {selected && <Action label="Preview committed spend" run={async () => { setPreview(null); setPreview(await api(['spend','preview'].join('/'), capture())) }} />}
  </>}
  {preview && <>
   <SpendAmounts rows={[preview]} currency={state.workspace.currency} />
   <Action label="Accept reviewed spend" run={async () => { await api(['spend','accept'].join('/'), { ...capture(), fingerprint: preview.fingerprint }); setPreview(null); setRows([]); await refresh(); await load() }} />
  </>}
  {reviews.length > 0 && <><h3>Accepted spend reviews</h3><p>These are the source amounts at acceptance. A later forecast edit requires a fresh review.</p><SpendAmounts rows={reviews.filter(r => r.scenario === scenario)} currency={state.workspace.currency} /></>}
 </section>
}
function SpendAmounts({ rows, currency }: { rows: D[]; currency: string }) {
 return <Table caption="Budget and committed spend" heads={['Month','Budget','Committed','Card actual','Remaining']}>
  {rows.map(r => <tr key={r.driver}><td>{r.month}{r.forecastChanged && <p role="status">Forecast changed; review again</p>}</td>{['budget','committed','actual','remaining'].map(k => <td key={k}>{money(r[k],r.currency ?? currency)}</td>)}</tr>)}
 </Table>
}
