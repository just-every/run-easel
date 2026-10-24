import type { Bindings } from '../auth.server'
import { actualsCommand } from './actuals'
import type { Context, KitStep } from './context'
import { pantryKey } from './pantry-connection'
import { pantryDigest, readPantryLedger } from './pantry-provider'
import { workspace } from './model'
import { requireThat, type Data } from './types'

const csv=(value: unknown)=>`"${String(value??'').replaceAll('"','""')}"`
const decimal=(n:number)=>`${n<0?'-':''}${Math.floor(Math.abs(n)/100)}.${String(Math.abs(n)%100).padStart(2,'0')}`
/** Reviewed delta import: an unchanged re-pull is a no-op, and corrections never
 * duplicate the old amounts or rewrite already captured statements. */
export async function pantryImport(c: Context,env: Bindings,op:string,b:Data):Promise<KitStep|undefined> {
 const key=await pantryKey(c,env)
 requireThat(['preview','commit'].includes(op),'Use the ordinary actuals journal to resume or undo Pantry imports',404)
 const source=await readPantryLedger(key,b.from,b.to)
 requireThat(source.to<=c.now.slice(0,10),'A Pantry import cannot include future posted dates')
 requireThat(workspace(c.s).currency===source.currency,'Pantry and Easel currencies differ; no exchange rate is inferred',409)
 const old=await c.db.prepare("SELECT value FROM e_actuals WHERE json_extract(value,'$.pantryOrigin')=?").bind(key.origin).all<{value:string}>()
 const prior=new Map<string,Data>()
 for(const item of old.results){const row=JSON.parse(item.value);if(row.date<source.from||row.date>source.to)continue;const key=row.pantryLine;const earlier=prior.get(key);prior.set(key,{...row,amount:(earlier?.amount??0)+row.amount})}
 const deltas:Data[]=[],metadata:Record<number,Data>={}
 const push=(row:Data,amount:number)=>{
  if(!amount)return
  deltas.push({...row,amount});metadata[deltas.length+1]={pantryOrigin:key.origin,pantryLine:row.id,pantryEntry:row.entryId,pantryRevision:row.revision,sourceDimensions:{department:row.class_name??'',class:row.class_name??'',location:row.location_name??'',project:row.project_name??''}}
 }
 for(const row of source.rows){const before=prior.get(row.id);if(before)requireThat(before.account===row.account&&before.date===row.date&&before.department===(row.class_name||'(blank)')&&before.sourceDimensions?.location===(row.location_name??'')&&before.sourceDimensions?.project===(row.project_name??''),'Pantry changed an accepted source account, date or department; review a correcting file explicitly',409);push(row,row.amount-(before?.amount??0));prior.delete(row.id)}
 // A disappeared posted source line is a visible reversal, never a silent deletion.
 for(const before of prior.values())push({id:before.pantryLine,entryId:before.pantryEntry,revision:before.pantryRevision,date:before.date,account:before.account,accountName:before.accountName,accountType:before.accountType,class_name:before.department==='(blank)'?'':before.department,location_name:before.sourceDimensions?.location??'',project_name:before.sourceDimensions?.project??''},-before.amount)
 const digest=pantryDigest({source:source.digest,deltas,metadata})
 if(!deltas.length){requireThat(op==='preview','Pantry has no changed posted amounts to accept',409);return {result:{source:{...source,rows:undefined},sourceFingerprint:digest,changedRows:0,unchanged:true}}}
 const rows=[['Date','Account','Account name','Account type','Department','Amount','Reference'],...deltas.map(r=>[r.date,r.account,r.accountName,r.accountType,r.class_name??'',decimal(r.amount),`Pantry ${r.entryId} line ${r.id} revision ${r.revision}`])]
 const input={filename:`pantry-${source.from}-${source.to}-${digest.slice(0,12)}.csv`,csv:rows.map(r=>r.map(csv).join(',')).join('\n'),columns:{date:'Date',account:'Account',accountName:'Account name',accountType:'Account type',department:'Department',amount:'Amount',reference:'Reference'},dateFormat:'YYYY-MM-DD',amountMode:'debit-positive',fingerprint:b.fingerprint,acknowledgeRejected:0}
 if(op==='commit')requireThat(b.sourceFingerprint===digest,'Pantry changed after preview; review again',409)
 const step=await actualsCommand(c,op,input,metadata)
 requireThat(step,'Unknown actuals step',404)
 if(op==='preview')step.result={...step.result,source:{...source,rows:undefined},sourceFingerprint:digest,changedRows:deltas.length}
 return step
}
