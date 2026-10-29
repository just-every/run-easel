import { hrisOwnerEvidence } from '../hris-source'
import { agentEnabled, requireAgent } from './governance'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
// Deterministic owner questions: an authenticated answer is evidence, never
// permission for an agent to promote a forecast.
import { requireCapability, requireFinance, requireMember } from '../access'
import type { Context } from '../context'
import { notify } from '../notify'
import { financeEmails } from '../calendar'
import { scenarioInputs } from '../model'
import { bump, plan } from '../plan'
import { workingCalculation } from '../calculation'
import { all, choice, find, get, integer, put, requireThat, text, uid, type Data } from '../types'
import { changedDate, datedInputs, linkedInput, questionOwner } from './owner-question-input'

const native = (c: Context) => requireThat(!c.x.actor.token && !c.x.actor.scheduler, 'Use a signed-in session for owner assumptions', 403)
const finance = (c: Context) => { native(c); requireFinance(c.x); requireCapability(c.x, 'approvals', c.s) }
export const questionsEnabled = (c: Context) => find(c.s, 'owner-question-settings', 'main')?.enabled === true
export async function canReadQuestion(c: Context, q: Data, email = c.x.actor.email) {
 if (!questionsEnabled(c)) return false
 const person = await c.db.prepare("SELECT role FROM oa_operators WHERE email=? AND status='active'").bind(email).first<{role:string}>()
 if (!person) return false
 // Full-scope finance administers; the explicitly bound owner sees only the
 // question whose underlying input they can still read.
 if (['owner', 'admin'].includes(person.role)) return await questionOwner(c, email, q)
 return email === q.owner && await questionOwner(c, email, q)
}
function currentQuestion(c: Context, b: Data) {
 const q = get(c.s, 'owner-question', b.id)
 requireThat(integer(b.revision, 'Question revision', 1, Number.MAX_SAFE_INTEGER) === q.revision, 'This question changed; reload it before answering', 409)
 return q
}
function keep(c: Context, q: Data, extra: Data, action: string, detail: Data = {}) {
 const next = { ...q, ...extra, revision: q.revision + 1, history: [...q.history, { action, by: c.x.actor.email, at: c.now, ...detail }] }
 put(c.s, 'owner-question', q.id, next)
 c.activity.push({ action, record: q.id, scenario: q.scenario, detail })
 return get(c.s, 'owner-question', q.id)
}
export async function ownerQuestionView(c: Context) {
 native(c); requireMember(c.x)
 const questions = []
 for (const q of all(c.s, 'owner-question')) if (await canReadQuestion(c, q)) questions.push(q)
 const fullFinance = c.x.role === 'finance' && !c.x.dimensionLimited
 const forecast = all(c.s, 'scenario').find(s => s.kind === 'forecast' && s.status === 'working' && !s.alternativeBudget && !s.entity)
 const owners = fullFinance ? (await c.db.prepare("SELECT email,display_name AS name FROM oa_operators WHERE status='active' ORDER BY display_name").all<any>()).results : []
 return { enabled: questionsEnabled(c), questions, inputs: fullFinance && forecast ? datedInputs(c, forecast.id).map(({input, ...row}) => { const imports=all(c.s,'payroll-import').filter(i=>i.scenario===forecast.id&&i.status==='imported'&&i.source?.startsWith('hris:')).sort((a,b)=>b.asOf.localeCompare(a.asOf));const observation=all(c.s,'roster-actual').find(r=>row.kind==='position'&&r.positionOrigin===row.originId&&r.ownerBinding&&imports.some(i=>i.destination===r.batch)&&imports.find(i=>i.provider===r.provider)?.destination===r.batch);return {...row,providerEvidence:observation?{observation:observation.id,provider:observation.provider,asOf:observation.asOf,...observation.ownerBinding}:null} }) : [], owners }
}
export async function escalateQuestions(c: Context) {
 if (!agentEnabled(c.s, 'questions')) return []
 const ids: string[] = []
 if (!questionsEnabled(c)) return ids
 for (const q of all(c.s, 'owner-question').filter(q => q.status === 'open' && !q.escalatedAt && q.dueAt <= c.now)) {
  const recipients = await financeEmails(c.db)
  const visible = []
  for (const email of recipients) if (await canReadQuestion(c, q, email)) visible.push(email)
  const sent = notify(c, 'owner-question-escalation', visible, { title: `Unanswered assumption: ${q.inputName}`, body: `${q.question}\nDue ${q.dueAt}. No answer or forecast change has been assumed.`, tab: 'review', record: q.id, department: q.department }, { includeActor: true })
  keep(c, q, { escalatedAt: c.now }, 'owner-question-escalated', { notifications: sent })
  ids.push(...sent)
 }
 return ids
}
export async function ownerQuestions(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!op.startsWith('owner-question-')) return undefined
 native(c); requireMember(c.x)
 if (op === 'owner-question-settings') {
  finance(c); requireThat(typeof b.enabled === 'boolean', 'Choose whether owner questions are enabled')
  put(c.s, 'owner-question-settings', 'main', { enabled: b.enabled, configuredBy: c.x.actor.email, configuredAt: c.now })
  c.activity.push({ action: op, record: 'main', detail: { enabled: b.enabled } })
  return { enabled: b.enabled }
 }
 requireThat(questionsEnabled(c), 'Finance has stopped owner questions', 409)
 if (op === 'owner-question-escalate') { finance(c); return { notifications: await escalateQuestions(c) } }
 if (op === 'owner-question-ask' || op === 'owner-question-propose') requireAgent(c, 'questions')
 if (op === 'owner-question-ask') {
  finance(c)
  const forecast = get(c.s, 'scenario', b.scenario)
  requireThat(forecast.kind === 'forecast' && forecast.status === 'working' && !forecast.sandbox && !forecast.alternativeBudget && !forecast.entity, 'Choose the official working company forecast')
  requireThat(integer(b.scenarioRevision, 'Forecast revision', 1, Number.MAX_SAFE_INTEGER) === forecast.revision, 'The forecast changed; review the dated input again', 409)
  const row = datedInputs(c, forecast.id).find(i => i.kind === b.kind && i.originId === b.originId && i.field === b.field)
  requireThat(row, 'Choose an explicit dated input you can read')
  const due = Date.parse(b.dueAt)
  requireThat(Number.isFinite(due) && due > Date.parse(c.now), 'Choose a future escalation time')
  const id = uid(), owner = text(b.owner, 'Input owner', 254).toLowerCase()
  if(row.input.pipeline)requireThat(row.providerOwner && row.providerOwner===owner,'Use the finance-reviewed CRM owner → native person map for this deal',409)
  const providerEvidence=b.hrisObservation?hrisOwnerEvidence(c,b.hrisObservation,forecast.id,row.originId):null
  requireThat(!providerEvidence||row.kind==='position'&&owner===providerEvidence.ownerEmail,'Use the reviewed provider owner for this hire question',409)
  const source=providerEvidence?`${providerEvidence.provider} roster ${providerEvidence.asOf}; reviewed native owner ${providerEvidence.ownerEmail}`:text(b.source,'Reviewed ownership source',1000)
  const q = { providerEvidence, id, revision: 1, scenario: forecast.id, scenarioRevision: forecast.revision, inputKind: row.kind, originId: row.originId, field: row.field, inputName: row.name, department: row.department, owner, source, question: text(b.question, 'Structured question', 1000), expectedDate: row.value, dueAt: new Date(due).toISOString(), status: 'open', askedBy: c.x.actor.email, askedAt: c.now, inputFingerprint: sha256(canonicalJson(row.input)), history: [] }
  if(row.input.pipeline)q.source=row.ownershipSource!
  requireThat(await questionOwner(c, owner, q), 'The named owner must be active and permitted to read this input', 403)
  requireThat(!all(c.s, 'owner-question').some(v => v.scenario === q.scenario && v.originId === q.originId && v.field === q.field && v.status === 'open'), 'This input already has an unanswered question', 409)
  changedDate(c, q, row.input, row.value)
  put(c.s, 'owner-question', id, q)
  notify(c, 'owner-question', [owner], { title: `Confirm ${q.inputName}`, body: `${q.question}\nCurrent assumption: ${q.expectedDate}. Answer Yes, No or a new date in Easel.\nOwnership source: ${q.source}\nEscalates at ${q.dueAt}.`, tab: 'review', record: id, department: q.department }, { includeActor: true })
  c.activity.push({ action: op, record: id, scenario: forecast.id, detail: { owner, originId: q.originId, source: q.source } })
  return get(c.s, 'owner-question', id)
 }
 const q = currentQuestion(c, b)
 requireThat(await canReadQuestion(c, q), 'Question not found', 404)
 if (op === 'owner-question-cancel') {
  finance(c); requireThat(q.status === 'open', 'Only an open question can be canceled', 409)
  const reason = text(b.reason, 'Cancellation reason', 1000)
  return keep(c, q, { status: 'canceled', canceledAt: c.now }, op, { reason })
 }
 if (op === 'owner-question-propose') {
  finance(c)
  requireThat(q.answer && ['yes', 'new-date'].includes(q.answer.choice), 'A negative or missing answer never becomes a date')
  requireThat(!q.answer.proposal, 'This answer already has a proposal', 409)
  if(q.providerEvidence)requireThat(canonicalJson(hrisOwnerEvidence(c,q.providerEvidence.observation,q.scenario,q.originId))===canonicalJson(q.providerEvidence),'Provider ownership evidence changed; ask and review a new question',409)
  const forecast = get(c.s, 'scenario', q.scenario), row = linkedInput(c, q)
  requireThat(forecast.revision === q.scenarioRevision && sha256(canonicalJson(row.input)) === q.inputFingerprint, 'The forecast or source input changed; ask and review a new question', 409)
  const next = changedDate(c, q, row.input, q.answer.date)
  const p = (await plan(c, 'proposal-create', { from: forecast.id, name: `Owner assumption: ${q.inputName}`.slice(0, 200), request: `${q.question}\n${q.answer.by} answered ${q.answer.choice}: ${q.answer.date} at ${q.answer.at}. Source: ${q.source}${q.answer.note ? `\nFinance override: ${q.answer.note}` : ''}`.slice(0, 2000) }))!
  const copy = scenarioInputs(c.s, p.id, q.inputKind).find(i => i.originId === q.originId)!
  const evidence = { question: q.id, source: q.source, owner: q.owner, answeredBy: q.answer.by, answeredAt: q.answer.at, choice: q.answer.choice, date: q.answer.date, note: q.answer.note ?? '', expectedDate: q.expectedDate, providerEvidence:q.providerEvidence??null }
  put(c.s, q.inputKind, copy.id, { ...next, id: copy.id, scenario: p.id, ownerAssumption: evidence })
  const {providerEvidence:_providerEvidence,...sharedEvidence}=evidence
  put(c.s, 'scenario', p.id, { ...get(c.s, 'scenario', p.id), ownerAssumption: sharedEvidence })
  bump(c, get(c.s, 'scenario', p.id), 'owner-assumption-proposed', p.id, { question: q.id })
  await workingCalculation(c, p.id)
  keep(c, q, { answer: { ...q.answer, proposal: p.id } }, 'owner-question-proposed', { proposal: p.id })
  return get(c.s, 'scenario', p.id)
 }
 requireThat(op === 'owner-question-answer' || op === 'owner-question-override', 'Unknown owner question action', 404)
 requireThat(q.status !== 'canceled', 'This question was canceled', 409)
 const override = op === 'owner-question-override'
 if (override) finance(c)
 else { requireThat(c.x.actor.email === q.owner && await questionOwner(c, q.owner, q), 'Only the bound input owner may answer', 403); requireThat(q.status === 'open', 'The owner has already answered', 409) }
 const answerChoice = choice(b.choice, ['yes', 'no', 'new-date'] as const, 'Yes, No or a new date')
 const date = answerChoice === 'yes' ? q.expectedDate : answerChoice === 'new-date' ? changedDate(c, q, linkedInput(c, q).input, b.date)[q.field] : null
 const note = override ? text(b.note, 'Finance override note', 1000) : ''
 const answer = { choice: answerChoice, date, by: c.x.actor.email, at: c.now, source: q.source, note, override }
 return keep(c, q, { status: override ? 'overridden' : 'answered', answer }, op, { answer })
}
