// MOVE-004: finance actually uploads, previews, saves, classifies and signs
// the parallel month through the product at both desktop and phone widths.
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { seedParallelMonth } from './parallel-month-fixture.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-parallel-month')
await mkdir(evidence, { recursive: true })
let server, browser
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const owner = await session(browser, root, server.origin, 'owner', 1440)
 const call = (path, body) => api(owner.context, server.origin, path, body)
 const fixture = await seedParallelMonth((op, body) => call(`command/${op}`, body), p => call(p), (op, body) => call(`import/actuals/${op}`, body))
 await call('command/member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 await owner.context.close()
 for (const width of [1440, 390]) {
  const reader = await session(browser, root, server.origin, 'owner', width), page = reader.page
  try {
   const review = () => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click()
   await review()
   const section = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Parallel month', exact: true }) })
   await section.getByLabel('Parallel month comparison', { exact: true }).selectOption('')
   const name = `January parallel run ${width}`
   await section.getByLabel('Comparison name', { exact: true }).fill(name)
   await section.getByLabel('Old-tool CSV file', { exact: true }).setInputFiles({ name: fixture.body.filename, mimeType: 'text/csv', buffer: Buffer.from(fixture.body.csv) })
   await section.getByText(fixture.body.filename, { exact: true }).waitFor()
   await noOverflow(page, `MOVE-004 upload ${width}`)
   await section.screenshot({ path: join(evidence, `parallel-upload-${width}.png`) })
   const [download] = await Promise.all([page.waitForEvent('download'), section.getByRole('link', { name: 'Download old-tool comparison template (CSV)' }).click()])
   assert.equal(await download.failure(), null)
   await section.getByRole('button', { name: 'Preview parallel month', exact: true }).click()
   await section.getByRole('heading', { name: `Preview: ${name}`, exact: true }).waitFor()
   const diffTable = section.getByRole('table', { name: 'Parallel month differences', exact: true })
   assert.equal(await diffTable.getByRole('row').count(), 3)
   await noOverflow(page, `MOVE-004 preview ${width}`)
   await section.screenshot({ path: join(evidence, `parallel-preview-${width}.png`) })
   await section.getByRole('button', { name: 'Save this exact comparison', exact: true }).click()
   await section.getByRole('heading', { name: `${name} · draft`, exact: true }).waitFor()
   for (const [line, measure, kind, explanation] of [['Services', 'actual', 'mapping', 'Ledger adjustment maps to Services in the old tool.'], ['Delivery costs', 'budget', 'formula', 'Old spreadsheet cell C12 adds ten dollars.']]) {
    const detail = section.locator('details').filter({ has: page.locator('summary', { hasText: `${line} · Consulting · ${measure}` }) })
    await detail.getByLabel(`Classification for ${line} · Consulting · ${measure}`, { exact: true }).selectOption(kind)
    await detail.getByLabel(`Explanation for ${line} · Consulting · ${measure}`, { exact: true }).fill(explanation)
    await detail.getByRole('button', { name: 'Save classification', exact: true }).click()
    await diffTable.getByRole('cell', { name: explanation, exact: true }).waitFor()
   }
   await noOverflow(page, `MOVE-004 classified ${width}`)
   await section.screenshot({ path: join(evidence, `parallel-classified-${width}.png`) })
   await section.getByRole('button', { name: 'Sign off this exact comparison', exact: true }).click()
   await section.getByRole('heading', { name: `${name} · signed`, exact: true }).waitFor()
   const list = await api(reader.context, server.origin, 'parallel-month'), summary = list.find(v => v.name === name)
   const signed = await api(reader.context, server.origin, `parallel-month/${summary.id}`)
   assert.equal(signed.status, 'signed'); assert.ok(signed.signedBy); assert.ok(Date.parse(signed.signedAt))
   assert.deepEqual(signed.rows.flatMap(r => r.differences).map(d => d.classification.kind).sort(), ['formula', 'mapping'])
   assert.equal(signed.rows.find(r => r.lineName === 'Services').forecast, 120000)
   await page.reload(); await review()
   await section.getByRole('heading', { name: `${name} · signed`, exact: true }).waitFor()
   assert.ok((await section.innerText()).includes(signed.sha256))
   assert.equal(await section.getByRole('button', { name: 'Save classification', exact: true }).count(), 0)
   assert.equal(await section.getByRole('button', { name: 'Sign off this exact comparison', exact: true }).count(), 0)
   await noOverflow(page, `MOVE-004 signed ${width}`)
   await section.screenshot({ path: join(evidence, `parallel-signed-${width}.png`) })
   for (const caption of ['Parallel month amounts', 'Parallel month differences']) {
    await section.getByRole('region', { name: caption, exact: true }).evaluate(el => { el.scrollLeft = el.scrollWidth })
   }
   await section.screenshot({ path: join(evidence, `parallel-signed-final-columns-${width}.png`) })
   console.log(`MOVE-004 finance ${width}: upload, preview, exact save, two classifications, signed persistence and overflow passed`)
  } catch (e) { await page.screenshot({ path: join(evidence, `parallel-failed-${width}.png`), fullPage: true }); throw e } finally { await reader.context.close() }
  const board = await session(browser, root, server.origin, 'board', width)
  try {
   await board.page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name: 'Review', exact: true }).click()
   assert.equal(await board.page.getByRole('heading', { name: 'Parallel month', exact: true }).count(), 0)
   await noOverflow(board.page, `MOVE-004 restricted board ${width}`)
  } finally { await board.context.close() }
 }
} finally {
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
