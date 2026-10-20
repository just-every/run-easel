import { useDate } from './shared'
import { useEffect, useRef, useState } from 'react'
import { Action, api, command, Field, Form, money, monthLabel, Person, Table, type D } from './shared'

type Summary = { id: string; month: string; label: string; department: string; departmentName: string; createdAt: string }
type Citation = { file: string; line: number; date: string; description: string; reference: string; amount: number }
type StatementRow = { key: string; line: string; lineName: string; actual: number; budget: number; variance: number; citations: Citation[]; explanation: null | { text: string; status: string } }
type Delivery = { recipient: string; status: 'pending' | 'accepted' | 'suppressed' | 'uncertain' | 'sending' | 'blocked'; attempts: number; providerStatus: string | null; reason: string | null }
type Statement = Summary & { currency: string; rows: StatementRow[]; topVariances: StatementRow[]; toConfirm: StatementRow[]; tasks: { id: string; name: string; owner: string; due: string; revision: number; evidence: { summary: string } }[]; deliveries: Delivery[] }
const deliveryLabels: Record<Delivery['status'], string> = {
 pending: 'Pending', accepted: 'Accepted by mail provider', suppressed: 'Email suppressed in local development',
 uncertain: 'Mail provider acceptance uncertain', sending: 'Dispatch claimed; outcome not yet recorded', blocked: 'Blocked',
}

function rememberStatement(id: string) {
 const url = new URL(window.location.href)
 if (id) url.searchParams.set('departmentStatement', id)
 else url.searchParams.delete('departmentStatement')
 window.history.replaceState(window.history.state, '', url)
}

/** Authorized, persisted statements for a closed month's departments. */
export function DepartmentStatements({ state, month, setMonth, refresh }: { state: D; month: string; setMonth: (month: string) => void; refresh: () => Promise<void> }) {
 const [summaries, setSummaries] = useState<Summary[]>([])
 const [selected, setSelected] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState('')
 const initialLink = useRef(true)
 useEffect(() => {
  let live = true
  setLoading(true); setError(''); setSummaries([])
  api('department-statements').then((records: Summary[]) => {
   if (!live) return
   setSummaries(records); setLoading(false)
   if (initialLink.current) {
    initialLink.current = false
    const remembered = new URL(window.location.href).searchParams.get('departmentStatement')
    const linked = records.find(record => record.id === remembered)
    if (linked) { setSelected(linked.id); setMonth(linked.month) }
   }
  }, e => { if (live) { setError(e.message); setLoading(false) } })
  return () => { live = false }
 }, [state, setMonth])
 const records = summaries.filter(record => record.month === month)
 const selectedRecord = records.find(record => record.id === selected) ?? records[0]
 const choose = (id: string) => { setSelected(id); rememberStatement(id) }
 return <section className="card">
  <h2>Department statements</h2>
  <p className="muted">Monthly statements for {monthLabel(month)} with accepted source rows, explanations and open tasks.</p>
  {loading && <p role="status">Loading department statements…</p>}
  {error && <p role="alert" className="error">{error}</p>}
  {!loading && !error && (records.length ? <>
   <label>Department statement<select aria-label="Department statement" value={selectedRecord.id} onChange={e => choose(e.target.value)}>
    {records.map(record => <option key={record.id} value={record.id}>{record.departmentName} · {record.label}</option>)}
   </select></label>
   <SavedStatement key={selectedRecord.id} id={selectedRecord.id} state={state} refresh={refresh} />
  </> : <p className="muted">No department statements available for this month.</p>)}
 </section>
}

