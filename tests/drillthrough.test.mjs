import test from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

// CONNECT-008 is a complete drill-through, rather than a sample of evidence.
test('CONNECT-008 every accepted row behind a cell is available through the public variance door with inherited department filtering', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Services', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const engineering = await h.command('department', { name: 'Engineering' })
 const revenue = await h.command('line', { name: 'Services', type: 'revenue' })
 const contributor = await h.person('sales@example.test', 'contributor', [sales.id])
 const board = await h.person('board@example.test', 'viewer')
 await h.command('account-rule', { match: 'range', from: '4000', to: '4999', target: revenue.id })
 await h.command('department-map', { source: 'Sales', department: sales.id })
 await h.command('department-map', { source: 'Engineering', department: engineering.id })
 const body = { filename: 'january-invoices.csv', csv: 'Date,Account,Department,Amount,Description,Reference\n' + Array.from({ length: 210 }, (_, i) => `2026-01-15,${4000 + i},Sales,-10,Consulting invoice ${i+1},INV-${i+1}`).join('\n') + '\n2026-01-15,4999,Engineering,-20,Restricted engineering retainer,ENG-PRIVATE\n', columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount', description: 'Description', reference: 'Reference' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' }
 const preview = await h.kit('actuals', 'preview', body)
 let accepted = await h.kit('actuals', 'commit', { ...body, fingerprint: preview.fingerprint })
 while (accepted.batch.status === 'importing') accepted = await h.kit('actuals', 'resume', { id: accepted.batch.id })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: budget.revision })
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 const finance = await h.get('/api/easel/variance/2026-01')
 const salesRow = finance.rows.find(r => r.department === sales.id)
 assert.equal(salesRow.actual, 210000)
 assert.equal(salesRow.citations.length, 210)
 assert.equal(salesRow.citations.reduce((sum, row) => sum + row.amount, 0), salesRow.actual)
 for (let i = 1; i <= 210; i++) {
  const row = salesRow.citations.find(c => c.reference === `INV-${i}`)
  assert.deepEqual([row.file, row.line, row.date, row.description, row.amount], ['january-invoices.csv', i+1, '2026-01-15', `Consulting invoice ${i}`, 1000])
 }
 const own = await h.get('/api/easel/variance/2026-01', contributor)
 assert.deepEqual(own.rows.find(r => r.department === sales.id).citations, salesRow.citations)
 const other = own.rows.find(r => r.department === engineering.id)
 assert.equal(other.actual, 2000); assert.deepEqual(other.citations, [])
 assert.doesNotMatch(JSON.stringify(own), /ENG-PRIVATE|Restricted engineering retainer/)
 const viewer = await h.get('/api/easel/variance/2026-01', board)
 assert.deepEqual(viewer.rows.map(r => [r.department,r.actual]), finance.rows.map(r => [r.department,r.actual]))
 assert.ok(viewer.rows.every(r => r.citations.length === 0))
 assert.doesNotMatch(JSON.stringify(viewer), /INV-210|ENG-PRIVATE|Consulting invoice 210|Restricted engineering retainer/)
})
