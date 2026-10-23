import type { Bindings } from '../../auth.server'
import { operatorMail } from '../../mail.server.mjs'
import { access, requireCapability, requireCapabilityGrant, requireFinance } from '../access'
import type { Context } from '../context'
import { scenarioAccess } from '../scenario-access'
import { workspace } from '../model'
import { readFence, load, save } from '../store'
import { currentTime } from '../time'
import { all, find, get, put, requireThat, text, uid, type Actor, type Data, type State } from '../types'
import { authorizeAnalyst, beginAnalyst, analystPreview, finishAnalyst } from './analyst'
import { agentEnabled, governance, requireAgent } from './governance'
import { performCommentary } from './commentary-provider'
import { zonedInstant } from '../calendar-time'

function finance(c: Context) {
 requireFinance(c.x); requireCapability(c.x, 'approvals', c.s)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler, 'Use native finance to approve missions', 403)
}
export async function missionList(c: Context) { finance(c); return { missions: all(c.s, 'agent-mission'), runs: all(c.s, 'mission-run') } }
export async function missionCommand(c: Context, op: string, b: Data) {
 finance(c)
 if (op === 'stop') {
  const mission = get(c.s, 'agent-mission', b.id)
  put(c.s, 'agent-mission', mission.id, { ...mission, enabled: false })
  c.activity.push({ action: 'mission-stopped', record: mission.id, detail: { agent: 'Recurring missions' } })
  return { stopped: true }
 }
 requireThat(op === 'approve', 'Unknown mission action', 404); requireAgent(c, 'missions')
 requireThat(b.consent === true, 'Approve scheduled aggregate model requests and delivery to this exact audience')
 const run = get(c.s, 'analyst-run', b.run)
 requireThat(run.status === 'answered' && run.person === c.x.actor.email, 'Choose your own validated analyst answer', 409)
 requireThat(Array.isArray(b.recipients) && b.recipients.length > 0 && b.recipients.length <= 20, 'Choose one to twenty named finance recipients')
 const recipients = [...new Set<string>(b.recipients.map((email: unknown) => text(email, 'Recipient', 254).toLowerCase()))]
 for (const email of recipients) requireThat(await c.db.prepare("SELECT id FROM oa_operators WHERE email=? AND status='active' AND role IN ('owner','admin')").bind(email).first(), 'Mission delivery currently requires active native finance recipients', 403)
 requireThat(!scenarioAccess(c.s, c.x, run.scenario).sandbox && (!run.compare || !scenarioAccess(c.s, c.x, run.compare).sandbox), 'Private sandbox analysis cannot be delivered as a mission', 403)
 const zone = workspace(c.s).timeZone ?? ['America', 'New_York'].join('/')
 const mission = { id: uid(), name: text(b.name, 'Mission name', 120), owner: c.x.actor.email, ownerId: c.x.actor.id, scenario: run.scenario, month: run.month, question: run.question, compare: run.compare ?? '', validatedRun: run.id, recipients, zone, schedule: 'Monday at 08:00', enabled: true, approvedAt: c.now, approvedBy: c.x.actor.email }
 put(c.s, 'agent-mission', mission.id, mission)
 c.activity.push({ action: 'mission-approved', record: mission.id, detail: { agent: 'Recurring missions', owner: mission.owner, recipients, schedule: mission.schedule, zone, validatedRun: run.id } })
 return mission
}
/** Existing connector observations are authoritative; no connector refresh is invented here. */
async function staleSources(c: Context) {
 const stale: string[] = []
 for (const id of ['gauge', 'gusto', 'plaid']) {
  const source = find(c.s, 'connection', id)
  if (!source) continue
  const refreshed = Date.parse(source.lastRefresh ?? '')
  const key = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind(id).first()
  if (!source.connected || !key || source.error || !Number.isFinite(refreshed) || Date.parse(c.now) < refreshed || Date.parse(c.now) - refreshed > 86_400_000) stale.push(id)
 }
 return stale
}

