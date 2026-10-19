import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import JSZip from 'jszip'
import { proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'

export async function openExportBrowserJourney(page, evidence, width) {
 await page.getByRole('button', { name: 'Settings', exact: true }).click()
 const pending = page.waitForEvent('download')
 await page.getByRole('link', { name: 'Download open export (ZIP)', exact: true }).click()
 const download = await pending
 assert.equal(await download.failure(), null)
 const archive = await JSZip.loadAsync(await readFile(await download.path()), { checkCRC32: true })
 const manifest = JSON.parse(await archive.file('manifest.json').async('string'))
 for (const entry of manifest.files) {
  const bytes = await archive.file(entry.path).async('uint8array')
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
  if (entry.path.endsWith('.xlsx')) proveFormulas(await readWorkbook(bytes))
 }
 assert.ok(await archive.file('model.json').async('string'))
 assert.ok(manifest.inventory.snapshots > 0)
 assert.ok(manifest.inventory.retainedOriginals > 0)
 assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
 await page.screenshot({ path: join(evidence, `open-export-${width}.png`), fullPage: false })
 console.log(`PORT-001 browser open export and digests passed at ${width}`)
}
