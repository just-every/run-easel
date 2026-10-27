import { cents } from '../easel/units'
import { useEffect, useState } from 'react'
import { Action, addMonths, api, decimalText, Field, Form, money, Table, type D } from './shared'

const connectionPath = ['connections','spend'].join('/')
export function SpendConnections() {
 return <>{['ramp','purse','coaster','brex'].map(provider => <SpendConnection key={provider} provider={provider} />)}</>
}
function SpendConnection({ provider }: { provider: string }) {
 const label = provider === 'ramp' ? 'Ramp' : provider === 'purse' ? 'Purse' : provider === 'brex' ? 'Brex' : 'Coaster'
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
   {!status.configured && <p>Ask the installation owner to configure this spend connection.</p>}
   {status.canDisconnect && <Action label={`Disconnect ${label} spend`} kind="danger" run={async () => { await api(`${connectionPath}/${provider}/disconnect`, {}); await load() }} />}
   <p className="muted">{status.ownerStep}</p>
  </>}
 </section>
}

export function SpendReview({ state, refresh }: { state: D; refresh: () => Promise<void> }) {
 const forecasts = state.scenarios.filter((s: D) => s.kind === 'forecast' && s.status === 'working' && !s.sandbox)
 const [months, setMonths] = useState<string[]>([]), [amounts, setAmounts] = useState<Record<string, Record<string,string>>>({})
 const [scenario, setScenario] = useState(forecasts[0]?.id ?? ''), [view, setView] = useState<D | null>(null), [rows, setRows] = useState<D[]>([]), [orders, setOrders] = useState<string[]>([]), [providers, setProviders] = useState<string[]>([]), [reports, setReports] = useState<string[]>([]), [duplicates, setDuplicates] = useState<Record<string,string>>({}), [ledger, setLedger] = useState<D[]>([]), [ledgerMatches, setLedgerMatches] = useState<Record<string,string>>({}), [ledgerOrders, setLedgerOrders] = useState<Record<string,string>>({}), [ledgerParts, setLedgerParts] = useState<Record<string,string>>({}), [ledgerConfirmed, setLedgerConfirmed] = useState(false), [period, setPeriod] = useState(''), [driver, setDriver] = useState(''), [links, setLinks] = useState<Record<string,string>>({}), [preview, setPreview] = useState<D | null>(null), [reviews, setReviews] = useState<D[]>([]), [error, setError] = useState('')
 const load = async () => { if (scenario) setView(await api(`scenario/${scenario}`)); setReviews(await api('spend')) }
 useEffect(() => { setPreview(null); setRows([]); setDriver(''); setLedger([]); setLedgerMatches({}); setLedgerParts({}); setLedgerOrders({}); setLedgerConfirmed(false); setLinks({}); setDuplicates({}); void load().catch(e => setError(e.message)) }, [scenario, state])
 const drivers = (view?.inputs.expense ?? []).filter((d: D) => months.length ? d.kind === 'recurring' && months.every(m => m >= d.start && (!d.end || m <= d.end)) : d.kind === 'one-off' && d.start === period)
 const selected = drivers.find((d: D) => d.id === driver)
 const amountFor = (row: D, m: string) => { if (!months.length) return row.amount; try { return cents(amounts[`${row.provider}:${row.id}`]?.[m], 'Allocation', { negative: true }) } catch { return null } }
 const capture = () => ({ scenario, revision: view!.scenario.revision, driver, month: period, ...(months.length ? { months } : {}), orders, reports, providers, ledgerConfirmed, ledgerMapping: ledger.map(r => ({ row: r.id, ...(ledgerMatches[r.id] && ledgerParts[r.id] ? { matches: [{ source: ledgerMatches[r.id], amount: ledgerParts[r.id] }] } : { source: ledgerMatches[r.id] || null }), order: ledgerOrders[r.id] || null })), mapping: rows.map(r => ({ source: `${r.provider}:${r.id}`, line: selected.line, department: selected.department, month: period, ...(months.length ? { allocations: amounts[`${r.provider}:${r.id}`] } : {}), ...(links[`${r.provider}:${r.id}`] ? { order: links[`${r.provider}:${r.id}`] } : {}), duplicateOf: duplicates[`${r.provider}:${r.id}`] || null })) })
 return <section className="card"><h2>Committed spend</h2>
  <p>Review purchase orders, card spend and approved expense reports. Link payments to their PO so each amount counts once. Enter an allocation end month to review a recurring expense across months.</p>
  {error && <p role="alert">{error}</p>}
  <label>Spend forecast<select aria-label="Spend forecast" value={scenario} onChange={e => setScenario(e.target.value)}>{forecasts.map((s: D) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <Form submit="Read spend sources" onSubmit={async v => { setPreview(null); setRows([]); setDriver(''); setLinks({}); setDuplicates({}); const ids = String(v.orders).split(',').map(s => s.trim()).filter(Boolean), reportIds = String(v.reports ?? '').split(',').map(s => s.trim()).filter(Boolean); const selectedProviders = [...(v.ramp ? ['ramp'] : []), ...(v.brex ? ['brex'] : []), ...(v.purse ? ['purse'] : []), ...(reportIds.length ? ['coaster'] : [])]; const allocationMonths: string[] = []
    if (v.endMonth) { if (v.endMonth < v.month || v.endMonth > addMonths(v.month, 23)) throw new Error('Choose an allocation end month within twenty-four months'); for (let m = v.month; m <= v.endMonth; m = addMonths(m, 1)) allocationMonths.push(m) }
    setMonths(allocationMonths); setProviders(selectedProviders); setOrders(ids); setReports(reportIds); setPeriod(v.month); setLedger([]); setLedgerMatches({}); setLedgerParts({}); setLedgerOrders({}); setLedgerConfirmed(false)
    const sourceRows: D[] = await api(['spend','sources'].join('/'), { providers: selectedProviders, orders: ids, reports: reportIds, month: v.month, allPeriods: allocationMonths.length > 0 })
    setAmounts(Object.fromEntries(sourceRows.map(r => [`${r.provider}:${r.id}`, Object.fromEntries(allocationMonths.map((m, i) => [m, i === 0 ? decimalText(r.amount) : '0.00']))]))); setRows(sourceRows) }}>
   <Field label="Spend accounting month" name="month" type="month" defaultValue={state.workspace.planStart} />
   <Field label="Allocation end month for recurring expense" name="endMonth" type="month" required={false} />
   <Field label="Read Brex cards" name="brex" type="checkbox" defaultValue={false} /><Field label="Read Ramp cards" name="ramp" type="checkbox" defaultValue={true} /><Field label="Read Purse purchase orders" name="purse" type="checkbox" defaultValue={true} /><Field label="Purse PO IDs, separated by commas" name="orders" required={false} /><Field label="Coaster report IDs, separated by commas" name="reports" required={false} />
  </Form>
  {rows.length > 0 && <>
   <label>Replace forecast expense<select aria-label="Replace forecast expense" value={driver} onChange={async e => { const id = e.target.value; setDriver(id); setPreview(null); setLedger([]); setLedgerMatches({}); setLedgerParts({}); setLedgerOrders({}); setLedgerConfirmed(false); if (id) { try { const ledgerRows: D[] = []; for (const m of months.length ? months : [period]) { const value = await api(['spend','ledger'].join('/'), { scenario, revision: view!.scenario.revision, driver: id, month: m }); ledgerRows.push(...value.rows.map((r: D) => ({ ...r, allocationMonth: m }))) } setLedger(ledgerRows); setError('') } catch (e) { setError((e as Error).message) } } }}><option value="">Choose a forecast expense</option>{drivers.map((d: D) => <option key={d.id} value={d.id}>{d.name} · {d.start}</option>)}</select></label>
   {selected && <p>Mapping: {state.lines.find((l: D) => l.id === selected.line)?.name} · {state.departments.find((d: D) => d.id === selected.department)?.name} · {months.length ? months.join(", ") : period}. The current assumption of {money(selected.amountCents, state.workspace.currency)} will be replaced.</p>}
   <Table caption="Spend source mapping" heads={['Provider','Source','Source date','Amount','Paid against PO','Same actual as']}>
    {rows.map(r => { const key = `${r.provider}:${r.id}`; return <tr key={key}><td>{r.provider} · {r.kind}{r.status && ` · ${r.status}`}</td><td>{r.reference}</td><td>{r.sourceDate}</td><td>{money(r.amount,r.currency)}</td><td>{r.order ? r.order : r.kind === 'actual' ? <select aria-label={`PO link for ${r.id}`} value={links[key] ?? ''} onChange={e => { setLinks({ ...links, [key]: e.target.value }); setPreview(null) }}><option value="">Separate spend</option>{rows.filter(p => p.provider === 'purse' && p.kind === 'commitment').map(p => <option key={p.id} value={p.id}>{p.reference}</option>)}</select> : 'Commitment'}</td><td>{r.kind === 'actual' ? <select aria-label={`Duplicate actual for ${r.id}`} value={duplicates[key] ?? ''} onChange={e => { setDuplicates({ ...duplicates, [key]: e.target.value }); setPreview(null) }}><option value="">Distinct actual</option>{rows.filter(p => p.kind === 'actual' && p !== r && p.amount === r.amount).map(p => <option key={`${p.provider}:${p.id}`} value={`${p.provider}:${p.id}`}>{p.provider} · {p.reference}</option>)}</select> : 'Not an actual'}</td></tr> })}
   </Table>
   {selected && months.length > 0 && <Table caption="Monthly source allocation" heads={['Source','Source total',...months]}>
    {rows.map(r => { const key = `${r.provider}:${r.id}`; return <tr key={key}><td>{r.provider} · {r.reference}</td><td>{money(r.amount, r.currency)}</td>{months.map(m => <td key={m}><input aria-label={`Allocation for ${r.id} in ${m}`} inputMode="decimal" value={amounts[key]?.[m] ?? ''} onChange={e => { setAmounts({ ...amounts, [key]: { ...amounts[key], [m]: e.target.value } }); setPreview(null) }} /></td>)}</tr> })}
   </Table>}
   {selected && ledger.length > 0 && <>
    <p>Account for every ledger row. Match a source actual explicitly, entering a matched part when a payment spans ledger rows. The unmatched amount remains additional spend and optionally link its payment to a PO. No accounting entry is changed.</p>
    <Table caption="Spend ledger reconciliation" heads={['Ledger reference','Amount','Same source actual','Matched part','Paid against PO']}>
     {ledger.map(r => <tr key={r.id}><td>{r.reference || r.id} · {r.allocationMonth}</td><td>{money(r.amount,state.workspace.currency)}</td><td><select aria-label={`Source actual for ledger ${r.id}`} value={ledgerMatches[r.id] ?? ''} onChange={e => { setLedgerMatches({ ...ledgerMatches, [r.id]: e.target.value }); setLedgerOrders({ ...ledgerOrders, [r.id]: '' }); setPreview(null) }}><option value="">Additional actual</option>{rows.filter(p => p.kind === 'actual' && (r.amount >= 0 ? (amountFor(p, r.allocationMonth) ?? 0) > 0 : (amountFor(p, r.allocationMonth) ?? 0) < 0)).map(p => <option key={`${p.provider}:${p.id}`} value={`${p.provider}:${p.id}`}>{p.provider} · {p.reference}</option>)}</select></td><td><input aria-label={`Matched amount for ledger ${r.id}`} disabled={!ledgerMatches[r.id]} placeholder="Whole ledger row" inputMode="decimal" value={ledgerParts[r.id] ?? ''} onChange={e => { setLedgerParts({ ...ledgerParts, [r.id]: e.target.value }); setPreview(null) }} /></td><td><select aria-label={`PO link for ledger ${r.id}`} disabled={!!ledgerMatches[r.id] && !ledgerParts[r.id]} value={ledgerOrders[r.id] ?? ''} onChange={e => { setLedgerOrders({ ...ledgerOrders, [r.id]: e.target.value }); setPreview(null) }}><option value="">Separate spend</option>{rows.filter(p => p.provider === 'purse' && p.kind === 'commitment').map(p => <option key={p.id} value={p.id}>{p.reference}</option>)}</select></td></tr>)}
    </Table>
    <label className="check"><input type="checkbox" aria-label="I reviewed every ledger row" checked={ledgerConfirmed} onChange={e => { setLedgerConfirmed(e.target.checked); setPreview(null) }} />I reviewed every ledger row</label>
   </>}
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
 return <Table caption="Budget and committed spend" heads={['Line','Department','Month','Budget','Committed','Actual','Remaining','Released']}>
  {rows.flatMap(r => (r.cells ?? [r]).map((cell: D) => ({ ...cell, forecastChanged: r.forecastChanged }))).map(r => <tr key={`${r.driver}:${r.month}`}><td>{r.lineName ?? r.line}</td><td>{r.departmentName ?? r.department}</td><td>{r.month}{r.forecastChanged && <p role="status">Forecast changed; review again</p>}</td>{['budget','committed','actual','remaining','released'].map(k => <td key={k}>{money(r[k],r.currency ?? currency)}</td>)}</tr>)}
 </Table>
}
