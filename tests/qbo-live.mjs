// Opt-in Intuit sandbox qualification through native Easel HTTP doors.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harness } from './harness.mjs'

const names=['QBO_CLIENT_ID','QBO_CLIENT_SECRET','QBO_REFRESH_TOKEN','QBO_REALM_ID']
for(const name of names)assert.ok(process.env[name],`Inject ${name} through the held-key loader`)
const ingest=process.env.EASEL_QBO_ROTATION_INGEST
assert.ok(ingest,'Set EASEL_QBO_ROTATION_INGEST to the authorized refresh-token ingestion command before exchanging a grant')
const started=new Date(),to=new Date(Date.UTC(started.getUTCFullYear(),started.getUTCMonth()-1,1)).toISOString().slice(0,7)
const period=process.env.EASEL_QBO_LIVE_MONTH??to
const dir=await mkdtemp(join(tmpdir(),'easel-intuit-rotation-'))
let rotations=0,accountingReads=0
const outbound=async request=>{
 const u=new URL(request.url)
 assert.ok(['https://oauth.platform.intuit.com','https://sandbox-quickbooks.api.intuit.com'].includes(u.origin),'Only held Intuit sandbox read and OAuth endpoints are allowed')
 if(u.origin==='https://sandbox-quickbooks.api.intuit.com'){assert.equal(request.method,'GET');accountingReads++}
 const headers=Object.fromEntries(['authorization','content-type','accept'].filter(name=>request.headers.has(name)).map(name=>[name,request.headers.get(name)]))
 let response
 try{response=await fetch(u,{method:request.method,headers,body:request.method==='GET'?undefined:await request.arrayBuffer(),redirect:'manual'})}
 catch(error){console.log(JSON.stringify({networkEdgeFailure:error.name,code:error.cause?.code??null}));return new Response(null,{status:502})}
 if(u.origin==='https://oauth.platform.intuit.com'&&response.ok){
  const value=await response.clone().json()
  if(typeof value.refresh_token==='string'){
   const file=join(dir,'rotated.env')
   await writeFile(file,`QBO_REFRESH_TOKEN=${value.refresh_token}\n`,{mode:0o600})
   execFileSync('python3',['-I',ingest,file],{stdio:['ignore','pipe','pipe']})
   rotations++
  }
 }
 if(u.pathname.includes('/reports/')&&response.ok){
  const report=await response.clone().json()
  console.log(JSON.stringify({report:report.Header?.ReportName,start:report.Header?.StartPeriod,end:report.Header?.EndPeriod,basis:report.Header?.ReportBasis,columns:report.Columns?.Column?.map(c=>({type:c.ColType,title:c.ColTitle})),topLevelRows:report.Rows?.Row?.length??0}))
 }
 return response
}
let h
try{
 h=await harness({outbound,now:()=>started.toISOString()})
 await h.command('workspace',{name:'Intuit sandbox qualification',currency:'USD',fiscalYearStart:Number(period.slice(5)),planStart:period})
 const r=await h.send('/api/easel/connections/qbo/connect',{environment:'sandbox',realmId:process.env.QBO_REALM_ID,clientId:process.env.QBO_CLIENT_ID,clientSecret:process.env.QBO_CLIENT_SECRET,refreshToken:process.env.QBO_REFRESH_TOKEN,consent:true},h.owner)
 assert.equal(r.status,200,r.text)
 assert.equal(r.value.connected,true)
 const preview=await h.kit('qbo','preview',{month:period,includeOpening:true})
 assert.equal(preview.source.trialBalance.balanced,true)
 assert.equal(preview.source.unsupportedTransactions.length,0,'Every live sandbox posting has a supported source transaction destination')
 console.log(JSON.stringify({journey:'QuickBooks native existing OAuth grant and monthly source preview',at:started.toISOString(),period,connected:true,encrypted:!(await h.db.prepare("SELECT sealed FROM e_connection_secrets WHERE id='qbo'").first()).sealed.includes(process.env.QBO_REFRESH_TOKEN),rows:preview.source.ledgerRows,changedRows:preview.changedRows,nonPostingObservations:preview.source.nonPostingRows.length,trialBalanced:true,rotationsStoredImmediately:rotations,accountingReads,accountingWrites:0}))
}finally{await h?.close();await rm(dir,{recursive:true,force:true})}
