import { canonicalJson,sha256 } from '../modules/import-kit/src/d1/index'
import { resolveAccount } from './account-rules'
import type { Context } from './context'
import { resolveDimensions } from './dimension-mapping'
import { ledgerPredicate } from './ledger-scope'
import { all,find,requireThat,type Data } from './types'
/** Explicit selectable net postings, with immutable entity and source identities. */
export async function entityLedgerEvidence(c:Context,entity:Data,through:string){
 const result=await c.db.prepare(`SELECT value FROM e_actuals WHERE ${ledgerPredicate} AND period<=? ORDER BY destination,id`).bind(entity.id,through).all<{value:string}>()
 const rows=new Map<string,Data>()
 for(const item of result.results){const v=JSON.parse(item.value),id=v.netsuiteAttribution;requireThat(id&&v.currency===entity.currency,'Entity ledger provenance is incomplete',409)
  const before=rows.get(id);rows.set(id,{id,account:v.account,accountType:v.accountType,month:v.period,transaction:v.netsuiteTransactionId,sourceLine:v.netsuiteSourceLine,description:v.description,amount:(before?.amount??0)+v.amount,department:v.department,sourceDimensions:v.sourceDimensions})}
 const evidence:Data[]=[...rows.values()].filter(r=>r.amount).map(r=>{const account=resolveAccount(c.s,r.account,r.accountType),department=find(c.s,'department-map',r.department),dimensions=resolveDimensions(c.s,r.sourceDimensions);return {...r,target:account.target,blocked:!account.target||!department||dimensions.unresolved.length>0}})
 const periods=all(c.s,'netsuite-month').filter(m=>m.entity===entity.id&&m.month<=through).sort((a,b)=>a.id.localeCompare(b.id)).map(m=>({id:m.id,status:m.status,fingerprint:m.sourceDigest}))
 return {rows:evidence,fingerprint:sha256(canonicalJson({entity:entity.id,currency:entity.currency,through,periods,evidence}))}
}
export async function validateLedgerElimination(c:Context,rule:Data,from:Data,to:Data,peers:Data[]){
 const [left,right]=await Promise.all([entityLedgerEvidence(c,from,rule.month),entityLedgerEvidence(c,to,rule.month)])
 requireThat(rule.ledgerEvidence?.fromFingerprint===left.fingerprint&&rule.ledgerEvidence?.toFingerprint===right.fingerprint,'Selected entity ledger evidence changed; review the elimination again',409)
 const fields=[['fromAmount',left,rule.revenueLine,-1,true],['toAmount',right,rule.expenseLine,1,false],['receivable',left,'bs:receivables',1,true],['payable',right,'bs:payables',-1,false],['cashReceived',left,'cash',1,true],['cashPaid',right,'cash',-1,false]] as const
 for(const [field,source,target,sign,sender]of fields){
  const ids:unknown=rule.ledgerEvidence[field];requireThat(Array.isArray(ids)&&ids.every(id=>typeof id==='string')&&new Set(ids).size===ids.length,'Select distinct actual source posting evidence')
  const selected=ids.map(id=>source.rows.find(r=>r.id===id));requireThat(selected.every(r=>r&&!r.blocked&&r.target===target&&((field==='receivable'||field==='payable')||r.month===rule.month)),'Selected ledger evidence is unavailable or does not support this elimination field',409)
  const available=selected.reduce((n,r)=>n+r!.amount*sign,0)
  const others=peers.filter(p=>p.id!==rule.id&&p.month===rule.month&&p.ledgerEvidence&&(sender?p.fromEntity===from.id:p.toEntity===to.id))
  requireThat(!others.some(p=>p[field]>0&&p.ledgerEvidence[field]?.some((id:string)=>ids.includes(id))),'Selected actual evidence overlaps another elimination; split or revise that review',409)
  requireThat(rule[field]<=Math.max(available,0),'Eliminated amount exceeds selected net actual ledger evidence',409)
 }
}
