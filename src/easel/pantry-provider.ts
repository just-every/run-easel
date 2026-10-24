import type { Bindings } from '../auth.server'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { Fault, requireThat, type Data } from './types'

export const PANTRY_PURPOSE = 'easel:pantry:read:v1'
export const PANTRY_SCOPES = ['business:read', 'accounts:read', 'periods:read', 'journals:read', 'reports:read']
export type PantryKey = { origin: string; token: string }
export function pantryOrigin(env: Bindings) {
 let url: URL
 try { url = new URL(env.PANTRY_ORIGIN ?? '') } catch { throw new Fault(503, 'Configure PANTRY_ORIGIN before connecting Pantry') }
 requireThat(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && (url.protocol === 'https:' || env.AUTH_LOCAL === 'true' && url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)), 'PANTRY_ORIGIN must be an HTTPS origin; local development also permits HTTP loopback',503)
 return url.origin
}
export function pantryDate(value: unknown) {
 requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value, 'Pantry returned an invalid date',502)
 return value
}
export function pantryId(value: unknown): string {
 requireThat(typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value),'Pantry returned an invalid record ID',502)
 return value
}
export function pantryCents(value: unknown): number {
 requireThat(typeof value === 'number' && Number.isSafeInteger(value),'Pantry returned missing or inexact cents',502)
 return value
}
export async function pantryRequest(key: PantryKey, path: string, query: Record<string,string> = {}) {
 const url = new URL(`/api/pantry/integration/v1/${path}`,key.origin)
 for (const [name,value] of Object.entries(query)) url.searchParams.set(name,value)
 let response: Response
 try { response = await fetch(url,{headers:{Authorization:`Bearer ${key.token}`,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(10000)}) }
 catch { throw new Fault(502,'Pantry could not be reached; no data was accepted') }
 if (response.status !== 200) {
  await response.body?.cancel()
  throw new Fault(502,`Pantry refused the read (HTTP ${response.status}); check its read scopes${response.status === 429 ? ' and try explicitly after the rate limit resets' : ''}`)
 }
 // Read incrementally: a response cannot allocate an unbounded provider body.
 const reader=response.body?.getReader(); requireThat(reader,'Pantry returned an empty response',502)
 const chunks: Uint8Array[]=[];let size=0
 for (;;) { const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4000000){await reader.cancel();throw new Fault(502,'Pantry response exceeds the manual read limit')}chunks.push(part.value) }
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
 let value: Data
 try { value=JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new Fault(502,'Pantry returned unreadable data') }
 requireThat(value && typeof value === 'object' && !Array.isArray(value),'Pantry returned an invalid response',502)
 return value
}
export async function pantryPages(key: PantryKey, path: string, envelope='records', query: Record<string,string>={}) {
 const rows: Data[]=[],seen=new Set<string>();let cursor=''
 for(let page=0;page<100;page++) {
  const value=await pantryRequest(key,path,{...query,limit:'100',...(cursor?{cursor}:{})})
  requireThat(Array.isArray(value[envelope]) && value[envelope].length<=100 && ('nextCursor' in value),'Pantry pagination is incomplete',502)
  for(const row of value[envelope]) { const id=pantryId(row.id);requireThat(!seen.has(id) && id>cursor,'Pantry returned duplicate or unordered records',502);seen.add(id);rows.push(row) }
  requireThat(rows.length<=5000,'Pantry exceeds the manual source limit; no partial source is accepted',409)
  if(value.nextCursor===null)return rows
  const next=pantryId(value.nextCursor)
  requireThat(value[envelope].length>0 && next===value[envelope].at(-1).id && next>cursor,'Pantry returned a repeated or inconsistent cursor',502)
  cursor=next
 }
 throw new Fault(502,'Pantry pagination did not complete')
}
export const pantryDigest=(value: unknown)=>sha256(canonicalJson(value as any))

