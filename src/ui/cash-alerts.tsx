import { useEffect, useState } from 'react'
import { Action, api, command, decimalText, Field, Form, money as format, Person, Table, useDate, type D } from './shared'

type Rule = { id: string; name: string; kind: 'floor' | 'below-plan' | 'bank-below-plan' | 'runway'; basis?: 'amount' | 'percent'; amountCents?: number; percentBps?: number; runwayHundredths?: number; intervalDays: number; enabled: boolean; revision: number; currency: string; lastCheckedAt?: string; blocked?: string }
type Send = { n: number; at: string; reason: 'breach' | 'worse' | 'interval'; headline: string; detail: string[]; cause: string; recipients: string[] }
type Alert = { id: string; rule: string; ruleName: string; status: 'open' | 'ended'; openedAt: string; sends: Send[]; acknowledgments: { by: string; at: string; send: number }[]; endedAt?: string; endedReason?: string; revision: number }
type Check = { date: string; zone: string; scheduledAt: string; ranAt: string; sent: string[] }
type List = { zone: string; checkHour: number; rules: Rule[]; alerts: Alert[]; checks: Check[] }

const REASON = { breach: 'New breach', worse: 'Worsened', interval: 'Interval reminder' }
const condition = (r: Rule, money: (n?: number) => string) => r.kind === 'floor' ? 'Forecast cash below the agreed floor'
 : r.kind === 'runway' ? `Runway below ${decimalText(r.runwayHundredths)} months`
 : `${r.kind === 'bank-below-plan' ? 'Bank' : 'Actual'} cash more than ${r.basis === 'amount' ? money(r.amountCents) : `${decimalText(r.percentBps)}%`} below plan`

/** Finance-only: rules, the alerts they opened, their sends and acknowledgments (REPORT-006). */
export function CashAlerts({ state }: { state: D }) {
 const displayDate = useDate()
 const [list, setList] = useState<List | null>(null), [error, setError] = useState('')
 const [editing, setEditing] = useState<Rule | null>(null), [form, setForm] = useState(0)
 const [checked, setChecked] = useState<{ sent: string[]; blocked: { rule: string; reason: string }[] } | null>(null)
 const finance = state.me.role === 'finance'
 const reload = async () => { try { setList(await api('cash-alerts')); setError('') } catch (e) { setError((e as Error).message); throw e } }
 useEffect(() => { let live = true; if (finance) api('cash-alerts').then((v: List) => { if (live) { setList(v); setError('') } }, e => { if (live) setError((e as Error).message) }); return () => { live = false } }, [state, finance])
 if (!finance) return null
 const currency = state.workspace.currency
 const money = (n?: number) => n === undefined ? '' : format(n, currency)
 const zoneTime = (instant: string, zone: string) => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(instant))
 const last = list?.checks[0]
 return <section className="card" aria-label="Cash alerts">
  <h2>Cash alerts</h2>
  <p className="muted">Checked after every actuals refresh and month close, and daily at {String(list?.checkHour ?? 8).padStart(2, '0')}:00 {list?.zone ?? state.workspace.timeZone}. A breach notifies active finance once, by each person's notification preference; it notifies again only when it worsens or after its re-alert interval. Actual cash uses accepted ledger figures. Bank rules use a fresh Plaid observation against the approved budget’s dated cash on that date; bank balances are not ledger actuals.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {last && <p>Last scheduled check {displayDate(last.date)}: scheduled {zoneTime(last.scheduledAt, last.zone)}, ran {zoneTime(last.ranAt, last.zone)}.</p>}
  <Action label="Check cash alerts" run={async () => { setChecked(await command('cash-alert-check', {})); await reload() }} />
  {checked && <p role="status">{checked.sent.length} {checked.sent.length === 1 ? 'alert sent' : 'alerts sent'}.{checked.blocked.length ? ` ${checked.blocked.length} not checked; see the rules below.` : ''}</p>}
  {list && (list.alerts.length ? <ul className="plain">{list.alerts.map(a => {
   const latest = a.sends[a.sends.length - 1]
   const acked = a.acknowledgments.find(k => k.send === latest.n)
   return <li key={a.id} id={`cash-alert-${a.id}`}>
    <h3>{a.ruleName} <span className="pill">{a.status === 'open' ? 'Open' : 'Ended'}</span></h3>
    <p>{latest.headline}.</p>
    <ul>{latest.detail.map((d, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{d}</li>)}</ul>
    <p style={{ overflowWrap: 'anywhere' }}>Cause: {latest.cause}.</p>
    <Table caption={`Alerts sent for ${a.ruleName}`} heads={['Alert', 'Why', 'Sent', 'Recipients']}>
     {a.sends.map(s => <tr key={s.n}><td>{s.n}</td><td>{REASON[s.reason]}</td><td><span className="date-token">{displayDate(s.at)}</span></td><td className="wrap">{s.recipients.length ? s.recipients.map(r => <Person key={r} state={state} email={r} />) : 'No active finance recipient'}</td></tr>)}
    </Table>
    {a.acknowledgments.map(k => <p key={`${k.send}-${k.at}`}>Alert {k.send} acknowledged by <Person state={state} email={k.by} /> at <span className="date-token">{displayDate(k.at)}</span>.</p>)}
    {a.status === 'ended' && <p className="muted">Ended <span className="date-token">{displayDate(a.endedAt)}</span>: {a.endedReason}.</p>}
    {!acked && <Action label={`Acknowledge alert ${latest.n}`} run={async () => { await command('cash-alert-acknowledge', { id: a.id, revision: a.revision }); await reload() }} />}
   </li>
  })}</ul> : <p>No cash alerts.</p>)}
  {list && (list.rules.length ? <Table caption="Cash alert rules" heads={['Rule', 'Alerts when', 'Re-alert', 'Status', 'Last checked', '']}>
   {list.rules.map(r => <tr key={r.id}>
    <td className="wrap">{r.name}<small style={{ display: 'block' }}>Revision {r.revision}</small></td>
    <td className="wrap">{condition(r, money)}</td>
    <td className="wrap">After {r.intervalDays} company-zone {r.intervalDays === 1 ? 'day' : 'days'}, or on worsening</td>
    <td className="wrap"><span className="pill">{r.enabled ? 'Enabled' : 'Disabled'}</span>{r.blocked && <p className="error">{r.blocked}</p>}</td>
    <td><span className="date-token">{r.lastCheckedAt ? displayDate(r.lastCheckedAt) : 'Not checked'}</span></td>
    <td><button type="button" className="quiet" onClick={() => setEditing(r)}>Edit rule</button></td>
   </tr>)}
  </Table> : <p>No cash alert rules yet.</p>)}
  <h3>{editing ? `Edit ${editing.name}` : 'New cash alert rule'}</h3>
  {editing && <button type="button" className="quiet" onClick={() => { setEditing(null); setForm(n => n + 1) }}>Cancel editing</button>}
  <RuleForm key={editing ? `${editing.id}-${editing.revision}` : `new-${form}`} rule={editing} currency={currency} saved={async () => { await reload(); setEditing(null); setForm(n => n + 1) }} />
 </section>
}