function SavedStatement({ id, state, refresh }: { id: string; state: D; refresh: () => Promise<void> }) {
 const displayDate = useDate()
 const [statement, setStatement] = useState<Statement | null>(null), [error, setError] = useState('')
 const [revision, setRevision] = useState(0)
 useEffect(() => {
  let live = true
  setStatement(null); setError('')
  api(`department-statements/${encodeURIComponent(id)}`).then(record => { if (live) setStatement(record) }, e => { if (live) setError(e.message) })
  return () => { live = false }
 }, [id, state, revision])
 const retry = async () => { await command('department-statement-retry', { id }); setRevision(value => value + 1) }
 if (error) return <>
  <p role="alert" className="error">{error}</p>
  {state.me.role === 'finance' && error === 'Statement is queued for preparation; finance can retry it' && <Action label="Retry pending email" run={retry} />}
 </>
 if (!statement) return <p role="status">Loading statement…</p>
 const canRetry = statement.deliveries.some(delivery => ['pending', 'suppressed', 'blocked'].includes(delivery.status))
 return <>
  <h3>{statement.departmentName} · {statement.label}</h3>
  <p><a href={`/api/easel/department-statements/${encodeURIComponent(id)}/document.xlsx`} download>Download department statement (Excel)</a></p>
  <StatementAmounts caption="Department statement amounts" rows={statement.rows} currency={statement.currency} />
  <h3>Top variances</h3>
  {statement.topVariances.length ? <StatementAmounts caption="Top department variances" rows={statement.topVariances} currency={statement.currency} /> : <p className="muted">No variances.</p>}
  <h3>Explanations needing confirmation</h3>
  {statement.toConfirm.length ? <ul className="plain">{statement.toConfirm.map(row => <li key={row.key}><a href={`#${encodeURIComponent(rowAnchor(id, row.key))}`}>{row.lineName}</a> · {row.explanation ? row.explanation.status : 'No explanation'}</li>)}</ul> : <p className="muted">No explanations need confirmation.</p>}
  <h3>Accepted sources and explanations</h3>
  {statement.rows.map(row => <details id={rowAnchor(id, row.key)} key={row.key} className="card-row" open={statement.toConfirm.some(pending => pending.key === row.key)}>
   <summary>{row.lineName} · variance {money(row.variance, statement.currency)} · {row.explanation ? `explanation ${row.explanation.status}` : 'No explanation'}</summary>
   {row.citations.length ? <Table caption={`Accepted rows for ${row.lineName}`} heads={['File', 'Line', 'Date', 'Description', 'Reference', 'Amount']}>
    {row.citations.map((citation, index) => <tr key={index}><td>{citation.file}</td><td className="num">{citation.line}</td><td><span className="date-token">{displayDate(citation.date)}</span></td><td>{citation.description}</td><td>{citation.reference}</td><td className="num">{money(citation.amount, statement.currency)}</td></tr>)}
   </Table> : <p className="muted">No accepted source rows for this line.</p>}
   {row.explanation && <p><strong>Explanation ({row.explanation.status}):</strong> {row.explanation.text}</p>}
   <Form key={`${row.key}-${row.explanation?.text ?? ''}-${row.explanation?.status ?? ''}`} submit="Save explanation" onSubmit={async values => {
    await command('explanation', { month: statement.month, line: row.line, department: statement.department, text: values.text }); await refresh()
   }}>
    <Field label={`Statement explanation for ${row.lineName} · ${statement.departmentName}`} name="text" type="textarea" defaultValue={row.explanation?.text ?? ''} />
   </Form>
   {row.explanation && row.explanation.status !== 'confirmed' && <Action label="Confirm explanation" run={async () => {
    await command('explanation-confirm', { month: statement.month, line: row.line, department: statement.department }); await refresh()
   }} />}
  </details>)}
  <h3>Open tasks</h3>
  {statement.tasks.length ? <Table caption="Open department tasks" heads={['Task', 'Owner', 'Due', 'Evidence']}>
   {statement.tasks.map(task => <tr key={task.id}><th scope="row">{task.name}</th><td><Person state={state} email={task.owner} /></td><td><span className="date-token">{displayDate(task.due)}</span></td><td className="wrap">{task.evidence.summary}</td></tr>)}
  </Table> : <p className="muted">No open tasks.</p>}
  <h3>Email status</h3>
  {statement.deliveries.length ? <Table caption="Department statement email status" heads={['Recipient', 'Status', 'Attempts', 'Provider status', 'Reason']}>
   {statement.deliveries.map(delivery => <tr key={delivery.recipient}><td><Person state={state} email={delivery.recipient} /></td><td className="wrap">{deliveryLabels[delivery.status]}</td><td className="num">{delivery.attempts}</td><td>{delivery.providerStatus || '—'}</td><td className="wrap">{delivery.reason || '—'}</td></tr>)}
  </Table> : <p className="muted">No email recipients.</p>}
  {state.me.role === 'finance' && canRetry && <Action label="Retry pending email" run={retry} />}
 </>
}

const rowAnchor = (id: string, key: string) => `statement-${encodeURIComponent(id)}-${encodeURIComponent(key)}`

function StatementAmounts({ caption, rows, currency }: { caption: string; rows: StatementRow[]; currency: string }) {
 return <Table caption={caption} heads={['Line', 'Actual', 'Budget', 'Variance']}>
  {rows.map(row => <tr key={row.key}><th scope="row">{row.lineName}</th><td className="num">{money(row.actual, currency)}</td><td className="num">{money(row.budget, currency)}</td><td className="num">{money(row.variance, currency)}</td></tr>)}
 </Table>
}
