// The full local proof from a fresh clone through the real rer commands:
// install, setup, check, describe, dev; the planning journey at 1440 and the
// review journey at 390; setup rerun, build, preview, deploy dry run; export,
// refused and corrupt imports, restore into a second clean installation and an
// exact comparison of the restored model, approvals and outputs; reset.
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, report, start } from './browser-runtime.mjs'
import { lobbyJourney } from './browser-lobby.mjs'
import { api, planningJourney, reviewJourney, session } from './browser-journey.mjs'
import { assertActorNames, operators, rejectSourceSession, roleNames } from './browser-identity.mjs'

const existing = process.argv.includes('--existing')
const root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-browser-proof')
await mkdir(evidence, { recursive: true })
let second, server, browser
const launch = async () => { let installed = true; try { await access(chromium.executablePath()) } catch { installed = false } return chromium.launch({ headless: true, ...(installed ? {} : { channel: 'chrome' }) }) }

/** Everything a restored owner should see again: the model, every scenario's outputs, approvals and packs. */
async function picture(context, origin) {
 const state = await api(context, origin, 'state')
 const scenarios = {}
 for (const s of state.scenarios) scenarios[s.name] = await api(context, origin, `scenario/${s.id}`)
 const snapshots = {}
 for (const s of state.snapshots) snapshots[s.id] = await api(context, origin, `snapshot/${s.id}`)
 // Both fields depend on this installation's native identities. Historical
 // emails and names inside planning records and snapshots remain compared.
 const { me: _me, actorNames: _actorNames, ...rest } = state
 return { state: rest, scenarios, snapshots, actuals: await api(context, origin, 'actuals') }
}

