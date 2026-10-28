// REPORT-007, REPORT-009: scheduled CSV and Parquet drops of a saved report's dataset to a
// connected file store. Finance names the audience account whose current
// access builds the files; the run rechecks it, and a drop never carries Pay
// detail whatever that account's grant (conservative default, ct to approve).
// A nightly run records per-file receipts, retries only unfinished files, and
// stops after three attempts for the day.
import type { Bindings } from '../auth.server'
import { access, requireCapability, requireFinance } from './access'
import { zonedInstant, zonedLabel } from './calendar-time'
import type { Context } from './context'
import { dataset, datasetCsv, datasetParquet } from './dataset'
import { workspace } from './model'
import { storeCustody } from './pack-store'
import { STORES, uploadFile, type Store } from './pack-store-provider'
import { reportRecipientContext } from './saved-report-schedules'
import { savedReport } from './saved-reports'
import { load, save, sha256Bytes } from './store'
import { currentTime } from './time'
import { all, choice, find, get, integer, put, remove, requireThat, uid, type Actor, type Data } from './types'

const FORMATS = ['csv', 'parquet'] as const
const MIME = { csv: 'text/csv; charset=utf-8', parquet: 'application/vnd.apache.parquet' }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'dataset'
type Saved = Context & { revision: number; before: Context['s'] }

export async function biDropCommands(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!['bi-drop-save', 'bi-drop-delete'].includes(op)) return undefined
 requireCapability(c.x, 'connections'); requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler, 'Use a signed-in finance session to configure BI drops', 403)
 const prior = b.id ? get(c.s, 'bi-drop', b.id, 'drop') : null
 requireThat(!prior || Number(b.revision) === prior.revision, 'The drop changed; reload', 409)
 if (op === 'bi-drop-delete') { requireThat(prior, 'Choose a drop'); remove(c.s, 'bi-drop', prior.id); c.activity.push({ action: op, record: prior.id, detail: {} }); return { deleted: prior.id } }
 const dashboard = get(c.s, 'dashboard', b.dashboard)
 await savedReport(c, dashboard.id)
 const store = choice(b.store, STORES, 'a file store') as Store
 requireThat(find(c.s, 'connection', `pack-store:${store}`)?.connected, 'Connect that file store before scheduling a drop to it', 409)
 const audience = typeof b.audience === 'string' ? b.audience.trim().toLowerCase() : ''
 const recipient = await reportRecipientContext(c, audience)
 requireThat(recipient, 'The audience must be an active account with current workspace membership')
 await savedReport(recipient, dashboard.id)
 const formats = FORMATS.filter(f => Array.isArray(b.formats) && b.formats.includes(f))
 requireThat(formats.length > 0, 'Choose CSV, Parquet or both')
 const id = prior?.id ?? uid()
 put(c.s, 'bi-drop', id, { dashboard: dashboard.id, store, audience, formats, hour: integer(b.hour ?? 2, 'Local drop hour', 0, 23), enabled: b.enabled !== false, revision: (prior?.revision ?? 0) + 1, updatedBy: c.x.actor.email, updatedAt: c.now, createdAt: prior?.createdAt ?? c.now })
 c.activity.push({ action: op, record: id, detail: { dashboard: dashboard.id, store, audience, formats } })
 return get(c.s, 'bi-drop', id)
}

export const biDropList = (c: Context) => { requireFinance(c.x); return { drops: all(c.s, 'bi-drop'), runs: all(c.s, 'bi-drop-run').sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)).slice(0, 60) } }

/** The files of one drop for one audience: rows equal what that audience's dataset endpoint returns, minus Pay detail. */
async function files(c: Context, drop: Data) {
 const audience = await reportRecipientContext(c, drop.audience)
 requireThat(audience, 'The audience no longer has an active account and workspace membership', 409)
 const safe: Context = { ...audience, x: { ...audience.x, payDetail: false } }
 const d = await dataset(safe, drop.dashboard), date = c.now.slice(0, 10)
 return { rows: d.rows.length, files: { csv: { name: `easel-dataset-${slug(d.name)}-${date}.csv`, bytes: new TextEncoder().encode(datasetCsv(d)) }, parquet: { name: `easel-dataset-${slug(d.name)}-${date}.parquet`, bytes: datasetParquet(d) } } as Record<string, { name: string; bytes: Uint8Array }> }
}

export async function runBiDrops(env: Bindings) {
 const db = env.DB, { state } = await load(db)
 const drops = all(state, 'bi-drop').filter(d => d.enabled)
 let ran = 0
 for (const drop of drops) {
  const native = await db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE email=? AND status='active' AND role IN ('owner','admin')").bind(drop.updatedBy).first<any>()
  const { state: s, revision } = await load(db)
  const now = await currentTime(env)
  const zone = workspace(s).timeZone ?? 'America/New_York'
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
  const scheduledAt = zonedInstant(date, drop.hour, zone), id = `${drop.id}|${date}`, prior = find(s, 'bi-drop-run', id)
  if (now < scheduledAt || drop.createdAt > scheduledAt || prior?.status === 'saved' || (prior?.attempts ?? 0) >= 3 || !native) continue
  const actor: Actor = { id: native.id, email: 'scheduler:bi-drops', name: native.display_name, session: '', version: native.version, baseRole: native.role, scheduler: { operator: native.id, email: native.email } }
  const c: Saved = { s, before: new Map(s), revision, x: access(s, actor), db, activity: [], snapshots: [], now }
  const receipts: Data[] = [...(prior?.receipts ?? [])]
  let status = 'saved', reason = '', rows = prior?.rows ?? 0
  try {
   const built = await files(c, drop)
   rows = built.rows
   const { custody } = await storeCustody(c, env, drop.store)
   for (const format of drop.formats as (keyof typeof MIME)[]) {
    if (receipts.some(r => r.format === format)) continue
    const f = built.files[format], digest = await sha256Bytes(f.bytes)
    const result = await uploadFile(drop.store, custody.secret, custody.destination, f.name, MIME[format], f.bytes, digest, `easel-drop-${id}-${format}`)
    receipts.push({ format, name: f.name, digest, bytes: result.bytes, remoteId: result.remoteId })
   }
  } catch (error) { status = 'failed'; reason = error instanceof Error ? error.message : 'The drop failed' }
  put(c.s, 'bi-drop-run', id, { drop: drop.id, dashboard: drop.dashboard, store: drop.store, audience: drop.audience, date, zone, scheduledAt, ranAt: now, status, reason, rows, receipts, attempts: (prior?.attempts ?? 0) + 1 })
  c.activity.push({ action: 'bi-drop-run', record: id, detail: { status, scheduledAt: zonedLabel(scheduledAt, zone), rows, files: receipts.length } })
  const changed = [...c.s].filter(([k, r]) => c.before.get(k)?.revision !== r.revision)
  requireThat(changed.every(([, r]) => r.kind === 'bi-drop-run'), 'The BI drop scheduler only records drop runs', 500)
  await save(db, actor, c.before, c.s, revision, c.activity)
  ran++
 }
 return { ran }
}
