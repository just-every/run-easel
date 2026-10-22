import { useEffect, useState } from 'react'
import { Action, api, command, Field, Form, monthLabel, type D } from './shared'

/** Finance chooses a template and starts a month or whole-quarter pack. */
export function PackStart({ closedMonths, month, refresh }: { closedMonths: string[]; month: string; refresh: () => Promise<unknown> }) {
 const [templates, setTemplates] = useState<D[]>([]), [sections, setSections] = useState<D>({})
 const load = () => api('pack-templates').then(r => { setTemplates(r.templates); setSections(r.sections) })
 useEffect(() => { load() }, [])
 return <details className="pack-tools">
  <summary>Quarter packs and templates</summary>
  <Form key={`start-${templates.length}`} submit="Start the quarter pack" onSubmit={async v => { await command('pack-create', { period: 'quarter', month: v.month, template: v.template }); await refresh() }}>
   <Field label="Month in the quarter" name="month" defaultValue={month} options={closedMonths.map(m => ({ value: m, label: monthLabel(m) }))} />
   <Field label="Template" name="template" defaultValue="default" options={templates.map(t => ({ value: t.id, label: t.name }))} />
  </Form>
  <Form submit="Save template" onSubmit={async (v, form) => { await command('pack-template-save', { name: v.name, sections: Object.keys(sections).filter(k => v[k]) }); form.reset(); await load() }}>
   <Field label="Template name" name="name" />
   {Object.entries(sections).map(([key, label]) => <Field key={key} label={String(label)} name={key} type="checkbox" required={false} defaultValue={true} />)}
  </Form>
 </details>
}

/** A draft pack's live numbers: whether a late adjustment moved them, and the refresh that keeps commentary. */
export function PackDraftStatus({ pack, refresh, onFingerprint }: { pack: D; refresh: () => Promise<unknown>; onFingerprint: (fingerprint: string) => void }) {
 const [preview, setPreview] = useState<D | null>(null), [kept, setKept] = useState<number | null>(null)
 const load = () => api(`pack/${pack.id}/preview`).then(r => { setPreview(r); onFingerprint(r.fingerprint) }, () => setPreview(null))
 useEffect(() => { load() }, [pack.id, pack.generated?.fingerprint])
 if (!preview) return null
 return <div role="status">
  <p className="muted">{pack.period === 'quarter' ? `Quarter pack · ${pack.label}` : 'Monthly pack'} · template sections: {pack.sections?.join(', ')} · generated {pack.generated?.at ?? '—'}</p>
  {preview.stale
   ? <p className="error" role="alert">The numbers moved since this pack was generated, for example after a late adjustment to a closed month. <Action label="Refresh pack" run={async () => { const r = await command('pack-refresh', { pack: pack.id }); setKept(r.commentaryKept); await load(); await refresh() }} /></p>
   : <p className="muted">The numbers are current.{kept !== null && ` Refreshed; ${kept} explanation${kept === 1 ? '' : 's'} kept.`}</p>}
 </div>
}

const STORES = [
 { store: 'drive', label: 'Google Drive', fields: [['clientId', 'Google OAuth client ID'], ['clientSecret', 'Google OAuth client secret'], ['refreshToken', 'Google refresh token'], ['folderId', 'Drive folder ID']] },
 { store: 'sharepoint', label: 'SharePoint', fields: [['tenant', 'Microsoft tenant ID'], ['clientId', 'Microsoft application ID'], ['clientSecret', 'Microsoft client secret'], ['driveId', 'SharePoint library (drive) ID'], ['folderPath', 'Library folder']] },
 { store: 'chest', label: 'Chest', fields: [['origin', 'Chest address'], ['accessToken', 'Chest integration token'], ['folderId', 'Chest folder ID']] },
]

/** Finance connects Chest, Google Drive and SharePoint; credentials are write-only. */
export function PackStores({ onChange }: { onChange?: () => void }) {
 const [stores, setStores] = useState<D[]>([]), [error, setError] = useState('')
 const load = () => api('connections/pack-stores').then(r => { setStores(r); onChange?.() }, e => setError(e.message))
 useEffect(() => { load() }, [])
 return <details className="pack-tools">
  <summary>File stores for published packs</summary>
  {error && <p role="alert" className="error">{error}</p>}
  {STORES.map(def => { const row = stores.find(s => s.store === def.store)
   return <div key={def.store} className="pack">
    <h3>{def.label}{row?.connected ? ' · connected' : ''}</h3>
    {row?.connected
     ? <><p className="muted">{row.destination}</p><Action kind="danger" label={`Disconnect ${def.label}`} confirm={`Disconnect ${def.label}? Saved copies stay where they are.`} run={async () => { await api(`connections/pack-stores/${def.store}/disconnect`, {}); await load() }} /></>
     : <Form submit={`Connect ${def.label}`} onSubmit={async (v, form) => { await api(`connections/pack-stores/${def.store}/connect`, v); form.reset(); await load() }}>
       {def.fields.map(([name, label]) => <Field key={name} label={label} name={name} type={/Secret|Token|token/.test(label) ? 'password' : 'text'} />)}
      </Form>}
   </div>
  })}
 </details>
}

/** Save one published pack's PDF to each connected store. */
export function PackSave({ pack, stores, refresh }: { pack: D; stores: D[]; refresh: () => Promise<unknown> }) {
 const [receipts, setReceipts] = useState<D[]>([])
 return <>
  {stores.filter(s => s.connected).map(s => <Action key={s.store} kind="quiet" label={`Save PDF to ${s.label}`} run={async () => { const r = await api(`pack/${pack.id}/save`, { store: s.store }); setReceipts(x => [...x.filter(y => y.store !== r.store), r]); await refresh() }} />)}
  {receipts.map(r => <span key={r.store} className="muted" role="status">Saved to {r.destination} · SHA-256 {r.digest.slice(0, 12)}…</span>)}
 </>
}
