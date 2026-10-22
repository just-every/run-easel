// Department review never grants authority. Recorded versions govern order;
// current membership, grants and reviewer removal govern every decision.
import { access, dimensionAllowed, requireCapability, requireMember, seesDepartmentDetail, seesPayDetail } from './access'
import { hasFullScope } from './access-grants'
import type { Context } from './context'
import { INPUT_KINDS, scenarioInputs } from './model'
import { nativeBindings } from './native-input'
import { workbookDependencies } from './workbook-formula'
import { visibleNativeInput } from './native-visibility'
import { scenarioAccess } from './scenario-access'
import { financeRecipients, notify } from './notify'
import { all, find, get, put, requireThat, text, uid, type Access, type Data, type State } from './types'

export function managesChains(x: Access, s: State) {
 return !!x.role && (x.capabilities?.includes('approvals') ?? x.role === 'finance') && hasFullScope(s, x)
}
const canonical = (v: any): string => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
function departmentInputs(s: State, scenario: string, department: string) {
 const candidates = INPUT_KINDS.flatMap(kind => scenarioInputs(s, scenario, kind).map(input => ({ kind, input })))
 const selected = new Map<string, typeof candidates[number]>()
 const add = (row: typeof candidates[number]) => selected.set(`${row.kind}:${row.input.id}`, row)
 for (const row of candidates) if (row.input.department === department || row.input.sourceDepartment === department || row.input.targets?.some((t: Data) => t.department === department)) add(row)
 // Follow native dependencies so a review never signs a hidden source. Only
 // related inputs enter the digest; independent department edits do not.
 let prior = -1
 while (prior !== selected.size) {
  prior = selected.size
  for (const { kind, input } of [...selected.values()]) {
   if (kind === 'asset') for (const row of candidates) if (row.kind === 'asset-category' && row.input.originId === input.category) add(row)
   if (kind === 'allocation') for (const row of candidates) if (row.input.department === input.sourceDepartment || input.basis === 'headcount' && row.kind === 'position' && input.targets.some((t: Data) => t.department === row.input.department)) add(row)
   if (kind === 'formula') for (const binding of nativeBindings(input)) {
    if (binding.scenario && binding.scenario !== scenario) continue
    for (const row of candidates) if (binding.origin ? row.kind === 'formula' && row.input.originId === binding.origin : binding.department && row.input.department === binding.department && row.input.line === binding.line) add(row)
   }
  }
 }
 const result: Record<string, Data[]> = Object.fromEntries(INPUT_KINDS.map(kind => [kind, [...selected.values()].filter(row => row.kind === kind).map(row => row.input)]))
 // A translated workbook's cells can span departments. Capture only the
 // submitted schedules' transitive cells and their effective overrides.
 for (const { input: book } of candidates.filter(row => row.kind === 'workbook-model')) {
  const schedules = result.schedule.filter(row => row.workbookOrigin === book.originId)
  const roots = schedules.flatMap(row => Object.values(row.workbookCells ?? {})) as string[]
  if (!roots.length) continue
  const keys = [...new Set(roots.flatMap(key => [key, ...workbookDependencies(book.graph, key)]))].sort()
  const overrides = { ...book.overrides }
  for (const row of candidates.filter(row => row.kind === 'schedule' && row.input.workbookOrigin === book.originId)) for (const [month, key] of Object.entries(row.input.workbookCells ?? {})) if (!book.graph.cells[key as string]?.formula) overrides[key as string] = row.input.values[month]
  result['workbook-model'].push({ id: book.id, originId: book.originId, scenario, department, cells: Object.fromEntries(keys.map(key => [key, book.graph.cells[key] ?? null])), overrides: Object.fromEntries(keys.filter(key => overrides[key] !== undefined).map(key => [key, overrides[key]])) })
 }
 return result
}
export async function reviewContent(s: State, scenario: string, department: string) {
 const inputs = departmentInputs(s, scenario, department)
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(inputs)))
 return { revision: get(s, 'scenario', scenario).revision, digest: [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join(''), inputs }
}
const contentRef = (content: Data) => ({ revision: content.revision, digest: content.digest })
const config = (s: State, department: string) => find(s, 'approval-chain', department)
const recorded = (s: State, sub: Data) => sub.review?.version ? get(s, 'approval-chain-version', sub.review.version) : null
const currentStep = (s: State, sub: Data) => recorded(s, sub)?.steps[sub.review.decisions.length]
const named = (s: State, step: Data | undefined, email: string) => !!step && (step.members.includes(email) || step.groups.some((id: string) => find(s, 'access-group', id)?.members.includes(email)))

