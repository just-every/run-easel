// Deliberately value-free events: fetch business records through their ordinary
// live-authority routes. No actor, provider error, salary or commentary is sent.
import type { Activity } from './store'
export const AUTOMATION_EVENTS = ['approval', 'close', 'publish', 'refresh-failure', 'alert', 'task'] as const
export type AutomationEvent = typeof AUTOMATION_EVENTS[number]
export function automationType(action: string, detail: Record<string, any> = {}): AutomationEvent | undefined {
 if (['approve-budget', 'approval-step'].includes(action)) return 'approval'
 if (action === 'close-month') return 'close'
 if (action === 'pack-publish') return 'publish'
 if (/(?:refresh|pull)-(?:failed|failure)$/.test(action) || (['gauge-connection-checked','qbo-checked','xero-checked','intacct-checked','netsuite-checked','stripe-checked'].includes(action) && detail.error) || ['sheet-link-failed','hris-source-incomplete'].includes(action)) return 'refresh-failure'
 if (['cash-alert-sent', 'decision-item-opened'].includes(action)) return 'alert'
 if (['calendar-task-save', 'calendar-task-complete', 'metric-task-created', 'metric-task-complete', 'action-status', 'request-submissions', 'submit', 'return-submission'].includes(action)) return 'task'
}
/** Statements join the source save's fenced batch, never its response path. */
export function automationStatements(db: D1Database, activity: Activity[], at: string) {
 const statements: D1PreparedStatement[] = []
 for (const item of activity) {
  const type = automationType(item.action, item.detail)
  if (!type) continue
  const id = crypto.randomUUID()
  const body = JSON.stringify({ id, type, version: 1, createdAt: at, data: { action: item.action, record: item.record, scenario: item.scenario ?? null, revision: item.after ?? null } })
  statements.push(db.prepare('INSERT INTO e_automation_events(id,type,body,at) VALUES(?,?,?,?)').bind(id, type, body, at))
  statements.push(db.prepare(`INSERT INTO e_webhook_deliveries(subscription,event,next_at)
   SELECT s.id,?,? FROM e_webhook_subscriptions s WHERE s.revoked_at IS NULL
   AND EXISTS(SELECT 1 FROM json_each(s.events) WHERE value=?)`).bind(id, at, type))
 }
 return statements
}
