// Persist a delivery claim before contacting mail. Unknown outcomes stay sealed.
import { runtimeBindings, type Bindings } from '../auth.server'
import { operatorMail } from '../mail.server.mjs'
import { access } from './access'
import type { Context } from './context'
import { savedReport } from './saved-reports'
import { planSavedReportSchedules, reportRecipientContext } from './saved-report-schedules'
import { load, save } from './store'
import { currentTime } from './time'
import { all, find, get, put, requireThat, type Actor, type Data } from './types'

type Saved = Context & { revision: number; before: Context['s'] }
type Open = () => Promise<Saved>
type Commit = (c: Saved) => Promise<void>
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const amount = (n: number | null) => n === null ? 'Unavailable' : `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`
const percentage = (n: number | null) => n === null ? 'Unavailable' : `${amount(n)}%`

function reportEmail(v: Data, url: string) {
 return { subject: `Easel report: ${v.name}`, text: [v.name, `Currency: ${v.currency}. Source: ${v.sourceName}.`,
  'Unavailable values are not zero. Provider acceptance does not confirm delivery.', '',
  ['Row', 'Period', 'Actual', v.sourceName, v.comparisonName ?? 'Comparison', 'Variance', 'Variance %', 'Prior-year actual', 'YoY', 'YoY %', ...(v.versions ?? []).map((version: Data) => version.name)].join('\t'),
  ...v.rows.map((r: Data) => [r.name, r.period, amount(r.actual), amount(r.budget), amount(r.comparison), amount(r.variance), percentage(r.varianceBps), amount(r.priorYearActual), amount(r.yoy), percentage(r.yoyBps), ...(v.versions ?? []).map((version: Data) => amount(r.versions[version.id]))].join('\t')),
  '', `Open in Easel: ${url}`].join('\n') }
}

export async function dispatchSavedReports(ids: string[], original: Bindings, open: Open, commit: Commit) {
 const env = runtimeBindings(original)
 for (const id of ids) {
  let c = await open(), d = get(c.s, 'report-delivery', id)
  if (!['pending', 'blocked', 'suppressed'].includes(d.status)) continue
  const record = async (status: string, extra: Data) => {
   put(c.s, 'report-delivery', id, { ...d, status, ...extra })
   c.activity.push({ action: 'report-delivery-result', record: id, detail: { status, scheduledAt: d.scheduledAt, dispatchedAt: extra.dispatchedAt ?? d.dispatchedAt, zone: d.zone } })
   await commit(c)
  }
  const schedule = find(c.s, 'report-schedule', d.schedule)
  const author = schedule && await c.db.prepare("SELECT id FROM oa_operators WHERE email=? AND status='active' AND role IN ('owner','admin')").bind(schedule.updatedBy).first()
  const recipient = await reportRecipientContext(c, d.recipient)
  if (!schedule?.enabled || !schedule.recipients.includes(d.recipient) || !author || !recipient) {
   await record('blocked', { reason: 'The schedule, finance author or recipient no longer has current access.', completedAt: c.now }); continue
  }
  let message: Data
  try {
   const view = await savedReport(recipient, d.dashboard)
   message = reportEmail(view, `${env.AUTH_ORIGIN}/app?tab=reports&report=${encodeURIComponent(d.dashboard)}`)
  } catch {
   await record('blocked', { reason: 'The recipient cannot currently open this saved report.', completedAt: c.now }); continue
  }
  if (d.message && JSON.stringify(d.message) !== JSON.stringify(message)) {
   await record('blocked', { reason: 'The report or its audience changed after a refused send. The stored body and delivery key cannot be reused.', completedAt: c.now }); continue
  }
  await record('sending', { message, attempts: d.attempts + 1, dispatchedAt: c.now, reason: '' })
  let outcome: Data
  try {
   const sender = operatorMail(env)
   outcome = sender ? await sender.send({ deliveryId: d.deliveryId, from: env.MAIL_FROM ?? '', to: [d.recipient], subject: message.subject, text: message.text, html: `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(message.text)}</div>`, headers: {} }) : { status: 'rejected', code: 'mail_not_configured' }
  } catch (error) { outcome = error instanceof Error && error.name === 'MailValidationError' ? { status: 'rejected', code: 'mail_configuration_or_message_invalid' } : { status: 'uncertain', code: 'mail_outcome_unknown' } }
  c = await open(); d = get(c.s, 'report-delivery', id)
  const status = outcome.status === 'accepted' ? 'accepted' : outcome.status === 'development' ? 'suppressed' : outcome.status === 'uncertain' ? 'uncertain' : 'pending'
  await record(status, { providerStatus: outcome.status, providerMessageId: outcome.providerMessageId ?? null, completedAt: c.now, reason: outcome.code ?? '',
   label: status === 'accepted' ? 'Accepted by mail provider; delivery is not confirmed' : status === 'uncertain' ? 'Outcome unknown; never retried automatically' : status === 'suppressed' ? 'Development email suppressed; not sent' : 'Refused; finance can retry',
   ...(status === 'suppressed' ? { message: null } : {}) })
 }
}

export async function runSavedReportSchedules(env: Bindings) {
 const db = env.DB, { state } = await load(db)
 const schedules = all(state, 'report-schedule').filter(s => s.enabled)
 let native: any = null
 for (const schedule of schedules) {
  native = await db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE email=? AND status='active' AND role IN ('owner','admin')").bind(schedule.updatedBy).first<any>()
  if (native) break
 }
 if (!native) return { queued: 0 }
 const actor: Actor = { id: native.id, email: 'scheduler:reports', name: native.display_name, session: '', version: native.version, baseRole: native.role, scheduler: { operator: native.id, email: native.email } }
 const open = async (): Promise<Saved> => { const { state, revision } = await load(db); return { db, s: state, before: new Map(state), revision, x: access(state, actor), activity: [], snapshots: [], now: await currentTime(env) } }
 const commit = async (c: Saved) => {
  const changed = [...c.s].filter(([key, r]) => c.before.get(key)?.revision !== r.revision)
  requireThat(changed.every(([, r]) => r.kind === 'report-delivery') && [...c.before.keys()].every(key => c.s.has(key)), 'The report scheduler only records report deliveries', 500)
  if (changed.length || c.activity.length) await save(db, actor, c.before, c.s, c.revision, c.activity)
 }
 const c = await open(), ids = planSavedReportSchedules(c)
 await commit(c)
 const waiting = [...new Set([...ids, ...all(c.s, 'report-delivery').filter(d => d.status === 'pending' && d.attempts === 0).map(d => d.id)])]
 await dispatchSavedReports(waiting, env, open, commit)
 return { queued: ids.length }
}