async function people(c: Context) {
 const result = await c.db.prepare("SELECT id,email,display_name AS name,role,version FROM oa_operators WHERE status='active' ORDER BY email").all<Data>()
 return result.results
}
function personAccess(c: Context, p: Data) {
 return access(c.s, { id: p.id, email: p.email, name: p.name, baseRole: p.role, version: p.version, session: '' })
}
function sourceReason(c: Context, x: Access, sub: Data): string {
 if (!['finance', 'contributor'].includes(x.role ?? '')) return 'An active finance person or contributor is required'
 if (!seesDepartmentDetail(x, sub.department)) return 'Department read access is required'
 const inputs = departmentInputs(c.s, sub.scenario, sub.department)
 for (const [kind, rows] of Object.entries(inputs)) for (const input of rows) {
  if (kind === 'workbook-model' && (x.role !== 'finance' || !x.payDetail)) return 'Workbook source review requires finance and Pay detail'
  if (kind === 'asset-category' || kind === 'workbook-model') continue
  if (!seesDepartmentDetail(x, input.department ?? input.sourceDepartment ?? sub.department) || !dimensionAllowed(c.s, x, input.dimensions, false, input.department ?? input.sourceDepartment ?? sub.department)) return 'Access to every department source and dimension member is required'
  if ((kind === 'position' || find(c.s, 'line', input.line)?.payroll) && !seesPayDetail(x, input.department ?? sub.department)) return 'Pay detail is required for this submission'
  if (kind === 'formula' && !visibleNativeInput(c.s, x, input)) return 'Access to every formula source is required'
 }
 return ''
}
function eligible(c: Context, x: Access, sub: Data, step: Data): string {
 const latest = config(c.s, sub.department)
 // Version changes do not silently add reviewers to an in-flight pass, and
 // removing a reviewer from the current chain revokes them immediately.
 const liveStep = latest?.steps.find((candidate: Data) => candidate.id === step.id)
 if (!named(c.s, step, x.actor.email) || !named(c.s, liveStep, x.actor.email)) return 'You are not a current reviewer for this step'
 return sourceReason(c, x, sub)
}
async function eligiblePeople(c: Context, sub: Data, step: Data) {
 return (await people(c)).filter(p => !eligible(c, personAccess(c, p), sub, step)).map(p => p.email)
}
function history(c: Context, sub: Data, status: string, extra: Data = {}) {
 return [...sub.history, { status, by: c.x.actor.email, at: c.now, step: null, chainVersion: sub.review?.version ?? null, pass: sub.review?.pass ?? null, content: sub.review?.content ?? null, ...extra }]
}
async function pending(c: Context, sub: Data) {
 const step = currentStep(c.s, sub)
 if (!step) return
 const existing = all(c.s, 'notification').filter(n => n.event === 'approval-step-pending' && n.record === sub.id && n.reviewPass === sub.review.pass && n.reviewStep === step.id && n.reviewDigest === sub.review.content.digest)
 const recipients = (await eligiblePeople(c, sub, step)).filter(email => !existing.some(n => n.recipient === email))
 const ids = notify(c, 'approval-step-pending', recipients, { title: `${get(c.s, 'department', sub.department).name}: ${step.name} is waiting for review`, tab: 'cycle', record: sub.id, department: sub.department }, { includeActor: true })
 for (const id of ids) put(c.s, 'notification', id, { ...get(c.s, 'notification', id), reviewPass: sub.review.pass, reviewStep: step.id, reviewDigest: sub.review.content.digest })
}
async function startPass(c: Context, sub: Data, version: Data | null, status: string, reason = '') {
 const content = await reviewContent(c.s, sub.scenario, sub.department), pass = uid()
 put(c.s, 'approval-content', pass, { scenario: sub.scenario, department: sub.department, ...content, createdBy: c.x.actor.email, createdAt: c.now })
 const review = { version: version?.id ?? null, pass, content: contentRef(content), decisions: [] }
 if (status === 'chain-submitted') sub = { ...sub, history: sub.history.map((entry: Data, i: number) => i === sub.history.length - 1 ? { ...entry, step: null, chainVersion: review.version, pass, content: review.content } : entry) }
 const next = { ...sub, status: version?.steps.length ? 'reviewing' : 'submitted', review,
  history: history(c, sub, status, { reason, voidedDecisions: sub.review?.decisions ?? [], nextPass: pass, nextChainVersion: review.version, nextContent: review.content }) }
 put(c.s, 'submission', sub.id, next)
 c.activity.push({ action: status, record: sub.id, scenario: sub.scenario, detail: { department: sub.department, chainVersion: review.version, pass, content: review.content, reason } })
 await pending(c, next)
 return get(c.s, 'submission', sub.id)
}
export async function beginDepartmentReview(c: Context, sub: Data) {
 const chain = config(c.s, sub.department)
 if (!chain) return sub
 return startPass(c, sub, get(c.s, 'approval-chain-version', chain.version), 'chain-submitted')
}
/** Shared save hook, including native commands, MCP and import outcome saves.
 * Rechecking the digest at the review/approval doors also fences an interrupted
 * import before its final outcome save. Unrelated department edits keep a pass. */
