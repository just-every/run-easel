// Cash alert rules, alerts and acknowledgment are finance-only (REPORT-006).
import { requireFinance } from './access'
import { endAlert } from './cash-alert-check'
import { CHECK_HOUR } from './cash-alert-schedule'
import type { Context } from './context'
import { workspace } from './model'
import { cents, hundredths, percentBps } from './units'
import { all, choice, find, get, integer, put, requireThat, text, uid, type Data } from './types'

export async function cashAlertList(c: Context) {
 requireFinance(c.x)
 const zone = workspace(c.s).timeZone ?? 'America/New_York'
 const alerts = all(c.s, 'cash-alert').sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || b.openedAt.localeCompare(a.openedAt))
 const checks = all(c.s, 'cash-alert-check').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14)
 return { zone, checkHour: CHECK_HOUR, rules: all(c.s, 'cash-alert-rule').sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), alerts, checks }
}

export async function cashAlerts(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (op === 'cash-alert-check') {
  requireFinance(c.x)
  // api.commit evaluates after this command, in the same fenced save.
  c.activity.push({ action: op, record: 'cash-alerts' })
  return { sent: [], blocked: [] }
 }
 if (op === 'cash-alert-rule-save') {
  requireFinance(c.x)
  const prior = b.id ? get(c.s, 'cash-alert-rule', b.id, 'cash alert rule') : null
  requireThat(!prior || prior.revision === Number(b.revision), 'The rule changed; reload before saving', 409)
  const kind = choice(b.kind, ['floor', 'below-plan', 'bank-below-plan', 'runway'] as const, 'cash alert')
  const basis = ['below-plan', 'bank-below-plan'].includes(kind) ? choice(b.basis, ['amount', 'percent'] as const, 'shortfall basis') : null
  const rule: Data = { name: text(b.name, 'Rule name'), kind, intervalDays: integer(b.intervalDays ?? 7, 'Re-alert interval (days)', 1, 365), enabled: b.enabled !== false, currency: workspace(c.s).currency,
   ...(basis === 'amount' ? { basis, amountCents: cents(b.amount, 'Shortfall amount') } : basis === 'percent' ? { basis, percentBps: percentBps(b.percent, 'Shortfall percent') } : {}),
   ...(kind === 'runway' ? { runwayHundredths: hundredths(b.runway, 'Runway threshold') } : {}),
   revision: (prior?.revision ?? 0) + 1, updatedBy: c.x.actor.email, updatedAt: c.now,
  }
  const id = prior?.id ?? uid()
  // A revised or disabled rule ends its open alert; the next check starts afresh.
  const open = all(c.s, 'cash-alert').find(a => a.rule === id && a.status === 'open')
  if (open) endAlert(c, open, rule.enabled ? `Rule revised to revision ${rule.revision}` : 'Rule disabled')
  put(c.s, 'cash-alert-rule', id, rule)
  c.activity.push({ action: op, record: id, detail: { revision: rule.revision, kind, enabled: rule.enabled } })
  return get(c.s, 'cash-alert-rule', id)
 }
 if (op === 'cash-alert-acknowledge') {
  requireFinance(c.x)
  const alert = get(c.s, 'cash-alert', b.id, 'cash alert')
  requireThat(alert.revision === Number(b.revision), 'The alert changed; reload before acknowledging', 409)
  const latest = alert.sends.at(-1).n
  requireThat(!alert.acknowledgments.some((a: Data) => a.send === latest), 'The latest alert is already acknowledged', 409)
  put(c.s, 'cash-alert', alert.id, { ...alert, acknowledgments: [...alert.acknowledgments, { by: c.x.actor.email, at: c.now, send: latest }], revision: alert.revision + 1 })
  c.activity.push({ action: op, record: alert.id, detail: { rule: alert.rule, send: latest } })
  return find(c.s, 'cash-alert', alert.id)
 }
 return undefined
}