function RuleForm({ rule, currency, saved }: { rule: Rule | null; currency: string; saved: () => Promise<void> }) {
 const [kind, setKind] = useState<Rule['kind']>(rule?.kind ?? 'floor')
 const [basis, setBasis] = useState<'amount' | 'percent'>(rule?.basis ?? 'amount')
 return <Form submit={rule ? 'Save cash alert rule' : 'Add cash alert rule'} onSubmit={async v => {
  await command('cash-alert-rule-save', { ...(rule ? { id: rule.id, revision: rule.revision } : {}), name: v.name, kind, intervalDays: Number(v.intervalDays), enabled: v.enabled,
   ...(['below-plan','bank-below-plan'].includes(kind) ? { basis, ...(basis === 'amount' ? { amount: v.amount } : { percent: v.percent }) } : kind === 'runway' ? { runway: v.runway } : {}) })
  await saved()
 }}>
  <Field label="Rule name" name="name" defaultValue={rule?.name} />
  <label>Alert when<select aria-label="Alert when" name="kind" value={kind} onChange={e => setKind(e.target.value as Rule['kind'])}>
   <option value="floor">Forecast cash falls below the agreed floor</option><option value="below-plan">Actual cash is below plan</option><option value="bank-below-plan">Observed Plaid bank cash is below plan</option><option value="runway">Runway falls below a minimum</option>
  </select></label>
  {['below-plan','bank-below-plan'].includes(kind) && <>
   <label>Shortfall measured as<select aria-label="Shortfall measured as" name="basis" value={basis} onChange={e => setBasis(e.target.value as 'amount' | 'percent')}><option value="amount">An amount</option><option value="percent">A percent of plan</option></select></label>
   {basis === 'amount' ? <Field label={`Shortfall amount (${currency})`} name="amount" defaultValue={decimalText(rule?.amountCents)} hint="Alerts when actual cash is more than this below the approved budget." />
    : <Field label="Shortfall percent" name="percent" defaultValue={decimalText(rule?.percentBps)} hint="Alerts when actual cash is more than this percent below the approved budget." />}
  </>}
  {kind === 'runway' && <Field label="Runway minimum (months)" name="runway" defaultValue={decimalText(rule?.runwayHundredths)} hint="Alerts when forecast runway is below this many months." />}
  <Field label="Re-alert interval (days)" name="intervalDays" defaultValue={rule?.intervalDays ?? 7} hint="An unchanged breach alerts again after this many company-zone days." />
  <Field label="Enabled" name="enabled" type="checkbox" defaultValue={rule?.enabled ?? true} />
 </Form>
}
