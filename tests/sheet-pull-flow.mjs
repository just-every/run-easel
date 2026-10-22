import assert from 'node:assert/strict'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { easelPolicy } from '../scripts/installer/easel-policy.mjs'
import { harness } from './harness.mjs'

export async function proveSheetPull(t) {
 let now='2026-01-10T12:10:00.000Z', values=[100,200], columns=3, missing=false, revokeStatus=200, unreachable=false, reads=0, revokes=0
 const credentials={clientId:'synthetic-easel-1',clientSecret:'synthetic-easel-2',refreshToken:'synthetic-easel-3'}, accessToken='synthetic-easel-4'
 const google=async request=>{
  const url=new URL(request.url)
  assert.equal(url.protocol,'https:')
  if(url.hostname==='oauth2.googleapis.com') {
   assert.equal(request.method,'POST')
   if(url.pathname==='/revoke') {
    revokes++;assert.equal((await request.formData()).get('token'),credentials.refreshToken)
    return new Response(revokeStatus===200?'':JSON.stringify({private:credentials.refreshToken}),{status:revokeStatus,...(revokeStatus===302?{headers:{location:'https://must-not-follow.example'}}:{})})
   }
   if(url.pathname==='/tokeninfo') {assert.equal(request.headers.get('authorization'),`Bearer ${accessToken}`);return Response.json({aud:credentials.clientId,scope:'https://www.googleapis.com/auth/spreadsheets.readonly'})}
   assert.equal(url.pathname,'/token');const form=await request.formData();assert.equal(form.get('refresh_token'),credentials.refreshToken);assert.equal(form.get('client_secret'),credentials.clientSecret)
   return Response.json({access_token:accessToken,token_type:'Bearer',expires_in:3600})
  }
  assert.equal(url.hostname,'sheets.googleapis.com');assert.equal(request.headers.get('authorization'),`Bearer ${accessToken}`);reads++
  if(missing)return Response.json({private:credentials.refreshToken},{status:404})
  return Response.json({spreadsheetId:'synthetic-easel-5',sheets:[{properties:{sheetId:0,title:'Capacity',sheetType:'GRID',gridProperties:{rowCount:10,columnCount:columns}},data:[{startRow:1,startColumn:1,rowData:[{values:values.map(numberValue=>({effectiveValue:{numberValue}}))}]}]}]})
 }
 const h=await harness({now:()=>now,outbound:{node:async(req,res)=>{
  const path=new URL(req.url,'https://oauth2.googleapis.com').pathname
  const chunks=[];for await(const chunk of req)chunks.push(chunk)
  const request=new Request(`https://${path.startsWith('/v4/')?'sheets.googleapis.com':'oauth2.googleapis.com'}${req.url}`,{method:req.method,headers:{...(req.headers.authorization?{authorization:req.headers.authorization}:{}),...(req.headers['content-type']?{'content-type':req.headers['content-type']}: {})},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})})
  if(unreachable&&path==='/revoke'){revokes++;assert.equal((await request.formData()).get('token'),credentials.refreshToken);res.destroy();return}
  const response=await google(request)
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
 }}});t.after(()=>h.close())
 await h.command('workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await h.command('department',{name:'Sales'}),line=await h.command('line',{name:'Capacity',type:'operating-expense'})
 const scenario=(await h.get('/api/easel/state')).scenarios[0]
 const schedule=await h.command('schedule',{scenario:scenario.id,name:'Sales capacity',department:department.id,line:line.id,values:{'2026-02':'100','2026-03':'200'}})
 const viewer=await h.person('board@example.test','viewer'), contributor=await h.person('sales@example.test','contributor',[department.id])
 const post=async(path,body,cookie=h.owner,status=200)=>{const r=await h.send(`/api/easel/${path}`,body,cookie);assert.equal(r.status,status,r.text);return r.value}
 for(const cookie of [viewer,contributor])await post('connections/sheets/connect',credentials,cookie,403)
 await post('connections/sheets/connect',credentials)
 const status=await h.get('/api/easel/connections/sheets');assert.equal(status.connected,true)
 for(const secret of Object.values(credentials))assert.ok(!JSON.stringify(status).includes(secret))
 const sealed=(await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='sheets'").first()).sealed
 for(const secret of Object.values(credentials))assert.ok(!sealed.includes(secret))
 const archive=await createPortability({db:h.db,policy:easelPolicy}), archiveId=await archive.exports.create()
 try {while((await archive.exports.advance(archiveId,{maxParts:16})).phase==='building'){};const contents=await new Response(await archive.exports.download(archiveId)).text();assert.ok(!contents.includes(sealed));for(const secret of Object.values(credentials))assert.ok(!contents.includes(secret));assert.ok(!JSON.parse(contents.trim().split('\n')[0]).tables.some(t=>t.name==='e_connection_secrets'))}finally{await archive.exports.abort(archiveId)}
 await h.stepUp();const issued=await post('tokens/issue',{label:'Finance automation',kind:'service',scope:'write'})
 for(const path of ['connections/sheets','sheet-links']){const r=await h.mf.dispatchFetch(h.origin+'/api/easel/'+path,{headers:{authorization:`Bearer ${issued.token}`}});assert.equal(r.status,403)}
 const config={name:'Sales capacity sheet',scenario:scenario.id,spreadsheetId:'synthetic-easel-5',range:'Capacity!B2:C2',cadence:'hourly',mappings:[{source:'B2',schedule:schedule.id,month:'2026-02'},{source:'C2',schedule:schedule.id,month:'2026-03'}]}
 const original=await h.get(`/api/easel/scenario/${scenario.id}`), activityBefore=await h.get('/api/easel/activity')
 const preview=await post('sheet-links/preview',config)
 assert.deepEqual(await h.get('/api/easel/activity'),activityBefore);assert.deepEqual(await h.get(`/api/easel/scenario/${scenario.id}`),original)
 await post('sheet-links/save',{...config,digest:'synthetic-easel-6'},h.owner,409)
 let link=await post('sheet-links/save',{...config,digest:preview.digest})
 assert.equal(link.enabled,true)
 const run=async at=>{now=at;await(await h.mf.getWorker()).scheduled({cron:'*/15 * * * *'});return (await h.get('/api/easel/sheet-links')).links.find(l=>l.id===link.id)}
 values=[125.25,235.75]
 link=await run('2026-01-10T13:01:00.000Z')
 assert.equal(link.lastProposal.cells.length,2);assert.deepEqual(link.lastProposal.cells.map(c=>c.afterCents),[12525,23575])
 const proposal=await h.get(`/api/easel/scenario/${link.lastProposal.id}`)
 assert.equal(proposal.scenario.proposalStatus,'submitted');assert.deepEqual(proposal.inputs.schedule[0].values,{'2026-02':12525,'2026-03':23575})
 assert.deepEqual(await h.get(`/api/easel/scenario/${scenario.id}`),original,'Scheduled source changes create a separate proposal and leave target unchanged')
 const count=async()=>Number((await h.db.prepare("SELECT COUNT(*) AS n FROM e_records WHERE kind='scenario' AND json_extract(value,'$.kind')='proposal'").first()).n)
 assert.equal(await count(),1);await run(now);assert.equal(await count(),1);link=await run('2026-01-10T14:01:00.000Z');assert.equal(await count(),1)
 const baseline=link.baseline, proposalBefore=await h.get(`/api/easel/scenario/${link.lastProposal.id}`)
 columns=2;values=[999,888]
 link=await run('2026-01-10T15:01:00.000Z');assert.match(link.error,/shape/i);assert.equal(await count(),1);assert.deepEqual(link.baseline,baseline);assert.deepEqual(await h.get(`/api/easel/scenario/${scenario.id}`),original);assert.deepEqual(await h.get(`/api/easel/scenario/${link.lastProposal.id}`),proposalBefore)
 columns=3;missing=true;link=await run('2026-01-10T16:01:00.000Z');assert.match(link.error,/HTTP 404/);assert.deepEqual(link.baseline,baseline);assert.equal(await count(),1);missing=false
 await h.command('proposal-promote',{id:proposal.scenario.id,revision:proposal.scenario.revision})
 assert.deepEqual((await h.get(`/api/easel/scenario/${scenario.id}`)).inputs.schedule[0].values,{'2026-02':12525,'2026-03':23575})
 const beforeDisconnectReads=reads
 for(const code of [200,503,302]) {
  revokeStatus=code
  const disconnected=await post('connections/sheets/disconnect',{})
  assert.equal(disconnected.connected,false);assert.equal(disconnected.providerRevocation.status,code===200?'confirmed':'not-confirmed');assert.equal(disconnected.providerRevocation.httpStatus,code)
  assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM e_connection_secrets WHERE id='sheets'").first()).n,0)
  for(const secret of [...Object.values(credentials),accessToken])assert.ok(!JSON.stringify(disconnected).includes(secret))
  if(code!==200)assert.match(disconnected.error,/Google Account/)
  await post('connections/sheets/connect',credentials)
 }
 unreachable=true;const disconnected=await post('connections/sheets/disconnect',{});assert.equal(disconnected.providerRevocation.status,'not-confirmed');assert.equal(disconnected.providerRevocation.httpStatus,null)
 const after=await run('2026-01-10T17:01:00.000Z');assert.equal(after.enabled,false);assert.equal(reads,beforeDisconnectReads);assert.equal(revokes,4)
 const audit=await h.get('/api/easel/activity');assert.ok(audit.some(e=>e.action==='sheets-connected'));assert.ok(audit.some(e=>e.action==='sheet-link-proposed'));assert.ok(audit.some(e=>e.action==='sheet-link-failed'))
 for(const secret of [...Object.values(credentials),accessToken])assert.ok(!JSON.stringify(audit).includes(secret))
}
