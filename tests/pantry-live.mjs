// Two independent local Workers; only mail is faked. Pantry source is supplied
// by the operator from a read-only provider snapshot, never bundled into Easel.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { harness } from './harness.mjs'
const root=process.cwd(),source=process.env.EASEL_PANTRY_SOURCE
assert.ok(source,'Supply EASEL_PANTRY_SOURCE for the real local Pantry installation')
const {harness:pantryHarness}=await import(pathToFileURL(resolve(source,'tests/api/harness.mjs')))
let pantry,easel
try {
 process.chdir(source);pantry=await pantryHarness({entry:resolve(source,'tests/api/worker.ts')});process.chdir(root)
 await pantry.command('entity.save',{legalName:'Synthetic Easel ledger',entityType:'single-member-llc',state:'NY',fiscalYearStart:1,taxMethod:'accrual',booksStart:'2026-08-01',policies:'Accrual ledger.'})
 await pantry.command('chart.start',{})
 const chart=(await pantry.view('state')).accounts,accounts=Object.fromEntries(chart.map(a=>[a.code,a.id]))
 const post=async(date,amount)=>{
  const draft=await pantry.command('journal.save-draft',{date,memo:'Synthetic Easel receipt',lines:[{accountId:accounts['1000'],debit:amount},{accountId:accounts['4000'],credit:amount}]})
  return pantry.command('journal.post',{id:draft.id,revision:draft.revision})
 }
 for(const month of ['2026-08','2026-09']){
  await post(month+'-15','100')
  let close=await pantry.command('close.tasks',{period:month})
  for(const task of close.tasks)close=await pantry.command('close.task',{id:task.id,revision:task.revision,done:true,note:'Reviewed synthetic ledger'})
  await pantry.command('period.lock',{period:month})
 }
 const current=await post('2026-10-15','100')
 const scopes=['business:read','accounts:read','periods:read','journals:read','reports:read']
 const grant=await pantry.command('integration.create',{name:'Synthetic Easel read-only',scopes})
 easel=await harness({bindings:{PANTRY_ORIGIN:pantry.origin},outbound:request=>fetch(request.url,{method:request.method,headers:{authorization:request.headers.get('authorization'),accept:'application/json'},redirect:'manual'})})
 await easel.command('workspace',{name:'Synthetic Easel',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const revenue=await easel.command('line',{name:'Services',type:'revenue'})
 await easel.command('department-map',{source:'',department:''})
 for(const a of chart)await easel.command('account-map',{account:a.code,target:a.code==='1000'?'cash':a.code==='4000'?revenue.id:'excluded'})
 const connected=await easel.send('/api/easel/connections/pantry/connect',{key:grant.token,consent:true},easel.owner)
 assert.equal(connected.status,200,connected.text)
 const range={from:'2026-08-01',to:new Date().toISOString().slice(0,10)}
 const accept=async()=>{
  const preview=await easel.kit('pantry','preview',range)
  if(!preview.unchanged){let result=await easel.kit('pantry','commit',{...range,fingerprint:preview.fingerprint,sourceFingerprint:preview.sourceFingerprint});while(result.batch.status==='importing')result=await easel.kit('actuals','resume',{id:result.batch.id});assert.equal(result.batch.status,'accepted')}
  return preview
 }
 const first=await accept()
 assert.deepEqual(first.source.periods.filter(p=>p.status==='locked').map(p=>p.id).sort(),['2026-08','2026-09'])
 assert.equal(first.changedRows,6)
 const report=await easel.get('/api/easel/actuals')
 for(const month of ['2026-08','2026-09','2026-10'])assert.equal(report.months.find(m=>m.period===month).revenue,10000)
 assert.equal((await accept()).unchanged,true)
 await pantry.command('journal.reverse',{id:current.id,date:'2026-10-16',memo:'Synthetic correction'})
 await post('2026-10-16','125')
 const changed=await accept();assert.equal(changed.changedRows,4)
 assert.equal((await easel.get('/api/easel/actuals')).months.find(m=>m.period==='2026-10').revenue,12500)
 assert.equal((await accept()).unchanged,true)
 const tb=await pantry.view('reports/trial-balance?to='+range.to+'&basis=accrual')
 assert.equal(changed.source.trialBalance.closing[accounts['1000']],tb.rows.find(r=>r.id===accounts['1000']).net)
 assert.equal(changed.source.trialBalance.closing[accounts['4000']],tb.rows.find(r=>r.id===accounts['4000']).net)
 console.log(JSON.stringify({proof:'CONNECT-004 real local Pantry and Easel',closedMonths:['2026-08','2026-09'],currentMonth:'2026-10',initialRows:first.changedRows,correctionRows:changed.changedRows,revenueAfterCorrection:12500,trialBalanceAgrees:true,unchangedRepull:true}))
}finally{process.chdir(root);await easel?.close();await pantry?.close()}
