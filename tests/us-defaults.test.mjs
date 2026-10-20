import assert from 'node:assert/strict'
import test from 'node:test'
import { harness } from './harness.mjs'

test('US-001: new-company US defaults, fiscal overrides and choice-free US CSV imports persist through public doors', async t => {
 const h = await harness(); t.after(() => h.close())
 const w = await h.command('workspace', {name:'Ridgeline Advisory', planStart:'2026-01'})
 assert.equal(w.currency,'USD'); assert.equal(w.fiscalYearStart,1)
 assert.equal(w.locale,'en-US'); assert.equal(w.dateFormat,'MM/DD/YYYY'); assert.equal(w.timeZone,'America/New_York')
 const dept = await h.command('department',{name:'Advisory'})
 const line = await h.command('line',{name:'Retainers',type:'revenue'})
 await h.command('account-map',{account:'4000',target:line.id})
 await h.command('department-map',{source:'Advisory',department:dept.id})
 const body = {filename:'US-ledger.csv',csv:'Date,Account,Department,Amount\n01/31/2026,4000,Advisory,"($1,234.56)"\n02/28/2026,4000,Advisory,-$500.00\n'}
 const before = await h.get('/api/easel/actuals')
 const preview = await h.kit('actuals','preview',body)
 assert.equal(preview.accepted,2); assert.equal(preview.rejected.length,0)
 assert.equal(preview.net,-173456)
 assert.deepEqual((await h.get('/api/easel/actuals')),before,'Preview writes no actual rows')
 const accepted = await h.kit('actuals','commit',{...body,fingerprint:preview.fingerprint,acknowledgeRejected:0})
 assert.equal(accepted.batch.status,'accepted')
 const reconciliation = await h.get('/api/easel/actuals')
 assert.deepEqual(reconciliation.months.map(m=>[m.period,m.revenue]),[['2026-01',123456],['2026-02',50000]])
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('revenue',{scenario:budget.id,name:'Retainer',kind:'volume',line:line.id,department:dept.id,start:'2026-01',startVolume:'1',rate:'1234.56'})
 const view=await h.get(`/api/easel/scenario/${budget.id}`)
 assert.equal(view.calculation.profit[0].revenue,123456)
 assert.ok(view.calculation.cells[0].sources[0].trace.includes('$1,234.56'))
 const saved = await h.command('workspace',{name:'Ridgeline renamed',planStart:'2026-01',timeZone:'America/Los_Angeles',locale:'en-GB',dateFormat:'DD/MM/YYYY'})
 assert.equal(saved.timeZone,'America/Los_Angeles');assert.equal(saved.locale,'en-GB');assert.equal(saved.dateFormat,'DD/MM/YYYY');assert.equal(saved.currency,'USD')
 await h.command('workspace',{name:'Bad zone',planStart:'2026-01',timeZone:'Not/AZone'},h.owner,400)
 const alternate = await harness();t.after(()=>alternate.close())
 const other=await alternate.command('workspace',{name:'July company',currency:'CAD',fiscalYearStart:7,planStart:'2026-07',timeZone:'America/Chicago'})
 assert.equal(other.fiscalYearStart,7);assert.equal(other.currency,'CAD')
})
