import { fileURLToPath as __rerTestEntryPath } from 'node:url';
const __rerTestEntry = __rerTestEntryPath(import.meta.resolve('@runeditrun/rer/internal/global/rer.mjs'));
const __rerTestEntryArgs = args => args[1] === 'dev' && !args.some(arg => ['--foreground', '--detach', '--stop', '--help'].includes(arg)) ? [...args, '--foreground'] : args;
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { createPortability, makePart } from '@runeditrun/rer/modules/portability'
import { ContentVerifier, ArchiveVerifier } from '@runeditrun/rer/modules/portability/format'
import { fileRecords } from '@runeditrun/rer/modules/portability/files'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'

async function archive(db) {
 const service = await createPortability({ db, policy: easelPolicy }), id = await service.exports.create()
 try {
  while ((await service.exports.advance(id, { maxParts: 16 })).phase === 'building') {}
  return (await new Response(await service.exports.download(id)).text()).trim().split('\n').map(JSON.parse)
 } finally { await service.exports.abort(id) }
}
async function altered(original, mutate) {
 const records = structuredClone(original), parts = records.filter(r => r.kind === 'part')
 mutate(parts.flatMap(p => p.items).filter(i => i.kind === 'row'))
 for (const part of parts) Object.assign(part, await makePart(part.index, part.items))
 const verifier = new ContentVerifier(records[0])
 for (const part of parts) for (const item of part.items) verifier.add(item)
 records.at(-1).contentHash = verifier.digest()
 const integrity = new ArchiveVerifier(records[0])
 for (const part of parts) integrity.add(part)
 records.at(-1).archiveHash = integrity.digest()
 return records
}
function cli(root, extra = [], confirmed = true) {
 return new Promise((resolve, reject) => {
  const env = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }
  // This independent checkout must acquire its own local operation lock.
  delete env.RER_LOCAL_OPERATION
  const child = spawn(process.execPath, __rerTestEntryArgs([__rerTestEntry, 'import', '--input', 'exports/restore.rer', ...(confirmed ? ['--yes'] : []), '--non-interactive', '--json', '--no-queue', ...extra]), {
   cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''; child.stdout.on('data', b => { log += b }); child.stderr.on('data', b => { log += b })
  child.once('error', reject); child.once('close', code => resolve({ code, log }))
 })
}
async function fresh(root, destination) {
 const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
 for (const file of files) { await mkdir(dirname(join(destination, file)), { recursive: true }); await cp(join(root, file), join(destination, file)) }
 await symlink(join(root, 'node_modules'), join(destination, 'node_modules'), 'dir')
 await mkdir(join(destination, 'exports'))
}
// A same-schema v1 fixture exercises acknowledgement and the executable policy.
// A real prior-version archive and its additive migration boundary are separate
// upgrade evidence; converting this fixture does not authenticate v1 metadata.
function legacy(records) {
 const result = structuredClone(records)
 result[0].version = 1
 delete result.at(-1).archiveHash
 return result
}
const writeArchive = (destination, records) => writeFile(join(destination, 'exports/restore.rer'), records.map(JSON.stringify).join('\n') + '\n', { mode: 0o600 })
const recoveryFlags = ['--legacy-v1', '--acknowledge-unverified-metadata', '--output', 'exports/recovered-v2.rer']

export async function restoreFlow(h) {
 const original = await archive(h.db), root = process.cwd(), destination = await mkdtemp(join(tmpdir(), 'easel-restore-flow-'))
 let recoveryDestination
 const originalRows = original.filter(r => r.kind === 'part').flatMap(p => p.items).filter(i => i.kind === 'row')
 const snapshot = (rows, kind) => rows.find(i => i.table === 'e_snapshots' && i.row.kind === kind).row
 const changeBody = (rows, kind, mutate) => { const row = snapshot(rows, kind), body = JSON.parse(row.body); mutate(body); row.body = JSON.stringify(body) }
 try {
  await fresh(root, destination)
  const { getPlatformProxy } = createRequire(join(root, 'package.json'))('wrangler')
  const inspect = async (target = destination) => {
   const proxy = await getPlatformProxy({ configPath: join(target, 'wrangler.jsonc'), persist: { path: join(target, '.wrangler/state/v3') }, remoteBindings: false })
   try {
    return (await proxy.env.DB.batch(['e_records', 'e_actuals', 'e_snapshots', 'e_activity', 'ik_jobs', 'e_meta'].map(table => proxy.env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`)))).map(r => r.results)
   } finally { await proxy.dispose() }
  }
  await writeArchive(destination, legacy(original))
  const normalLegacy = await cli(destination)
  assert.equal(normalLegacy.code, 4, normalLegacy.log)
  assert.match(normalLegacy.log, /legacy_archive_unverifiable/)
  const missingAcknowledgement = await cli(destination, ['--legacy-v1', '--output', 'exports/recovered-v2.rer'])
  assert.equal(missingAcknowledgement.code, 4, missingAcknowledgement.log)
  assert.match(missingAcknowledgement.log, /acknowledge-unverified-metadata/)
  const missingLegacy = await cli(destination, ['--acknowledge-unverified-metadata', '--output', 'exports/recovered-v2.rer'])
  assert.equal(missingLegacy.code, 4, missingLegacy.log)
  assert.match(missingLegacy.log, /require --legacy-v1/)
  const unconfirmed = await cli(destination, recoveryFlags, false)
  assert.equal(unconfirmed.code, 4, unconfirmed.log)
  assert.match(unconfirmed.log, /--yes/)
  let empty
  const mutations = [
   rows => changeBody(rows, 'approval', b => { b.calculation.profit[0].profit += 100 }),
   rows => { snapshot(rows, 'approval').body += ' ' },
   rows => changeBody(rows, 'forecast', b => { b.calculation.cash[0].closing += 100 }),
   rows => changeBody(rows, 'pack', b => { b.profit.budget.profit += 100 }),
   rows => { const row = rows.find(i => i.table === 'e_records' && i.row.kind === 'scenario' && JSON.parse(i.row.value).kind === 'budget').row; const value = JSON.parse(row.value); value.approval.revision++; row.value = JSON.stringify(value) },
   rows => { const row = rows.find(i => i.table === 'e_records' && i.row.kind === 'scenario' && JSON.parse(i.row.value).kind === 'forecast').row; const value = JSON.parse(row.value); value.budgetSnapshot = snapshot(rows, 'pack').id; row.value = JSON.stringify(value) },
   // Even a recomputed inner digest cannot detach a saved revision from its event.
   rows => { changeBody(rows, 'forecast', b => { b.scenario.revision++ }); const row = snapshot(rows, 'forecast'); row.sha256 = createHash('sha256').update(row.body).digest('hex') },
   rows => { changeBody(rows, 'pack', b => { b.forecast.revision-- }); const row = snapshot(rows, 'pack'); row.sha256 = createHash('sha256').update(row.body).digest('hex') },
  ]
  if (originalRows.some(i => i.table === 'e_snapshots' && i.row.kind === 'reforecast')) {
   const changeReforecast = (rows, mutate) => {
    changeBody(rows, 'reforecast', mutate)
    const row = snapshot(rows, 'reforecast')
    row.sha256 = createHash('sha256').update(row.body).digest('hex')
   }
   mutations.push(
    rows => changeBody(rows, 'reforecast', b => { b.calculation.profit[0].profit += 100 }),
    rows => { snapshot(rows, 'reforecast').sha256 = '0'.repeat(64) },
    rows => { const sn = snapshot(rows, 'reforecast'), row = rows.find(i => i.table === 'e_records' && i.row.kind === 'scenario' && i.row.id === sn.scenario).row; const value = JSON.parse(row.value); value.reforecast.snapshot = snapshot(rows, 'approval').id; row.value = JSON.stringify(value) },
    // Rehashing a body cannot break its lineage, revision or full-model contract.
    rows => changeReforecast(rows, b => { b.source.scenario = b.scenario.id }),
    rows => changeReforecast(rows, b => { b.revision++ }),
    rows => changeReforecast(rows, b => { delete b.inputs.schedule }),
    rows => { const sn = snapshot(rows, 'reforecast'), row = rows.find(i => i.table === 'e_activity' && i.row.action === 'reforecast-save' && i.row.record === sn.scenario).row; const detail = JSON.parse(row.detail); detail.source = sn.scenario; row.detail = JSON.stringify(detail) },
   )
  }
  for (const mutate of mutations) {
   const records = await altered(original, mutate)
   await writeArchive(destination, records)
   const result = await cli(destination)
   assert.equal(result.code, 4, result.log)
   const events = result.log.split('\n').flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
   assert.ok(events.some(event => event.event === 'error' && event.code === 'restore_refused' && /\(easel_[a-z_]+\)/.test(event.message)), result.log)
   const current = await inspect()
   assert.ok(current.slice(0, -1).every(rows => rows.length === 0), 'refused restore published native records')
   if (empty) assert.deepEqual(current, empty, 'refused restore changed the destination')
   empty = current
  }
  await writeArchive(destination, legacy(await altered(original, mutations[0])))
  const corruptLegacy = await cli(destination, recoveryFlags)
  assert.equal(corruptLegacy.code, 4, corruptLegacy.log)
  assert.match(corruptLegacy.log, /\(easel_snapshot_digest\)/)
  assert.deepEqual(await inspect(), empty, 'refused legacy restore changed the destination')

  await writeArchive(destination, original)
  const result = await cli(destination)
  assert.equal(result.code, 0, result.log)
  const restored = await inspect()
  assert.deepEqual(restored[2].map(r => [r.id, r.sha256, r.body]).sort(), originalRows.filter(i => i.table === 'e_snapshots').map(i => [i.row.id, i.row.sha256, i.row.body]).sort())
  // AUDIT-001: export/restore retains every actor, value change and sequence.
  assert.deepEqual(restored[3], originalRows.filter(i => i.table === 'e_activity').map(i => i.row))
  assert.equal(restored[0].length, originalRows.filter(i => i.table === 'e_records').length)
  assert.equal(restored[1].length, originalRows.filter(i => i.table === 'e_actuals').length)
  await writeArchive(destination, legacy(original))
  const occupied = await cli(destination, recoveryFlags)
  assert.equal(occupied.code, 4, occupied.log)
  assert.match(occupied.log, /legacy_target_not_empty/)
  assert.deepEqual(await inspect(), restored, 'legacy recovery changed a populated destination')

  recoveryDestination = await mkdtemp(join(tmpdir(), 'easel-legacy-restore-flow-'))
  await fresh(root, recoveryDestination)
  await writeArchive(recoveryDestination, legacy(original))
  const recovered = await cli(recoveryDestination, recoveryFlags)
  assert.equal(recovered.code, 0, recovered.log)
  assert.deepEqual(await inspect(recoveryDestination), restored)
  const recoveredRecords = []
  // Normal Base verification here requires the fresh v2 outer binding.
  for await (const record of fileRecords(join(recoveryDestination, 'exports/recovered-v2.rer'))) recoveredRecords.push(record)
  assert.deepEqual(recoveredRecords.filter(r => r.kind === 'part').flatMap(p => p.items).filter(i => i.kind === 'row'), originalRows)
  const proxy = await getPlatformProxy({ configPath: join(recoveryDestination, 'wrangler.jsonc'), persist: { path: join(recoveryDestination, '.wrangler/state/v3') }, remoteBindings: false })
  try {
   const audit = (await proxy.env.DB.prepare('SELECT details FROM rer_portability_recovery_audit').all()).results.map(row => JSON.parse(row.details))
   assert.equal(audit.length, 1)
   assert.equal(audit[0].acknowledgedUnverifiedMetadata, true)
   assert.equal(audit[0].sourceIdentity, original[0].sourceIdentity)
  } finally { await proxy.dispose() }
 } finally {
  await rm(destination, { recursive: true, force: true })
  if (recoveryDestination) await rm(recoveryDestination, { recursive: true, force: true })
 }
}
