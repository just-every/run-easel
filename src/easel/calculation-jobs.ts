// Durable operation receipts. Work retains the initiating actor and the normal
// model save fences; neither job admission nor result storage edits e_records.
import { access, grantCeiling, requireMember } from './access'
import type { Context } from './context'
import { canSeeScenario } from './scenario-access'
import { authority, load, readFence, sha256 } from './store'
import { Fault, find, requireThat, type Access, type State } from './types'

export type CalculationJobStatus = 'running' | 'completed' | 'failed' | 'interrupted'
export type CalculationJob = {
 id: string; scenarios: string[]; status: CalculationJobStatus; startedAt: string
 completedAt?: string; error?: string
}
export type CalculationJobEnvelope = { calculationJob: CalculationJob; result?: unknown; responseStatus?: number }
type JobRow = {
 id: string; actor_id: string; authority_digest: string; scenarios: string
 status: CalculationJobStatus; started_at: string; deadline_at: number
 completed_at: string | null; error: string | null; response_status: number | null; result_chunks: number
}

const DEADLINE_MS = 120_000
// At most 512 KiB UTF-8 per value, safely below D1's individual value limit.
const CHUNK_CHARACTERS = 128 * 1024
const UNKNOWN_OUTCOME = 'The operation stopped reporting before completion. Its outcome is unknown; reload the plan before deciding what to do next.'
const REQUEST_FAILED = 'Easel could not complete this request'

function canonical(value: any): any {
 if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
 if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]))
 return value
}

async function authorityDigest(s: State, x: Access) {
 const a = x.actor, token = a.token
 // Request method and native session id are deliberately absent: the same actor
 // may poll from a fresh session, but a distinct issued token has no result right.
 return sha256(JSON.stringify(canonical({
  actor: { id: a.id, email: a.email, version: a.version, baseRole: a.baseRole },
  role: x.role, departments: x.departments, payDetail: x.payDetail === true,
  dimensionLimited: x.dimensionLimited === true, statementDepartments: x.statementDepartments ?? [],
  grants: grantCeiling(x, s),
  token: token ? { id: token.id, kind: token.kind, scope: token.scope, role: token.role,
   departments: token.departments, payDetail: token.payDetail, grants: token.grants ?? null } : null,
 })))
}

function metadata(row: JobRow): CalculationJob {
 return { id: row.id, scenarios: JSON.parse(row.scenarios), status: row.status, startedAt: row.started_at,
  ...(row.completed_at ? { completedAt: row.completed_at } : {}), ...(row.error ? { error: row.error } : {}) }
}

async function expire(db: D1Database) {
 const now = Date.now()
 await db.prepare(`UPDATE e_calculation_jobs SET status='interrupted',completed_at=?,error=?
  WHERE status='running' AND deadline_at<=?`).bind(new Date(now).toISOString(), UNKNOWN_OUTCOME, now).run()
}

function mayReadMetadata(s: State, x: Access, row: JobRow) {
 return (JSON.parse(row.scenarios) as string[]).every(id => {
  const scenario = find(s, 'scenario', id)
  return scenario ? canSeeScenario(x, scenario) : row.actor_id === x.actor.id
 })
}

/** Always resolve current membership; a caller's mutable command state is not
 * evidence of access to a previously stored result. */
async function reader(c: Context) {
 const { state, revision } = await load(c.db), x = access(state, c.x.actor)
 requireMember(x)
 return { state, revision, x }
}

export async function startCalculationJob(c: Context & { revision: number }, scenarios: string[], work: (id: string) => Promise<Response>, waitUntil: (promise: Promise<any>) => void): Promise<CalculationJobEnvelope> {
 const x = access(c.s, c.x.actor)
 requireMember(x)
 requireThat(scenarios.length > 0 && scenarios.every(id => typeof id === 'string' && id.length > 0), 'Choose the affected scenarios')
 const affected = [...new Set(scenarios)], id = crypto.randomUUID(), now = Date.now(), startedAt = new Date(now).toISOString()
 for (const scenario of affected) {
  const existing = find(c.s, 'scenario', scenario)
  requireThat(!existing || canSeeScenario(x, existing), 'Scenario not found', 404)
 }
 const digest = await authorityDigest(c.s, x), auth = authority(x.actor)
 // The overlap check and insert share a D1 transaction. Concurrent admissions
 // cannot both pass; normal model writes continue to use their revision fence.
 try {
  await c.db.batch([
   c.db.prepare(`INSERT INTO e_guard SELECT CASE WHEN (${auth.sql}) AND (SELECT revision FROM e_meta WHERE id=1)=?
    THEN 1 ELSE 0 END`).bind(...auth.params, c.revision),
   c.db.prepare(`UPDATE e_calculation_jobs SET status='interrupted',completed_at=?,error=? WHERE status='running' AND deadline_at<=?`)
    .bind(startedAt, UNKNOWN_OUTCOME, now),
   c.db.prepare(`INSERT INTO e_guard SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM e_calculation_jobs j,json_each(j.scenarios) a,json_each(?) b
    WHERE j.status='running' AND a.value=b.value) THEN 1 ELSE 0 END`).bind(JSON.stringify(affected)),
   c.db.prepare(`INSERT INTO e_calculation_jobs(id,actor_id,authority_digest,scenarios,source_revision,status,started_at,deadline_at)
    VALUES(?,?,?,?,?,'running',?,?)`).bind(id, x.actor.id, digest, JSON.stringify(affected), c.revision, startedAt, now + DEADLINE_MS),
   c.db.prepare('DELETE FROM e_guard'),
  ])
 } catch (error) {
  if (String(error).includes('CHECK constraint')) throw new Fault(409, 'A calculation is already running for this scenario, or the plan or your access changed; reload')
  throw error
 }
 // Defer the command itself, not just its response persistence. The caller owns
 // the execution context and passes its native waitUntil implementation.
 waitUntil(Promise.resolve().then(() => execute(c.db, id, now + DEADLINE_MS, work)))
 return { calculationJob: { id, scenarios: affected, status: 'running', startedAt } }
}

