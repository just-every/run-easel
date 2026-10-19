import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'

export async function exportBrowserJourney(page, evidence, width) {
 const take = async (name, label) => {
  const link = page.getByRole('link', { name: label, exact: true }).first()
  await link.waitFor()
  const pending = page.waitForEvent('download')
  await link.click()
  const download = await pending
  assert.equal(await download.failure(), null)
  const bytes = await readFile(await download.path())
  const book = await readWorkbook(bytes); proveFormulas(book)
  assert.ok(book.worksheets.length)
  const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
  assert.ok(size.content <= size.width + 1, `${name} has no page overflow at ${width}`)
  await page.screenshot({ path: join(evidence, `${name}-${width}.png`), fullPage: true })
 }
 await page.getByRole('button', { name: 'Overview', exact: true }).click()
 await take('xlsx-overview', 'Download Excel')
 await page.getByRole('button', { name: 'Scenarios', exact: true }).click()
 await take('xlsx-comparison', 'Download comparison (Excel)')
 await page.getByRole('button', { name: 'Review', exact: true }).click()
 await take('xlsx-variance', 'Download variances (Excel)')
 await take('xlsx-pack', 'Download pack (Excel)')
 await page.getByRole('button', { name: 'Actuals', exact: true }).click()
 await take('xlsx-reconciliation', 'Download reconciliation (Excel)')
 await page.getByRole('button', { name: 'Activity', exact: true }).click()
 await take('xlsx-activity', 'Download activity (Excel)')
 console.log(`SHEET-004 browser downloads and formulas passed at ${width}`)
}
