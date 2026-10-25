import type { Bindings } from '../auth.server'
import { calendarTasks, eligibleOwner, financeEmails } from './calendar'
import type { Context } from './context'
import { openPushDevice, revokeDevice } from './mobile-push-devices'
import { sendMobilePush } from './mobile-push-provider'
import { canReadNotification } from './notify'
import { readFence } from './store'
import { all, find, put, type Data } from './types'

type Saved = Context & { revision: number; before: Context['s'] }
type Open = () => Promise<Saved>
type Commit = (c: Saved) => Promise<void>
type Source = 'notification' | 'calendar-delivery'

async function readable(c: Context, source: Source, n: Data) {
 if (source === 'notification') return canReadNotification(c, n)
 const task = calendarTasks(c).find(t => t.id === n.task)
 if (!task?.open || !find(c.s, 'calendar-schedule', 'main')?.enabled) return false
 return n.kind === 'reminder' ? task.owners.includes(n.recipient) && await eligibleOwner(c, task, n.recipient) : (await financeEmails(c.db)).includes(n.recipient)
}

/** Additional opted-in delivery; each event and device has one durable intent. */
export async function deliverMobilePush(ids: string[], source: Source, env: Bindings, open: Open, commit: Commit) {
 for (const sourceId of ids) {
  let c = await open()
  const n = find(c.s, source, sourceId)
  if (!n || source === 'calendar-delivery' && n.channel !== 'email') continue
  const devices = all(c.s, 'mobile-device').filter(d => d.status === 'active' && d.email === n.recipient)
  const planned: string[] = []
  for (const d of devices) {
   const id = `${source}|${sourceId}|${d.id}`
   if (find(c.s, 'mobile-push-delivery', id)) continue
   put(c.s, 'mobile-push-delivery', id, { source, sourceId, device: d.id, recipient: n.recipient, status: 'pending', key: crypto.randomUUID(), createdAt: c.now, reason: '' })
   c.activity.push({ action: 'mobile-push-queued', record: id, detail: { device: d.id, source, sourceId } })
   planned.push(id)
  }
  if (!planned.length) continue
  await commit(c)
  for (const id of planned) {
   c = await open()
   let intent = find(c.s, 'mobile-push-delivery', id)!
   if (intent.status !== 'pending') continue
   const record = (status: string, reason: string) => {
    intent = { ...intent, status, reason, ...(status === 'sending' ? { dispatchedAt: c.now } : { completedAt: c.now }) }
    put(c.s, 'mobile-push-delivery', id, intent)
    c.activity.push({ action: 'mobile-push-result', record: id, detail: { status, reason, device: intent.device } })
   }
   record('sending', 'Durable intent; interrupted sends are never retried')
   await commit(c)
   c = await open()
   const current = find(c.s, source, sourceId), device = find(c.s, 'mobile-device', intent.device)
   if (!device || !current || !await readable(c, source, current)) {
    record('blocked', 'The exact native session, consent or current record authority is no longer valid')
    await commit(c); continue
   }
   // The revision fence follows all recipient reads, immediately before egress.
   await readFence(c.db, c.x.actor, c.revision)
   const payload = await openPushDevice(c, env, device, c.revision)
   if (!payload) {
    record('blocked', 'The exact native session, consent or current record authority is no longer valid')
    await commit(c); continue
   }
   const outcome = await sendMobilePush(env, device.platform, payload.token, intent.key, async () => {
    const latest = await open(), sourceRow = find(latest.s, source, sourceId), currentDevice = find(latest.s, 'mobile-device', intent.device)
    if (!sourceRow || !currentDevice || !await readable(latest, source, sourceRow)) return false
    return !!await openPushDevice(latest, env, currentDevice, latest.revision)
   })
   c = await open()
   record(outcome.reason === 'native-authority-changed' ? 'blocked' : outcome.status, outcome.reason)
   const latestDevice = find(c.s, 'mobile-device', intent.device)
   if (outcome.invalidDevice && latestDevice?.status === 'active') revokeDevice(c, latestDevice, 'provider-invalid-device')
   await commit(c)
  }
 }
}
