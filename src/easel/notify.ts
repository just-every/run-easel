import { canReadQuestion } from './agents/owner-questions'
import { canReceiveChainNotice } from './approval-chains'
// Notifications from discussions and events (CYCLE-003). Commands record one
// notification per event and recipient inside their own fenced save; delivery
// follows each person's single preference: immediate email (default), the
// 08:00 company-zone daily digest, or chat only, where a shared channel gets
// only a generic notice and a sign-in link.
import type { Bindings } from '../auth.server'
import { requireMember } from './access'
import { CHAT_CHANNELS, chatReady } from './calendar-channels'
import { financeEmails } from './calendar'
import type { Context } from './context'
import { all, choice, find, put, requireThat, uid, type Data } from './types'

export const MODES = ['email', 'digest', 'chat'] as const
export const EVENT_LABEL: Record<string, string> = { 'approval-step-pending': 'Department review pending', mention: 'You were mentioned', returned: 'Submission returned', 'approval-pending': 'Budget ready for approval', 'metric-task': 'New task assigned to you', 'action-chase': 'Update due on your action', 'cash-alert': 'Cash alert', 'decision-item': 'Decision needed', 'owner-question': 'Owner assumption question', 'owner-question-escalation': 'Unanswered owner assumption' }
export const preference = (c: Context, email: string): Data => find(c.s, 'notification-preference', email) ?? { mode: 'email', channel: null }

/** Whether `email` may currently read a department's detail (finance always). */
export async function canRead(c: Context, email: string, department: string) {
 const native = await c.db.prepare("SELECT role FROM oa_operators WHERE email=? AND status='active'").bind(email).first<{ role: string }>()
 if (!native) return false
 if (['owner', 'admin'].includes(native.role)) return true
 const m = find(c.s, 'member', email)
 return !!m?.active && (!department ? m.role !== null : m.role === 'contributor' && m.departments?.includes(department))
}

export function notify(c: Context, event: keyof typeof EVENT_LABEL, recipients: string[], detail: { title: string; tab: string; record: string; department: string; body?: string }, options: { includeActor?: boolean } = {}) {
 const ids: string[] = []
 // A person is not told about their own action, except for alerts about the plan itself.
 for (const recipient of [...new Set(recipients)].filter(r => options.includeActor || r !== c.x.actor.email)) {
  const id = uid()
  ids.push(id)
  put(c.s, 'notification', id, { event, recipient, ...detail, createdAt: c.now, status: 'new', attempts: 0, key: crypto.randomUUID(), history: [] })
  c.activity.push({ action: 'notification-recorded', record: id, detail: { event, recipient, tab: detail.tab, target: detail.record } })
 }
 return ids
}

/** Mentions are `@email`; only people who can read the department may be mentioned. */
export async function mentions(c: Context, body: string, department: string, title: string, tab: string, record: string) {
 const emails = [...new Set([...body.matchAll(/@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map(m => m[1].toLowerCase()))]
 for (const email of emails) requireThat(await canRead(c, email, department), `${email} cannot read this department; mention someone who can`)
 notify(c, 'mention', emails, { title, tab, record, department })
}

export async function financeRecipients(c: Context) { return financeEmails(c.db) }

export async function notificationView(c: Context, env: Bindings) {
 requireMember(c.x)
 const channels = []
 for (const ch of CHAT_CHANNELS) if (await chatReady(c, env, ch)) channels.push(ch)
 const permitted: Data[] = []
 for (const n of all(c.s, 'notification').filter(n => n.recipient === c.x.actor.email)) if (!['owner-question', 'owner-question-escalation', 'cash-alert'].includes(n.event) || await canReadNotification(c, n)) permitted.push(n)
 return { preference: preference(c, c.x.actor.email), channels, notifications: permitted.map((n): Data => ({ ...n, message: undefined })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50) }
}

export async function savePreference(c: Context, env: Bindings, b: Data) {
 requireMember(c.x)
 const mode = choice(b.mode, MODES, 'notification preference')
 const channel = mode === 'chat' ? choice(b.channel, CHAT_CHANNELS, 'chat channel') : null
 if (channel) requireThat(await chatReady(c, env, channel), 'That chat channel is not connected by the owner')
 const prior = find(c.s, 'notification-preference', c.x.actor.email)
 put(c.s, 'notification-preference', c.x.actor.email, { mode, channel, updatedAt: c.now, revision: (prior?.revision ?? 0) + 1 })
 c.activity.push({ action: 'notification-preference', record: c.x.actor.email, detail: { mode, channel } })
 return get(c)
}
const get = (c: Context) => preference(c, c.x.actor.email)

export async function canReadNotification(c: Context, n: Data) {
 if (n.event === 'cash-alert') {
  const current = await c.db.prepare("SELECT role FROM oa_operators WHERE email=? AND status='active'").bind(n.recipient).first<{role:string}>()
  return !!current && ['owner', 'admin'].includes(current.role)
 }
 if (['owner-question', 'owner-question-escalation'].includes(n.event)) { const q = find(c.s, 'owner-question', n.record); return !!q && q.status !== 'canceled' && (n.event !== 'owner-question' || q.status === 'open') && await canReadQuestion(c, q, n.recipient) }
 return n.event === 'approval-step-pending' ? canReceiveChainNotice(c, n) : canRead(c, n.recipient, n.department) }
