import { useEffect, useState } from 'react'
import { activityDetail, activityRecord, eventLabel } from './activity-format'
import { api, Person, Table, type D } from './shared'

/** Who changed what, with the scenario revision before and after. */
export function Activity({ state }: { state: D }) {
 const [rows, setRows] = useState<D[] | null>(null)
 useEffect(() => { api('activity').then(setRows) }, [])
 if (!rows) return <section className="card"><p role="status">Loading activity…</p></section>
 return <section className="card">
  <h2>Activity</h2>
  <Table caption="Most recent first" heads={['When', 'Who', 'What', 'Record', 'Revision', 'Detail']}>
   {rows.map(r => <tr key={r.seq}><td><span className="date-token">{r.at.slice(0, 10)}</span>{' '}<span className="date-token">{r.at.slice(11, 19)}</span></td><td><span title={r.actor}>{r.actorName || <Person state={state} email={r.actor} />}</span></td><td>{eventLabel(r.action)}</td><td>{activityRecord(state, r)}</td><td>{r.beforeRevision ?? '—'} → {r.afterRevision ?? '—'}</td><td className="wrap">{activityDetail(state, r)}</td></tr>)}
  </Table>
 </section>
}
