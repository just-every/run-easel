import { useDate } from './shared'
import { useEffect, useState } from 'react'
import { activityAttribution, activityDetail, activityRecord, activityRevision, eventLabel } from './activity-format'
import { ActivityValues } from './activity-values'
import { StructureChange } from './structure-change'
import { api, Field, Form, Table, type D } from './shared'
import { Dots, DotText } from './dots'

/** Record names and details that join parts with " · " wrap without a dangling separator. */
const dotted = (text: string) => text.includes(' · ') ? <DotText text={text} /> : text

/** Finance can follow any record's history and export the same filtered trail. */
export function Activity({ state }: { state: D }) {
 const displayDate = useDate()
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
   <Field label="Record" name="record" required={false} options={[...new Map((rows ?? []).map(row => [row.record, { value: row.record, label: activityRecord(state, row) }] as const)).values()]} />
   <Field label="Scenario" name="scenario" required={false} options={state.scenarios.map((s: D) => ({ value: s.id, label: s.name }))} />
   <Field label="From date" name="from" type="date" required={false} />
   <Field label="To date" name="to" type="date" required={false} />
  </Form>
  <Dots as="p" className="downloads"><a href={`/api/easel/activity.csv?${query}`} download>Export filtered activity as CSV</a><a href={`/api/easel/activity.xlsx?${query}`} download>Download activity (Excel)</a></Dots>
  {error && <p role="alert">{error}</p>}
  {!rows ? <p role="status">Loading activity…</p> : <>
  {rows.length === 0 && <p>No activity matches these filters.</p>}
  <Table className="activity-log" caption="Most recent first" heads={['When', 'Who', 'What', 'Record', 'Revision', 'Detail']}>
   {rows.map(r => <tr key={r.seq}><td data-label="When"><span><span className="date-token">{displayDate(r.at.slice(0, 10))}</span>{' '}<span className="date-token">{r.at.slice(11, 19)}</span></span></td><td data-label="Who"><span><span title={r.actor}>{activityAttribution(r)}</span>{r.detail.authority?.approvers?.length > 0 && <span style={{ display: 'block' }}>Approved by {r.detail.authority.approvers.map((p: D) => p.name).join(', ')}</span>}</span></td><td data-label="What">{r.action === 'structure-version' ? 'Versioned model structure' : r.action === 'record-changed' ? 'Changed record values' : eventLabel(r.action)}</td><td data-label="Record">{dotted(activityRecord(state, r))}</td><td data-label="Revision">{activityRevision(r)}</td><td className="wrap" data-label="Detail">{r.action === 'structure-version' ? <StructureChange state={state} detail={r.detail} /> : r.action === 'record-changed' ? <ActivityValues state={state} detail={r.detail} /> : dotted(activityDetail(state, r, displayDate))}</td></tr>)}
  </Table>
  {rows.length === 300 && <button type="button" onClick={async () => {
   const next = await api(`activity?${query}&before=${rows.at(-1)!.seq}`)
   setRows(next)
  }}>Older activity</button>}
  </>}
 </section>
}
