import { useEffect, useState } from 'react'
import { activityDetail, activityRecord, eventLabel } from './activity-format'
import { StructureChange } from './structure-change'
import { api, Field, Form, Person, Table, type D } from './shared'

/** Finance can follow any record's history and export the same filtered trail. */
export function Activity({ state }: { state: D }) {
 const [rows, setRows] = useState<D[] | null>(null), [query, setQuery] = useState(''), [error, setError] = useState('')
 useEffect(() => { api('activity').then(setRows).catch(e => setError(e.message)) }, [])
 const search = async (values: D) => {
  const params = new URLSearchParams(Object.entries(values).filter(([, v]) => v))
  const next = await api(`activity?${params}`)
  setQuery(params.toString()); setRows(next)
 }
 return <section className="card">
  <h2>Activity</h2>
  <Form submit="Filter activity" onSubmit={search}>
   <label>Action<select aria-label="Action" name="action" defaultValue=""><option value="">All actions</option><option value="structure-version">Model structure versions</option></select></label>
   <Field label="Person email" name="actor" required={false} />
   <Field label="Record ID" name="record" required={false} />
   <Field label="Scenario" name="scenario" required={false} options={state.scenarios.map((s: D) => ({ value: s.id, label: s.name }))} />
   <Field label="From date" name="from" type="date" required={false} />
   <Field label="To date" name="to" type="date" required={false} />
  </Form>
  <p><a href={`/api/easel/activity.csv?${query}`} download>Export filtered activity as CSV</a> · <a href={`/api/easel/activity.xlsx?${query}`} download>Download activity (Excel)</a></p>
  {error && <p role="alert">{error}</p>}
  {!rows ? <p role="status">Loading activity…</p> : <>
  {rows.length === 0 && <p>No activity matches these filters.</p>}
  <Table className="activity-log" caption="Most recent first" heads={['When', 'Who', 'What', 'Record', 'Revision', 'Detail']}>
   {rows.map(r => <tr key={r.seq}><td data-label="When"><span><span className="date-token">{r.at.slice(0, 10)}</span>{' '}<span className="date-token">{r.at.slice(11, 19)}</span></span></td><td data-label="Who"><span><span title={r.actor}>{r.actorName || <Person state={state} email={r.actor} />}</span>{r.detail.authority?.type === 'agent' && <small style={{ display: 'block' }}>Agent: {r.detail.authority.name}</small>}</span></td><td data-label="What">{r.action === 'structure-version' ? 'Versioned model structure' : r.action === 'record-changed' ? 'Changed record values' : eventLabel(r.action)}</td><td data-label="Record"><span>{activityRecord(state, r)}<small style={{ display: 'block', overflowWrap: 'anywhere' }}>{r.record}</small></span></td><td data-label="Revision"><span style={{ overflowWrap: 'anywhere' }}>{r.detail.beforeRecordRevision ?? r.beforeRevision ?? '—'} → {r.detail.afterRecordRevision ?? r.afterRevision ?? '—'}</span></td><td className="wrap" data-label="Detail">{r.action === 'structure-version' ? <StructureChange state={state} detail={r.detail} /> : r.action === 'record-changed' ? <details><summary>Changed values ({r.detail.kind})</summary><p>Before</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(r.detail.before, null, 2)}</pre><p>After</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(r.detail.after, null, 2)}</pre></details> : activityDetail(state, r)}</td></tr>)}
  </Table>
  {rows.length === 300 && <button type="button" onClick={async () => {
   const next = await api(`activity?${query}&before=${rows.at(-1)!.seq}`)
   setRows(next)
  }}>Older activity</button>}
  </>}
 </section>
}
