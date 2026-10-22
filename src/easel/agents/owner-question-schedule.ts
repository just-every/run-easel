// Escalation may append a question event and notifications only. It never
// answers a question or edits the forecast on the owner's behalf.
import type { Bindings } from '../../auth.server'
import { access } from '../access'
import type { Context } from '../context'
import { deliverNotifications } from '../notify-dispatch'
import { load, save } from '../store'
import { currentTime } from '../time'
import { find, requireThat, type Actor, type State } from '../types'
import { escalateQuestions } from './owner-questions'

export async function runOwnerQuestionSchedule(env: Bindings) {
 const db = env.DB, { state } = await load(db), settings = find(state, 'owner-question-settings', 'main')
 if (!settings?.enabled) return { queued: 0 }
 const operator = await db.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE email=? AND status='active' AND role IN ('owner','admin')").bind(settings.configuredBy).first<any>()
 if (!operator) return { queued: 0 }
 const actor: Actor = { id: operator.id, email: 'scheduler:owner-questions', name: operator.display_name, session: '', version: operator.version, baseRole: operator.role, scheduler: { operator: operator.id, email: operator.email } }
 const open = async () => { const { state, revision } = await load(db); return { s: state, before: new Map(state), revision, x: access(state, actor), db, activity: [], snapshots: [], now: await currentTime(env) } as Context & { revision: number; before: State } }
 const commit = async (c: Awaited<ReturnType<typeof open>>) => {
  const changed = [...c.s].filter(([key, row]) => c.before.get(key)?.revision !== row.revision).map(([, row]) => row.kind)
  requireThat(changed.every(k => ['owner-question', 'notification'].includes(k)) && [...c.before.keys()].every(k => c.s.has(k)), 'The owner-question scheduler only records escalations and delivery outcomes', 500)
  if (changed.length || c.activity.length) await save(db, actor, c.before, c.s, c.revision, c.activity)
 }
 const c = await open(), ids = await escalateQuestions(c)
 await commit(c)
 await deliverNotifications(ids, env, open, commit)
 return { queued: ids.length }
}
