import { useEffect, useState } from 'react'
import { Action, api, command, Field, Form, type D } from './shared'

/** The read-only dataset behind a saved report, and finance's nightly CSV/Parquet drops of it. */
export function BiFeeds({ id }: { id: string }) {
 const [drops, setDrops] = useState<D | null>(null), [stores, setStores] = useState<D[]>([])
 const load = () => Promise.all([api('bi-drops'), api('connections/pack-stores')]).then(([d, s]) => { setDrops(d); setStores(s) }, () => setDrops(null))
 useEffect(() => { void load() }, [id])
 const mine = drops?.drops.filter((d: D) => d.dashboard === id) ?? []
 return <div className="pack" aria-label="BI dataset">
  <h3>BI dataset</h3>
  <p className="muted">One row per report row, month and series, in integer minor units; unavailable values are empty, never zero. Power BI, Looker and Tableau read it with a read-scoped API token (Settings → API tokens) and see only what that person may see: no individual pay detail.</p>
  <p><a href={`/api/easel/dataset/${encodeURIComponent(id)}?format=csv`} download>Download dataset (CSV)</a> · <a href={`/api/easel/dataset/${encodeURIComponent(id)}?format=parquet`} download>Download dataset (Parquet)</a> · <code>GET /api/easel/dataset/{id}</code></p>
  {drops && <>
   <h4>Nightly drops</h4>
   {mine.map((d: D) => <p key={d.id}>{d.formats.join(' and ')} to {d.store} for {d.audience} at {String(d.hour).padStart(2, '0')}:00 company time{d.enabled ? '' : ' (paused)'}. <Action kind="danger" label="Remove drop" run={async () => { await command('bi-drop-delete', { id: d.id, revision: d.revision }); await load() }} /></p>)}
   {drops.runs.filter((r: D) => mine.some((d: D) => d.id === r.drop)).slice(0, 3).map((r: D) => <p key={`${r.drop}|${r.date}`} className="muted" role="status">{r.date}: {r.status}{r.reason ? ` · ${r.reason}` : ''}{r.receipts.length ? ` · ${r.receipts.map((x: D) => `${x.name} (${x.digest.slice(0, 10)}…)`).join(', ')}` : ''}</p>)}
   {stores.some(s => s.connected) && <Form submit="Schedule nightly drop" onSubmit={async (v, form) => { await command('bi-drop-save', { dashboard: id, store: v.store, audience: v.audience, formats: ['csv', 'parquet'].filter(f => v[f]), hour: Number(v.hour) }); form.reset(); await load() }}>
    <Field label="Drop to" name="store" options={stores.filter(s => s.connected).map(s => ({ value: s.store, label: s.label }))} />
    <Field label="Audience account" name="audience" type="email" hint="The files hold what this account may see, rechecked every night, never Pay detail." />
    <Field label="CSV" name="csv" type="checkbox" required={false} defaultValue={true} />
    <Field label="Parquet" name="parquet" type="checkbox" required={false} defaultValue={true} />
    <Field label="Local hour" name="hour" defaultValue="2" />
   </Form>}
   {!stores.some(s => s.connected) && <p className="muted">Connect Chest, Google Drive or SharePoint under Review packs → File stores to schedule drops.</p>}
  </>}
 </div>
}