/** Complete posted source; no provider memo, person identity or credential leaves this boundary. */
export async function readPantryLedger(key: PantryKey, from: string, to: string) {
 pantryDate(from);pantryDate(to);requireThat(from<=to,'Choose an ascending Pantry date range')
 const business=await pantryPages(key,'business');requireThat(business.length===1 && typeof business[0].currency==='string','Pantry business currency is unavailable',502)
 const accounts=await pantryPages(key,'accounts'),periods=await pantryPages(key,'periods')
 const entries=await pantryPages(key,'journals','entries',{status:'posted'})
 const ledger=await pantryRequest(key,['reports','general-ledger'].join('/'),{from,to,basis:'accrual'})
 const before=new Date(Date.parse(`${from}T00:00:00Z`)-86400000).toISOString().slice(0,10)
 const opening=await pantryRequest(key,['reports','trial-balance'].join('/'),{to:before,basis:'accrual'})
 const closing=await pantryRequest(key,['reports','trial-balance'].join('/'),{to,basis:'accrual'})
 requireThat(ledger.basis==='accrual' && ledger.from===from && ledger.to===to && Array.isArray(ledger.accounts),'Pantry returned a different ledger range or basis',502)
 const chart=new Map(accounts.map(a=>[pantryId(a.id),a]))
 requireThat(new Set(accounts.map(a=>a.code)).size===accounts.length,'Pantry returned duplicate account codes',502)
 const rows: Data[]=[],ids=new Set<string>(),movement=new Map<string,number>()
 for(const entry of entries) {
  requireThat(entry.status==='posted' && Number.isSafeInteger(entry.revision) && entry.revision>0 && Array.isArray(entry.lines),'Pantry returned an incomplete posted entry',502)
  const date=pantryDate(entry.entry_date);if(date<from||date>to)continue
  let net=0
  for(const line of entry.lines) {
   const id=pantryId(line.id),account=chart.get(pantryId(line.account_id));requireThat(account && typeof account.code==='string' && typeof account.name==='string' && typeof account.type==='string' && !ids.has(id),'Pantry returned an unknown account or repeated line',502);ids.add(id)
   const debit=pantryCents(line.debit_cents),credit=pantryCents(line.credit_cents)
   requireThat(debit>=0&&credit>=0&&!(debit&&credit),'Pantry returned an invalid journal amount',502)
   const amount=pantryCents(debit-credit);net=pantryCents(net+amount)
   movement.set(account.id,pantryCents((movement.get(account.id)??0)+amount))
   const dimensions:Record<string,string>={};for(const name of ['class_name','location_name','project_name']) {requireThat(line[name]===undefined||line[name]===null||typeof line[name]==='string','Pantry returned invalid source dimensions',502);dimensions[name]=line[name]??''}
   rows.push({id,entryId:entry.id,revision:entry.revision,date,accountId:account.id,account:account.code,accountName:account.name,accountType:account.type,amount,...dimensions})
  }
  requireThat(net===0,'Pantry posted entry does not balance',502)
 }
 const sourceLines=new Map(rows.map(r=>[r.id,r]));let reportCount=0
 for(const a of ledger.accounts) {
  requireThat(Array.isArray(a.rows),'Pantry ledger detail is incomplete',502)
  for(const line of a.rows){const source=sourceLines.get(line.id);requireThat(source && source.accountId===a.id && source.entryId===line.entry_id && source.date===line.entry_date && source.amount===pantryCents(line.debit_cents)-pantryCents(line.credit_cents)&&source.class_name===(line.class_name??'')&&source.location_name===(line.location_name??'')&&source.project_name===(line.project_name??''),'Pantry journals changed or disagree with its general ledger; preview again',409);sourceLines.delete(line.id);reportCount++}
 }
 requireThat(!sourceLines.size && reportCount===rows.length,'Pantry ledger omits posted journal lines',409)
 const balances=(value:Data,asOf:string)=>{
  requireThat(value.basis==='accrual'&&value.asOf===asOf&&value.balanced===true&&Array.isArray(value.rows)&&pantryCents(value.debit)===pantryCents(value.credit),'Pantry trial balance is incomplete or unbalanced',502)
  const map=new Map<string,number>();for(const r of value.rows){const id=pantryId(r.id);requireThat(chart.has(id)&&!map.has(id),'Pantry trial balance has an unknown or repeated account',502);map.set(id,pantryCents(r.net))}
  const debit=pantryCents([...map.values()].reduce((n,v)=>n+Math.max(v,0),0)),credit=pantryCents([...map.values()].reduce((n,v)=>n+Math.max(-v,0),0))
  requireThat(debit===credit&&debit===value.debit&&credit===value.credit,'Pantry trial balance totals disagree with its rows',502)
  return map
 }
 const first=balances(opening,before),last=balances(closing,to)
 for(const id of new Set([...first.keys(),...last.keys(),...movement.keys()]))requireThat((first.get(id)??0)+(movement.get(id)??0)===(last.get(id)??0),'Pantry movement does not reconcile to its trial balance; preview again',409)
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
 const safePeriods=periods.map(p=>({id:pantryId(p.id),start:pantryDate(p.start_date),end:pantryDate(p.end_date),status:p.status}))
 return {from,to,currency:business[0].currency,rows,periods:safePeriods,trialBalance:{opening:Object.fromEntries(first),closing:Object.fromEntries(last),balanced:true},digest:pantryDigest(rows)}
}
