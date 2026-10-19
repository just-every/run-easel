import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'
import { exportFixture } from './export-fixture.mjs'
import { evaluate, proveFormulas, readWorkbook } from './spreadsheet-proof.mjs'

test('SHEET-004 plans, comparisons, variance reports and immutable packs export live formulas with role-filtered detail', async t => {
 const h = await harness(); t.after(() => h.close())
 const f = await exportFixture(h)
 const board = await h.person('board@example.test', 'viewer')
 const sales = await h.person('sales@example.test', 'contributor', [f.sales])
 const download = async (path, cookie = h.owner, status = 200) => {
  const r = await h.mf.dispatchFetch(h.origin + '/api/easel/' + path, { headers: { cookie } })
  assert.equal(r.status, status, path)
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (status !== 200) return
  assert.match(r.headers.get('content-type'), /spreadsheetml/)
  const book = await readWorkbook(bytes); proveFormulas(book); return book
 }
 const book = await download(`scenario/${f.budget.id}/document.xlsx`)
 const view = await h.get(`/api/easel/scenario/${f.budget.id}`)
 const pnl = book.getWorksheet('Profit and loss'), profit = pnl.findRow(pnl.rowCount)
 for (let i = 0; i < view.calculation.months.length; i++) assert.equal(evaluate(pnl, profit.getCell(i + 2).address), view.calculation.profit[i].profit)
 assert.equal(evaluate(pnl, profit.getCell(2).address, new Map([['B3', 2000000]])), 2000000 - 880000 - 9999, 'Changing a source cell recalculates profit')
 assert.match(JSON.stringify(book.getWorksheet('Inputs').getSheetValues()), /Morgan Private/)
 for (const cookie of [board, sales]) {
  const filtered = await download(`scenario/${f.budget.id}/document.xlsx`, cookie)
  assert.doesNotMatch(JSON.stringify(filtered.worksheets.map(s => s.getSheetValues())), /Morgan Private|9600000|Principal engineer/)
  assert.equal(evaluate(filtered.getWorksheet('Profit and loss'), profit.getCell(2).address), view.calculation.profit[0].profit)
 }
 const scoped = await download(`scenario/${f.budget.id}/document.xlsx?department=${f.sales}`)
 assert.equal(scoped.getWorksheet('Cash'), undefined)
 assert.doesNotMatch(JSON.stringify(scoped.worksheets.map(s => s.getSheetValues())), /Morgan Private/)
 await download(`compare.xlsx?a=${f.forecast.id}&b=${f.downside.id}`)
 await download('variance/2026-01/document.xlsx', board)
 await download('actuals.xlsx')
 await download('activity.xlsx')
 await download('activity.xlsx', board, 403)
 await download('actuals.xlsx', sales, 403)
 const packBefore = await download(`pack/${f.pack.id}/document.xlsx`, board)
 await h.command('expense', { scenario: f.forecast.id, department: f.sales, line: view.lines.find(l => l.name === 'Software').id, name: 'Later change', kind: 'one-off', start: '2026-02', amount: '4000' })
 const packAfter = await download(`pack/${f.pack.id}/document.xlsx`, board)
 assert.deepEqual(packAfter.worksheets.map(s => s.getSheetValues()), packBefore.worksheets.map(s => s.getSheetValues()))
 assert.match((await h.get(`/api/easel/scenario/${f.budget.id}/document.csv`)), /amount_minor/)
 await download(`scenario/${f.budget.id}/document.xlsx`, '', 401)
 const proposal = await h.command('proposal-create', { from: f.forecast.id, name: 'Private proposal', request: 'Review hiring' }, sales)
 await download(`scenario/${proposal.id}/document.xlsx`, board, 404)
})
