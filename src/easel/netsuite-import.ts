import { readFence } from './store'
import type { Bindings } from '../auth.server'
import { canonicalJson } from '../modules/import-kit/src/d1/index'
import { actualsCommand } from './actuals'
import { assertSourceGuardAcceptance,completeSourceGuards,stageNetSuiteSource } from './agents/source-guard'
import type { Context,KitStep } from './context'
import { netsuiteAuthority,netsuiteKey } from './netsuite-connection'
import { netsuiteDigest,exact } from './netsuite-provider'
import { netsuiteTransactionUrl } from './netsuite-links'
import { readNetSuiteLedger,type NetSuiteRow } from './netsuite-trial'
import { finishNetSuiteMonth } from './netsuite-month'
import { addMonths } from './months'
import { all,find,get,put,requireThat,type Data } from './types'
const csv=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"'
const decimal=(n:number)=>`${n<0?'-':''}${Math.floor(Math.abs(n)/100)}.${String(Math.abs(n)%100).padStart(2,'0')}`
export async function netsuiteImport(c:Context,env:Bindings,op:string,b:Data):Promise<KitStep|undefined>{
 netsuiteAuthority(c);await readFence(c.db,c.x.actor,(c as Context&{revision:number}).revision);requireThat(['preview','stage','commit'].includes(op),'Use the actuals journal to resume or undo NetSuite imports',404)
 const key=await netsuiteKey(c,env),binding=get(c.s,'netsuite-subsidiary',b.binding,'NetSuite subsidiary binding')
 requireThat(binding.account===key.realm,'Select a binding for this NetSuite account',409)
 const source=await readNetSuiteLedger(key,binding,b.month,all(c.s,'netsuite-period'),c.now.slice(0,10))
 const unsupportedTransactions=source.rows.filter(r=>!netsuiteTransactionUrl(key.realm,r.transactionType,r.transactionId)).map(r=>({transactionId:r.transactionId,type:r.transactionType}))
 const history=all(c.s,'netsuite-month').filter(m=>m.binding===binding.id).sort((a,b)=>a.month.localeCompare(b.month)),first=history[0]?.month
 requireThat(typeof b.includeOpening==='boolean','Choose whether this is the first source month')
 requireThat(first?source.month>=first&&b.includeOpening===(source.month===first):b.includeOpening,'Include the source opening exactly once with the first imported subsidiary/book month',409)
 if(first&&source.month>first&&!history.some(m=>m.month===source.month&&m.status==='accepted'))requireThat(history.some(m=>m.month===addMonths(source.month,-1)&&m.status==='accepted'),'Import the preceding subsidiary month before this month',409)
 const desired:NetSuiteRow[]=[...source.rows]
 if(b.includeOpening)for(const a of source.chart){const amount=source.trialBalance.opening[a.id]??0;if(amount)desired.push({id:'opening:'+a.id,transactionId:'',transactionType:'Opening',date:new Date(Date.parse(source.from+'T00:00:00Z')-86400000).toISOString().slice(0,10),periodId:'',lineId:'',accountId:a.id,account:a.code,accountName:a.name,accountType:a.type,amount,department_name:'',class_name:'',location_name:'',description:'NetSuite source balance opening',reference:'',sourceDimensions:{},opening:true})}
 const old=await c.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.netsuiteAccount')=? AND json_extract(value,'$.netsuiteBook')=? AND json_extract(value,'$.netsuiteSubsidiary')=? AND json_extract(value,'$.netsuiteMonth')=?").bind(key.realm,binding.book,binding.subsidiary,source.month).all<{value:string}>()
 const attribution=(r:NetSuiteRow)=>netsuiteDigest([r.id,r.account,r.accountType,r.date,r.sourceDimensions,r.opening===true])
 const prior=new Map<string,Data>()
 for(const item of old.results){const row=JSON.parse(item.value),before=prior.get(row.netsuiteAttribution);requireThat(row.entity===binding.entity&&row.currency===binding.currency&&typeof row.netsuiteAttribution==='string','Accepted NetSuite source scope is incomplete',409);prior.set(row.netsuiteAttribution,{...row,amount:exact((before?.amount??0)+row.amount)})}
 const deltas:NetSuiteRow[]=[],metadata:Record<number,Data>={}
 const push=(row:NetSuiteRow,amount:number)=>{if(!amount)return;deltas.push({...row,amount});metadata[deltas.length+1]={entity:binding.entity,currency:binding.currency,netsuiteAccount:key.realm,netsuiteBook:binding.book,netsuiteSubsidiary:binding.subsidiary,netsuiteMonth:source.month,netsuiteLine:row.id,netsuiteAttribution:attribution(row),netsuiteOpening:row.opening===true,netsuiteTransactionId:row.transactionId,netsuiteTransactionType:row.transactionType,netsuiteAccountId:row.accountId,netsuitePeriodId:row.periodId,netsuiteSourceLine:row.lineId,netsuitePeriodOverride:row.opening?addMonths(source.month,-1):source.month,sourceDimensions:row.sourceDimensions}}
 for(const row of desired){const id=attribution(row),before=prior.get(id);push(row,exact(row.amount-(before?.amount??0)));prior.delete(id)}
 for(const row of prior.values())push({id:row.netsuiteLine,transactionId:row.netsuiteTransactionId,transactionType:row.netsuiteTransactionType,date:row.date,periodId:row.netsuitePeriodId,lineId:row.netsuiteSourceLine,accountId:row.netsuiteAccountId,account:row.account,accountName:row.accountName,accountType:row.accountType,amount:0,department_name:row.department==='(blank)'?'':row.department,class_name:row.sourceDimensions?.class??'',location_name:row.sourceDimensions?.location??'',description:row.description,reference:row.reference,sourceDimensions:row.sourceDimensions,opening:row.netsuiteOpening},exact(-row.amount))
 const sourceFingerprint=netsuiteDigest({source:source.digest,binding,deltas,metadata}),changedTransactions=new Set(deltas.filter(r=>!r.opening).map(r=>r.transactionId)).size
 const priorInventory=find(c.s,'connection','netsuite')?.inventory
 const changes=Object.fromEntries(['accounts','departments','classes','locations'].map(kind=>[kind,source.inventory[kind].flatMap((r:Data)=>{const before=priorInventory?.[kind]?.find((v:Data)=>v.id===r.id);return canonicalJson(before??null)===canonicalJson(r)?[]:[{...r,change:before?'changed':'new'}]})]))
 const summary={month:source.month,from:source.from,to:source.to,currency:source.currency,entity:binding.entity,subsidiary:binding.subsidiary,book:binding.book,periods:source.periods,chart:source.chart,dimensions:source.dimensions,trialBalance:source.trialBalance,ledgerRows:source.rows.length,openingIncluded:b.includeOpening,unsupportedTransactions,changes}
 const sourceRecord={id:[binding.id,source.month].join(':'),binding:binding.id,account:key.realm,book:binding.book,subsidiary:binding.subsidiary,entity:binding.entity,currency:binding.currency,month:source.month,through:source.to,sourceFingerprint,sourceDigest:source.digest,trialBalance:source.trialBalance,ledgerRows:source.rows.length,changedRows:deltas.length,openingIncluded:b.includeOpening,inventory:source.inventory}
 const rows=[['Date','Account','Account name','Account type','Department','Amount','Description','Reference'],...deltas.map(r=>[r.date,r.account,r.accountName,r.accountType,r.department_name,decimal(r.amount),r.description,r.opening?'NetSuite source balance':`NetSuite ${r.transactionType} ${r.transactionId} ${r.reference}`])]
 const input={filename:`netsuite-${netsuiteDigest(binding).slice(0,12)}-${source.month}-${sourceFingerprint.slice(0,12)}.csv`,csv:rows.map(r=>r.map(csv).join(',')).join('\n'),columns:{date:'Date',account:'Account',accountName:'Account name',accountType:'Account type',department:'Department',amount:'Amount',description:'Description',reference:'Reference'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive',fingerprint:b.fingerprint,acknowledgeRejected:0}
 const preview=deltas.length?(await actualsCommand(c,'preview',input,metadata))!.result:{accounts:[],departments:[],dimensionExceptions:[],periods:[{period:source.month}],sha256:source.digest,fingerprint:sourceFingerprint}
 if(op==='stage'){
  requireThat(b.sourceFingerprint===sourceFingerprint,'NetSuite changed after preview; review again',409)
  const guard=stageNetSuiteSource(c,{source:'netsuite:'+sourceRecord.id,label:`NetSuite ${binding.name} ${source.month}`,entity:binding.entity,scenario:find(c.s,'entity',binding.entity)?.forecast??binding.scenario,month:source.month,sha256:preview.sha256,previewFingerprint:preview.fingerprint,metadata:{headers:Object.keys(source.inventory),accounts:source.chart.map(a=>({account:a.code,name:a.name,types:[a.type]})),dimensions:Object.values(source.dimensions).flat()},preview,sourceDigest:source.digest})
  return {result:{...preview,source:summary,sourceFingerprint,changedRows:deltas.length,changedTransactions,guard}}
 }
 if(op==='commit'){
  requireThat(source.trialBalance.balanced&&!unsupportedTransactions.length,'Reconcile the source trial and supported transaction destinations before acceptance',409)
  requireThat(b.sourceFingerprint===sourceFingerprint,'NetSuite changed after preview; review again',409)
  const guard=find(c.s,'source-guard','netsuite:'+sourceRecord.id);requireThat(guard?.sourceDigest===source.digest&&guard.previewFingerprint===preview.fingerprint,'Stage this exact reviewed NetSuite source before accepting',409)
  assertSourceGuardAcceptance(c,preview.sha256,[source.month],binding.entity)
 }
 if(!deltas.length){if(op==='commit'){finishNetSuiteMonth(c,{netsuiteSource:sourceRecord});completeSourceGuards(c,{sha256:preview.sha256,entity:binding.entity,netsuiteSource:{entity:binding.entity}})}return {result:{...preview,source:summary,sourceFingerprint,changedRows:0,changedTransactions:0,unchanged:true,accepted:op==='commit'}}}
 if(op==='preview')return {result:{...preview,source:summary,sourceFingerprint,changedRows:deltas.length,changedTransactions}}
 const step=await actualsCommand(c,'commit',input,metadata);requireThat(step,'Unknown actuals step',404)
 const batch=all(c.s,'batch').find(row=>row.file===input.filename&&row.status==='importing');requireThat(batch,'NetSuite journal batch was not created',409);put(c.s,'batch',batch.id,{...batch,entity:binding.entity,netsuiteSource:sourceRecord})
 return step
}