async function execute(db: D1Database, id: string, deadline: number, work: (id: string) => Promise<Response>) {
 let body: string, responseStatus: number
 try {
  const response = await work(id)
  responseStatus = response.status
  body = JSON.stringify(await response.json())
 } catch (error) {
  responseStatus = error instanceof Fault ? error.status : 500
  body = JSON.stringify({ error: error instanceof Fault ? error.message : REQUEST_FAILED })
 }
 if (Date.now() >= deadline) { await expire(db); return }
 try {
  let ordinal = 0
  // Stage in small batches. Publication below is atomic; partial chunks are
  // never readable, even if the worker disappears between batches.
  for (let offset = 0; offset < body.length;) {
   const statements: D1PreparedStatement[] = []
   for (let n = 0; n < 16 && offset < body.length; n++) {
    // Do not split a UTF-16 surrogate pair across D1 TEXT values.
    let end = Math.min(offset + CHUNK_CHARACTERS, body.length)
    const last = body.charCodeAt(end - 1)
    if (end < body.length && last >= 0xd800 && last <= 0xdbff) end--
    statements.push(db.prepare(`INSERT INTO e_calculation_job_chunks(job_id,ordinal,body)
     SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM e_calculation_jobs WHERE id=? AND status='running' AND deadline_at>?)`)
     .bind(id, ordinal++, body.slice(offset, end), id, Date.now()))
    offset = end
   }
   await db.batch(statements)
   if (Date.now() >= deadline) { await expire(db); return }
  }
  const now = Date.now()
  await db.prepare(`UPDATE e_calculation_jobs SET status=?,completed_at=?,response_status=?,result_chunks=?,error=?
   WHERE id=? AND status='running' AND deadline_at>? AND (SELECT count(*) FROM e_calculation_job_chunks WHERE job_id=?)=?`)
   .bind(responseStatus >= 400 ? 'failed' : 'completed', new Date(now).toISOString(), responseStatus, ordinal,
    responseStatus >= 400 ? 'The operation failed. Its response is available to the original actor with unchanged access.' : null,
    id, now, id, ordinal).run()
  await expire(db)
 } catch {
  // The command may already have saved successfully. Losing its receipt cannot
  // honestly be called a failed calculation, and must never trigger a rerun.
  await db.prepare(`UPDATE e_calculation_jobs SET status='interrupted',completed_at=?,error=? WHERE id=? AND status='running'`)
   .bind(new Date().toISOString(), UNKNOWN_OUTCOME, id).run()
 }
}

export async function readCalculationJob(c: Context, id: string): Promise<CalculationJobEnvelope> {
 const { state, revision, x } = await reader(c)
 await expire(c.db)
 const row = await c.db.prepare('SELECT * FROM e_calculation_jobs WHERE id=?').bind(id).first<JobRow>()
 requireThat(row && mayReadMetadata(state, x, row), 'Calculation job not found', 404)
 const envelope: CalculationJobEnvelope = { calculationJob: metadata(row) }
 if (row.actor_id === x.actor.id && row.authority_digest === await authorityDigest(state, x) && ['completed', 'failed'].includes(row.status)) {
  const { results } = await c.db.prepare('SELECT ordinal,body FROM e_calculation_job_chunks WHERE job_id=? ORDER BY ordinal').bind(id).all<{ ordinal: number; body: string }>()
  requireThat(results.length === row.result_chunks && results.every((r, i) => r.ordinal === i), 'The operation response is incomplete; reload the plan to check its outcome', 409)
  envelope.result = JSON.parse(results.map(r => r.body).join(''))
  envelope.responseStatus = row.response_status!
 }
 await readFence(c.db, x.actor, revision)
 return envelope
}

/** The caller checks its requested scenario before displaying this metadata. */
export async function activeCalculationJob(c: Context, scenario: string, excludingId?: string): Promise<CalculationJob | undefined> {
 requireMember(c.x)
 const row = await c.db.prepare(`SELECT j.* FROM e_calculation_jobs j WHERE j.status='running' AND j.id<>?
  AND EXISTS(SELECT 1 FROM json_each(j.scenarios) WHERE value=?) ORDER BY j.started_at LIMIT 1`)
  .bind(excludingId ?? '', scenario).first<JobRow>()
 if (!row || !mayReadMetadata(c.s, c.x, row)) return undefined
 if (row.deadline_at <= Date.now()) { await expire(c.db); return undefined }
 // The caller's normal read/save fence checks this already-loaded context.
 // Polling a result itself resolves current authority again in reader().
 return metadata(row)
}
