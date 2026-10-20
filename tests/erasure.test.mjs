import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
const name='Morgan Ellis',email='morgan@example.test'
const absent=value=>{ const text=typeof value==='string'?value:JSON.stringify(value);assert.ok(!text.includes(name),'Erased name absent');assert.ok(!text.includes(email),'Erased email absent') }

test('ERASE-001 inactive contributor erasure keeps submitted amounts and immutable bytes, pseudonymizes every public read and records receipt',async t=>{
 const h=await harness();t.after(()=>h.close())
 await h.command('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const d=await h.command('department',{name:'Sales'}),line=await h.command('line',{name:'Payroll',type:'operating-expense',payroll:true})
 const person=await h.person(email,'contributor',[d.id])
 await h.command('member',{email,name,role:'contributor',departments:[d.id]})
 // The native name and model member name are independent directory values.
 const sc=(await h.get('/api/easel/state')).scenarios[0]
 await h.command('position',{scenario:sc.id,department:d.id,line:line.id,title:'Sales lead',holder:name,annualSalary:'120000',start:'2026-01'})
 await h.command('request-submissions',{scenario:sc.id,departments:[d.id]})
 await h.command('comment',{scenario:sc.id,department:d.id,text:`${name} prepared this plan`},person)
 await h.command('submit',{scenario:sc.id,department:d.id,note:`Submitted by ${name}`},person)
 const approved=await h.command('approve-budget',{scenario:sc.id,revision:(await h.get(`/api/easel/scenario/${sc.id}`)).scenario.revision})
 await h.command('account-map',{account:'5000',target:line.id});await h.command('department-map',{source:'Sales',department:d.id})
 const input={filename:'actuals.csv',csv:'Date,Account,Department,Amount\n2026-01-31,5000,Sales,10000\n',columns:{date:'Date',account:'Account',department:'Department',amount:'Amount'},amountMode:'debit-positive',dateFormat:'YYYY-MM-DD'}
 const preview=await h.kit('actuals','preview',input);await h.kit('actuals','commit',{...input,fingerprint:preview.fingerprint})
 await h.command('close-month',{scenario:approved.forecast.id,month:'2026-01'})
 const pack=await h.command('pack-create',{month:'2026-01'})
 await h.command('pack-decision',{pack:pack.id,text:`${name} submitted the hiring plan`,owner:email})
 await h.command('pack-publish',{pack:pack.id})
 const before=(await h.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results
 await h.command('person-erase',{email},h.owner,409)
 await h.command('member',{email,name,role:'contributor',departments:[d.id],active:false})
 const viewer=await h.person('viewer@example.test','viewer')
 await h.command('person-erase',{email},viewer,403)
 await h.command('person-erase',{email:'owner@example.test'},h.owner,409)
 const receipt=await h.command('person-erase',{email})
 assert.ok(receipt.counts.records>0);assert.ok(receipt.at);assert.match(receipt.pseudonym,/^Erased person /)
 assert.deepEqual((await h.db.prepare('SELECT id,body,sha256 FROM e_snapshots ORDER BY id').all()).results,before)
 const state=await h.get('/api/easel/state');absent(state)
 assert.equal(state.submissions[0].submittedBy,receipt.pseudonym)
 assert.equal(state.comments[0].author,receipt.pseudonym)
 for(const path of [`/api/easel/scenario/${sc.id}`,`/api/easel/scenario/${approved.forecast.id}`,'/api/easel/variance/2026-01','/api/easel/activity','/api/easel/activity.csv'])absent(await h.get(path))
 for(const sn of before) {const view=await h.get(`/api/easel/snapshot/${sn.id}`);absent(view);assert.equal(view.sha256,sn.sha256)}
 for(const ext of ['html','csv'])absent(await h.get(`/api/easel/pack/${pack.id}/document.${ext}`))
 const trail=await h.get('/api/easel/activity');assert.ok(trail.some(row=>row.action==='person-erase'&&row.detail.receiptId===receipt.receiptId))
 assert.equal((await h.send('/api/easel/state',undefined,person)).status,401)
 const response=await h.mf.dispatchFetch(h.origin+'/api/easel/export',{headers:{cookie:h.owner}});assert.equal(response.status,200)
 const archive=await JSZip.loadAsync(await response.arrayBuffer())
 for(const f of Object.values(archive.files).filter(f=>!f.dir)) {
  if(f.name.endsWith('.xlsx')) {const nested=await JSZip.loadAsync(await f.async('uint8array'));for(const entry of Object.values(nested.files).filter(e=>!e.dir))absent(await entry.async('string'))}
  else absent(await f.async('string'))
 }
 const manifest=JSON.parse(await archive.file('manifest.json').async('string'));assert.ok(manifest.transforms[0].receiptIds.includes(receipt.receiptId))
 const key=(await h.db.prepare('SELECT value FROM e_erasure_key').first()).value
 assert.ok(!JSON.stringify(state).includes(key))
})
