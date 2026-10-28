import { canonicalJson,sha256 } from '../modules/import-kit/src/d1/index'
import { resolveAccount } from './account-rules'
import type { Context } from './context'
import { acceptedLedgerFilter,ledgerWhere } from './ledger-scope'
import { find,requireThat,type Data } from './types'
/** Logical source identities include every accepted correction, not sampled journal rows. */
export async function entityLedger(c:Context,entity:string):Promise<Data[]>{
 const scope=ledgerWhere(entity),accepted=acceptedLedgerFilter(c.s),result=await c.db.prepare(`SELECT id,value,amount FROM e_actuals WHERE ${scope.sql} AND ${accepted.sql} ORDER BY id`).bind(...scope.params,...accepted.params).all<{id:string;value:string;amount:number}>()
 const rows=new Map<string,Data>()
 for(const r of result.results){const v=JSON.parse(r.value);if(!v.intacctCompany)continue
  const id=JSON.stringify([v.intacctCompany,v.intacctBook,v.entity,v.intacctLine]),before=rows.get(id),target=resolveAccount(c.s,v.account,v.accountType).target
  const row=before??{id,entity,period:v.period,account:v.account,target,opening:v.intacctOpening===true,transaction:v.intacctTransactionId,amount:0,rows:[],entryUrl:v.intacctEntryUrl,dimensions:v.sourceDimensions}
  requireThat(row.account===v.account&&row.period===v.period,'Accepted entity ledger identity changed',409)
  row.amount+=r.amount;requireThat(Number.isSafeInteger(row.amount),'Entity ledger exceeds exact cents',409)
  row.rows.push({id:r.id,value:v,amount:r.amount});rows.set(id,row)
 }
 return[...rows.values()].map(row=>({...row,digest:sha256(canonicalJson(row)),name:`${row.period} · ${row.account} · ${row.transaction||'Source opening'}`,lineType:find(c.s,'line',row.target)?.type??null,line:find(c.s,'line',row.target)?.name??row.target}))
}
export function ledgerEliminationSources(rows:Data[],selection:Data,month:string,side:'from'|'to'){
 requireThat(selection&&typeof selection==='object','Choose explicit accepted ledger source selections')
 const fields=side==='from'?['charge','receivable','cash']:['charge','payable','cash'],seen=new Set<string>()
 return Object.fromEntries(fields.map(field=>{
  const ids=selection[field];requireThat(Array.isArray(ids)&&ids.length<=5000&&ids.every(id=>typeof id==='string'),'Choose accepted source identities')
  const selected=ids.map(id=>{const row=rows.find(r=>r.id===id);requireThat(row&&!seen.has(id),'Ledger source is missing or repeated',409);seen.add(id)
   requireThat(field==='charge'||field==='cash'?row.period===month&&!row.opening:row.period<=month,'Ledger source period is outside the reviewed elimination',409)
   requireThat(field==='receivable'?row.target==='bs:receivables':field==='payable'?row.target==='bs:payables':field==='cash'?row.target==='cash':row.target&&!String(row.target).startsWith('bs:')&&row.target!=='cash'&&row.target!=='excluded','Ledger source mapping is not appropriate for this elimination',409)
   return{id:row.id,digest:row.digest,amount:row.amount,target:row.target}
  });return[field,selected]
 }))
}