export async function reconcileApprovalChains(c: Context) {
 for (const sub of all(c.s, 'submission')) {
  if (!sub.review?.version || !['reviewing', 'submitted'].includes(sub.status) || find(c.s, 'scenario', sub.scenario)?.status !== 'working') continue
  const content = await reviewContent(c.s, sub.scenario, sub.department)
  if (content.digest !== sub.review.content.digest) await startPass(c, sub, recorded(c.s, sub), 'chain-restarted', 'Department inputs changed')
  else if (sub.status === 'reviewing') await pending(c, sub)
 }
}
export async function requireCompletedChains(c: Context, scenario: string) {
 for (const sub of all(c.s, 'submission').filter(s => s.scenario === scenario && s.review?.version)) {
  const version = recorded(c.s, sub)!, content = await reviewContent(c.s, scenario, sub.department)
  const waiting = content.digest === sub.review.content.digest ? sub.review.decisions.length : 0
  requireThat(sub.status === 'submitted' && waiting === version.steps.length, `Waiting for ${get(c.s, 'department', sub.department).name}: ${version.steps[waiting]?.name ?? 'resubmission'}`, 409)
 }
}
export async function mayReturn(c: Context, sub: Data) {
 if (managesChains(c.x, c.s)) return true
 if (!sub.review?.version || c.x.actor.agent) return false
 const version = recorded(c.s, sub)!
 return version.steps.slice(0, sub.review.decisions.length + 1).some((step: Data) => !eligible(c, c.x, sub, step))
}
export function returnedReview(c: Context, sub: Data, reason: string) {
 return { ...sub, status: 'returned', ...(sub.review ? { review: { ...sub.review, decisions: [] } } : {}), history: history(c, sub, 'returned', { reason, step: recorded(c.s, sub)?.steps.slice(0, (sub.review?.decisions.length ?? 0) + 1).find((step: Data) => !eligible(c, c.x, sub, step))?.id ?? null, voidedDecisions: sub.review?.decisions ?? [] }) }
}
export async function canReceiveChainNotice(c: Context, n: Data) {
 const sub = find(c.s, 'submission', n.record), step = sub && currentStep(c.s, sub)
 if (!sub || sub.status !== 'reviewing' || !step || sub.review.pass !== n.reviewPass || step.id !== n.reviewStep || sub.review.content.digest !== n.reviewDigest) return false
 if ((await reviewContent(c.s, sub.scenario, sub.department)).digest !== n.reviewDigest) return false
 return (await eligiblePeople(c, sub, step)).includes(n.recipient)
}