export async function runMissions(env: Bindings) {
 const initial = await load(env.DB)
 if (!agentEnabled(initial.state, 'missions')) return { completed: 0 }
 let completed = 0
 for (const m of all(initial.state, 'agent-mission').filter(m => m.enabled)) {
  const person = await env.DB.prepare("SELECT id,email,display_name,role,version FROM oa_operators WHERE id=? AND email=? AND status='active' AND role IN ('owner','admin')").bind(m.ownerId, m.owner).first<any>()
  if (!person) continue
  const actor: Actor = { id: person.id, email: person.email, name: person.display_name, session: '', version: person.version, baseRole: person.role, scheduler: { operator: person.id, email: person.email }, agent: { name: 'Recurring missions', via: 'mission' } }
  const open = async () => { const { state, revision } = await load(env.DB); return { s: state, before: new Map(state), revision, x: access(state, actor), db: env.DB, activity: [], snapshots: [], now: await currentTime(env) } as Context & { before: State; revision: number } }
  const commit = async (c: Awaited<ReturnType<typeof open>>) => save(env.DB, actor, c.before, c.s, c.revision, c.activity)
  let c = await open()
  try { requireFinance(c.x); requireCapabilityGrant(c.x, 'approvals', c.s); scenarioAccess(c.s, c.x, m.scenario); if (m.compare) scenarioAccess(c.s, c.x, m.compare) } catch { continue }
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: m.zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(c.now))
  if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 1 || c.now < zonedInstant(date, 8, m.zone)) continue
  const id = `${m.id}:${date}`, mission = find(c.s, 'agent-mission', m.id)
  if (!mission?.enabled || !agentEnabled(c.s, 'missions') || find(c.s, 'mission-run', id)) continue
  const stale = await staleSources(c)
  put(c.s, 'mission-run', id, { mission: m.id, date, status: 'pending', stale, governanceRevision: governance(c.s).revision, deliveries: {}, createdAt: c.now })
  c.activity.push({ action: 'mission-started', record: id, detail: { agent: 'Recurring missions', person: m.owner, stale } })
  await commit(c)
  let message = `Agent work: ${m.name}. Sources stale: ${stale.join(', ')}. No financial analysis was generated.`
  if (!stale.length) {
   try {
    c = await open()
    const input = { ...m, missionSlot: id }, preview = await analystPreview(c, input), intent = await beginAnalyst(c, { ...input, fingerprint: preview.fingerprint, consent: true })
    await commit(c)
    c = await open(); const authorized = await authorizeAnalyst(c, intent.id)
    requireAgent(c, 'missions'); requireThat(find(c.s, 'agent-mission', m.id)?.enabled, 'Mission stopped', 409)
    await readFence(c.db, actor, c.revision)
    const response = await performCommentary(env, authorized)
    c = await open(); requireAgent(c, 'missions'); requireThat(find(c.s, 'agent-mission', m.id)?.enabled, 'Mission stopped', 409)
    const answer = await finishAnalyst(c, intent.id, response)
    await commit(c)
    requireThat(answer.status === 'answered', 'Mission analysis unavailable', 409)
    message = `Agent work: ${m.name}. Model: ${answer.model}. Read-only cited aggregate totals in ${answer.currency} cents:\n` + answer.citations.map(cell => `${cell.department}: ${cell.line}, ${cell.month} = ${cell.amount}; citation ${cell.id}`).join('\n')
   } catch {
    c = await open(); const run = get(c.s, 'mission-run', id)
    put(c.s, 'mission-run', id, { ...run, status: 'blocked', reason: 'Analysis stopped, stale, refused or over budget' }); await commit(c); continue
   }
  }
  for (const recipient of m.recipients) {
   c = await open(); const run = get(c.s, 'mission-run', id)
   try { requireFinance(c.x); requireCapabilityGrant(c.x, 'approvals', c.s) } catch { continue }
   if (!agentEnabled(c.s, 'missions') || governance(c.s).revision !== run.governanceRevision || !find(c.s, 'agent-mission', m.id)?.enabled || run.deliveries[recipient]) continue
   if (!await c.db.prepare("SELECT id FROM oa_operators WHERE email=? AND status='active' AND role IN ('owner','admin')").bind(recipient).first()) continue
   // Durable intent precedes mail. Unknown outcomes are never retried.
   put(c.s, 'mission-run', id, { ...run, deliveries: { ...run.deliveries, [recipient]: 'sending' } }); await commit(c)
   let status = 'unknown'
   try { const sender = operatorMail(env); if (sender) { const freshStale = await staleSources(c); const body = freshStale.length ? `Agent work: ${m.name}. Sources stale: ${freshStale.join(', ')}. No financial analysis is reported.` : message; const result = await sender.send({ to: [recipient], from: env.MAIL_FROM ?? '', subject: `Easel mission: ${m.name}`, text: body, html: '', headers: {}, deliveryId: `${id}:${recipient}` }); status = result.status } } catch {}
   c = await open(); const after = get(c.s, 'mission-run', id)
   put(c.s, 'mission-run', id, { ...after, deliveries: { ...after.deliveries, [recipient]: status } })
   c.activity.push({ action: 'mission-delivery', record: id, detail: { agent: 'Recurring missions', recipient, status, stale } }); await commit(c)
  }
  c = await open(); const run = get(c.s, 'mission-run', id)
  put(c.s, 'mission-run', id, { ...run, status: stale.length ? 'stale' : 'completed', completedAt: c.now }); await commit(c)
  completed++
 }
 return { completed }
}