try {
 await command(root, ['install'])
 const port = existing ? 4829 : await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 await command(root, ['check'])
 await command(root, ['describe'])
 server = await start(root, port)
 browser = await launch()
 const journeys = [await lobbyJourney(browser, server, evidence), await planningJourney(browser, root, server.origin, evidence), await reviewJourney(browser, root, server.origin, evidence)]
 let owner = await session(browser, root, server.origin, 'owner', 1440)
 const sourceState = await api(owner.context, server.origin, 'state')
 const sourceOperators = await operators(owner.context, server.origin)
 assertActorNames(sourceState, sourceOperators)
 assert.equal(sourceState.actorNames[sourceState.me.email], sourceState.me.name)
 assert.ok(sourceOperators.some(person => person.email === 'board@dev.localhost'))
 await roleNames(browser, root, server.origin, sourceOperators)
 const sourceCookies = await owner.context.cookies(server.origin)
 const before = await picture(owner.context, server.origin)
 assert.equal(before.state.snapshots.filter(s => s.kind === 'approval').length, 1)
 assert.equal(before.state.packs.filter(p => p.status === 'published').length, 1)
 await owner.context.close(); await browser.close(); browser = undefined
 await server.close(); server = undefined

 // A setup rerun keeps the owner and every record; the built Worker keeps its session boundary.
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 await command(root, ['build'])
 server = await start(root, port, 'preview')
 assert.equal((await fetch(server.origin + '/health')).status, 200)
 assert.equal((await fetch(server.origin + '/api/easel/state')).status, 401)
 await server.close(); server = undefined
 await command(root, ['deploy', '--dry-run'])

 const archive = join(evidence, 'installation.rer')
 await rm(archive, { force: true }); await rm(join(root, 'exports/installation.rer'), { force: true })
 await command(root, ['export', '--output', 'exports/installation.rer'])
 await copyFile(join(root, 'exports/installation.rer'), archive)
 await command(root, ['import', '--input', 'exports/installation.rer', '--yes'], { expected: 4 })

 second = await fresh()
 await command(second, ['install'])
 // Reuse the stopped source's origin: local session cookie names include the
 // port, so replay must reach the actual destination session lookup.
 const secondPort = port
 await command(second, ['setup', '--owner-email', 'restored-owner@example.test', '--port', String(secondPort)])
 await mkdir(join(second, 'exports'), { recursive: true })
 await copyFile(archive, join(second, 'exports/installation.rer'))
 const bytes = await readFile(archive)
 const manifest = JSON.parse(bytes.toString('utf8').split('\n')[0])
 assert.ok(manifest.tables.every(table => !/^(oa_|oc_)/i.test(table.name)), 'The archive carries no native identities, sessions or credentials')
 await writeFile(join(second, 'exports/corrupt.rer'), Buffer.concat([bytes.subarray(0, Math.floor(bytes.length / 2)), Buffer.from('\ncorrupt\n')]))
 let refused = false
 try { await command(second, ['import', '--input', 'exports/corrupt.rer', '--yes']) } catch { refused = true }
 assert.ok(refused, 'A corrupt archive is refused')
 await command(second, ['import', '--input', 'exports/installation.rer', '--yes'])
 await command(second, ['export', '--output', 'exports/restored.rer'])
 await copyFile(join(second, 'exports/restored.rer'), join(evidence, 'restored.rer'))

 server = await start(second, secondPort)
 await rejectSourceSession(server.origin, sourceCookies)
 browser = await launch()
 owner = await session(browser, second, server.origin, 'owner', 1440)
 const restoredState = await api(owner.context, server.origin, 'state')
 const restoredOperators = await operators(owner.context, server.origin)
 assert.deepEqual(restoredOperators.map(person => person.email), [restoredState.me.email], 'Restore preserves only the destination owner; portable memberships do not create native identities')
 assert.notEqual(restoredState.me.email, sourceState.me.email)
 assert.ok(restoredOperators.every(person => !sourceOperators.some(source => source.id === person.id)))
 assertActorNames(restoredState, restoredOperators)
 assert.deepEqual(restoredState.actorNames, {}, 'Historical attribution does not restore the source native directory')
 const restoredVariance = await api(owner.context, server.origin, `variance/${restoredState.scenarios.find(sc => sc.kind === 'forecast').actualsThrough}`)
 assertActorNames(restoredVariance, restoredOperators)
 assert.deepEqual(restoredVariance.actorNames, {})
 const after = await picture(owner.context, server.origin)
 assert.deepEqual(after, before, 'The restored installation shows the same model, approvals, outputs, actuals and packs')
 // Re-admit one local persona through the destination's own dev key. Its
 // existing membership can now apply, and its native name becomes available.
 const sales = await session(browser, second, server.origin, 'sales', 1440)
 try {
  const salesState = await api(sales.context, server.origin, 'state')
  assert.equal(salesState.me.role, 'contributor')
  const admitted = await operators(owner.context, server.origin)
  assert.deepEqual(admitted.map(person => person.email).sort(), [restoredState.me.email, salesState.me.email].sort())
  assert.ok(admitted.every(person => !sourceOperators.some(source => source.id === person.id)))
  const resolved = await api(owner.context, server.origin, 'state')
  assertActorNames(resolved, admitted)
  assert.deepEqual(resolved.actorNames, { [salesState.me.email]: salesState.me.name })
  assertActorNames(await api(owner.context, server.origin, `variance/${resolved.scenarios.find(sc => sc.kind === 'forecast').actualsThrough}`), admitted)
  assert.deepEqual(await picture(owner.context, server.origin), before, 'Fresh native sign-in changes no durable planning data or historical attribution')
 } finally { await sales.context.close() }
 const pack = after.state.packs.find(p => p.status === 'published')
 const doc = await owner.context.request.get(`${server.origin}/api/easel/pack/${pack.id}/document.html`)
 assert.equal(doc.status(), 200)
 assert.match(await doc.text(), /Hold September conference spend/)
 await owner.context.close(); await browser.close(); browser = undefined
 await server.close(); server = undefined

 const parts = async path => (await readFile(path, 'utf8')).trim().split('\n').map(l => JSON.parse(l)).filter(r => r.kind === 'part').flatMap(r => r.items)
 assert.deepEqual(await parts(join(evidence, 'restored.rer')), await parts(archive), 'Every portable row, including the import journal and immutable snapshots, survives restore')
 await command(second, ['reset', '--yes'])
 await report(evidence, { passed: true, journeys, archive: 'export, refused nonempty and corrupt imports, restore into a clean installation, equal model/approvals/outputs and equal re-export; native identities excluded, source session refused, contextual names resolve only after fresh sign-in', root: existing ? root : 'fresh clone of committed HEAD' })
 console.log(`Easel browser and CLI proof passed; screenshots and documents: ${evidence}`)
} finally {
 await browser?.close()
 await server?.close()
 if (second) await rm(second, { recursive: true, force: true })
 if (!existing) await rm(root, { recursive: true, force: true })
}