export async function approvalChains(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!['approval-chain-save', 'approval-chain-delete', 'approval-chain-restart', 'approval-step'].includes(op)) return undefined
 requireMember(c.x)
 if (op === 'approval-chain-save' || op === 'approval-chain-delete') {
  requireCapability(c.x, 'approvals', c.s)
  const dept = get(c.s, 'department', b.department), prior = config(c.s, dept.id)
  requireThat((prior?.version ?? null) === (b.version ?? null), 'The chain changed; reload before saving', 409)
  requireThat(op === 'approval-chain-delete' || Array.isArray(b.steps) && b.steps.length > 0, 'Add at least one review step')
  const active = await people(c)
  const steps = op === 'approval-chain-delete' ? [] : b.steps.map((step: Data, i: number) => {
   const members: string[] = [...new Set<string>((Array.isArray(step.members) ? step.members : []).map((v: unknown) => text(v, 'Reviewer email', 320).toLowerCase()))]
   const groups: string[] = [...new Set<string>((Array.isArray(step.groups) ? step.groups : []).map((v: unknown) => get(c.s, 'access-group', v).id))]
   requireThat(members.length + groups.length > 0, 'Each step needs people or groups')
   for (const email of members) requireThat(active.some(p => p.email === email && ['finance', 'contributor'].includes(personAccess(c, p).role ?? '')), 'Choose active finance people or contributors')
   const id = step.id ?? prior?.steps[i]?.id ?? uid()
   requireThat(!step.id || prior?.steps.some((p: Data) => p.id === step.id), 'Unknown review step')
   return { id, name: text(step.name, 'Step name', 120), members, groups }
  })
  requireThat(new Set(steps.map((s: Data) => s.id)).size === steps.length, 'Review steps must be distinct')
  const id = uid(), version = { department: dept.id, steps, number: (prior?.number ?? 0) + 1, createdBy: c.x.actor.email, createdAt: c.now }
  put(c.s, 'approval-chain-version', id, version)
  put(c.s, 'approval-chain', dept.id, { ...version, version: id })
  c.activity.push({ action: op, record: id, detail: { department: dept.id, version: id, number: version.number } })
  return get(c.s, 'approval-chain', dept.id)
 }
 const sub = get(c.s, 'submission', `${b.scenario}|${b.department}`, 'submission')
 const scenario = scenarioAccess(c.s, c.x, sub.scenario)
 requireThat(scenario.kind === 'budget' && scenario.status === 'working' && ['reviewing', 'submitted'].includes(sub.status), 'Review requires an in-flight working budget submission', 409)
 if (op === 'approval-chain-restart') {
  requireCapability(c.x, 'approvals', c.s)
  const chain = config(c.s, sub.department)
  requireThat(chain, 'No chain configuration exists', 409)
  requireThat(b.pass === sub.review?.pass && b.version === chain.version, 'The submission or chain changed; reload before restarting', 409)
  return startPass(c, sub, get(c.s, 'approval-chain-version', chain.version), 'chain-restarted', text(b.reason, 'Restart reason', 2000))
 }
 requireThat(!c.x.actor.agent, 'Agents cannot approve a review step', 403)
 const version = recorded(c.s, sub), step = version?.steps.find((s: Data) => s.id === b.step)
 requireThat(step, 'Choose a recorded review step', 409)
 requireThat(!eligible(c, c.x, sub, step), eligible(c, c.x, sub, step), 403)
 requireThat(sub.status === 'reviewing' && currentStep(c.s, sub)?.id === step.id, 'Review steps must be approved once, in order', 409)
 const content = await reviewContent(c.s, sub.scenario, sub.department)
 requireThat(b.pass === sub.review.pass && b.digest === sub.review.content.digest && content.digest === b.digest, 'The submitted content changed; review the restarted chain', 409)
 const decision = { step: step.id, by: c.x.actor.email, at: c.now, chainVersion: version!.id, pass: sub.review.pass, content: sub.review.content }
 const decisions = [...sub.review.decisions, decision]
 put(c.s, 'submission', sub.id, { ...sub, status: decisions.length === version!.steps.length ? 'submitted' : 'reviewing', review: { ...sub.review, decisions }, history: history(c, sub, 'step-approved', decision) })
 c.activity.push({ action: op, record: sub.id, scenario: sub.scenario, detail: { department: sub.department, ...decision } })
 await pending(c, get(c.s, 'submission', sub.id))
 if (all(c.s, 'submission').filter(s => s.scenario === scenario.id).every(s => s.status === 'submitted')) notify(c, 'approval-pending', await financeRecipients(c), { title: `${scenario.name}: every requested department has submitted`, tab: 'cycle', record: scenario.id, department: '' })
 return get(c.s, 'submission', sub.id)
}

export async function approvalChainView(c: Context, scenarioId: string) {
 requireMember(c.x)
 const scenario = scenarioAccess(c.s, c.x, scenarioId), manage = managesChains(c.x, c.s), active = await people(c)
 const rows = []
 for (const department of all(c.s, 'department')) {
  const sub = find(c.s, 'submission', `${scenario.id}|${department.id}`), chain = config(c.s, department.id)
  if (!manage && sourceReason(c, c.x, { scenario: scenario.id, department: department.id })) continue
  const version = sub?.review?.version ? recorded(c.s, sub)! : null
  const changed = !!version && (await reviewContent(c.s, scenario.id, department.id)).digest !== sub!.review.content.digest
  const next = changed ? 0 : sub?.review?.decisions.length ?? 0
  const steps = version ? await Promise.all(version.steps.map(async (step: Data, index: number) => {
   const reviewers = await eligiblePeople(c, sub!, step)
   return { ...step, reviewers, status: index < next ? 'approved' : index === next && sub!.status !== 'returned' ? reviewers.length ? 'waiting' : 'blocked' : 'pending', reason: reviewers.length ? '' : 'No active reviewer has current chain membership, every department source and required Pay detail', canApprove: !c.x.actor.agent && scenario.status === 'working' && !changed && sub!.status === 'reviewing' && index === next && !eligible(c, c.x, sub!, step) }
  })) : []
  rows.push({ department: department.id, name: department.name, nextVersion: chain ? { number: chain.number, steps: chain.steps.map((step: Data) => ({ name: step.name })) } : null, configuration: manage ? chain ?? null : null, submission: sub ? { ...sub, ...(changed ? { status: 'reviewing' } : {}) } : null, steps, changed, canReturn: !!sub && scenario.status === 'working' && ['reviewing', 'submitted'].includes(sub.status) && await mayReturn(c, sub) })
 }
 return { scenario: scenario.id, manage, departments: rows, people: manage ? active.filter(p => ['finance', 'contributor'].includes(personAccess(c, p).role ?? '')).map(p => ({ email: p.email, name: p.name })) : [], groups: manage ? all(c.s, 'access-group').map(g => ({ id: g.id, name: g.name })) : [] }
}
