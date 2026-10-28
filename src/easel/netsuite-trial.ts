import { canonicalJson } from '../modules/import-kit/src/d1/index'
import { netsuiteMetadata,netsuitePostings,netsuiteTrial,netsuiteCents,netsuiteId,netsuiteText,netsuiteDigest,exact } from './netsuite-provider'
import type { NetSuiteCredentials } from './netsuite-auth'
import { requireThat, type Data } from './types'
export type NetSuiteRow={id:string;transactionId:string;transactionType:string;date:string;accountId:string;account:string;accountName:string;accountType:string;amount:number;class_name:string;location_name:string;department_name:string;description:string;reference:string;periodId:string;lineId:string;sourceDimensions:Record<string,string>;opening?:boolean}
export async function readNetSuiteLedger(key:NetSuiteCredentials,scope:Data,month:string,periodMap:Data[],asOf:string){
 requireThat(typeof month==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month),'Choose a NetSuite month')
 const deadline=Date.now()+120000
 const from=month+'-01',to=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10)
 requireThat(to<asOf,'Choose a completed NetSuite month')
 const inventory=await netsuiteMetadata(key,deadline),chart:Data[]=inventory.accounts,chartMap=new Map(chart.map(a=>[a.id,a]))
 requireThat(new Set(chart.map(a=>a.code)).size===chart.length,'NetSuite account codes repeat; review the chart',409)
 const subsidiary=inventory.subsidiaries.find((s:Data)=>s.id===scope.subsidiary),book=inventory.books.find((b:Data)=>b.id===scope.book)
 requireThat(subsidiary&&book,'The selected NetSuite subsidiary or book is unavailable',409)
 requireThat(subsidiary.currency===scope.currency,'NetSuite subsidiary currency changed; no exchange rate is inferred',409)
 const leaf:Data[]=inventory.periods.filter((p:Data)=>p.isyear==='F'&&p.isquarter==='F')
 for(const p of leaf){for(const day of[p.startdate,p.enddate])requireThat(typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day,'NetSuite returned an invalid source period',502)}
 const mappings=periodMap.filter(p=>p.account===key.realm&&p.book===scope.book)
 const selected=mappings.filter(p=>p.month===month).map(p=>p.period as string)
 requireThat(selected.length&&new Set(selected).size===selected.length&&selected.every(id=>leaf.some(p=>p.id===id&&p.closed==='T')),'Map every selected NetSuite source period explicitly before pulling',409)
 const relevant=leaf.filter(p=>p.enddate<=to)
 requireThat(relevant.every(p=>mappings.some(m=>m.period===p.id)), 'Map all preceding leaf and adjustment periods before establishing source balances',409)
 const openingPeriods=relevant.filter(p=>mappings.find(m=>m.period===p.id)!.month<month).map(p=>p.id)
 requireThat(leaf.filter(p=>p.enddate>=from&&p.startdate<=to).every(p=>selected.includes(p.id)),'A source period overlaps this month but is not mapped to it; review period boundaries',409)
 const raw=await netsuitePostings(key,scope.book,scope.subsidiary,selected,deadline),rows:NetSuiteRow[]=[],seen=new Set<string>(),movement:Record<string,number>={}
 const dim=(kind:string,id:unknown)=>{if(id===undefined||id===null||id==='')return {id:'',name:''};const source=netsuiteId(id),v=inventory[kind].find((r:Data)=>r.id===source);requireThat(v,'NetSuite posting references missing dimension metadata',502);return {id:source,name:netsuiteText(v.name)}}
 let priorKey:bigint[]|undefined
 for(const r of raw){
  const accountId=netsuiteId(r.accountid),account=chartMap.get(accountId),transactionId=netsuiteId(r.transactionid),lineId=netsuiteId(r.lineid),periodId=netsuiteId(r.periodid)
  requireThat(account&&r.bookid===scope.book&&r.subsidiaryid===scope.subsidiary&&selected.includes(periodId),'NetSuite posting is outside the reviewed book, subsidiary or period',502)
  const key=[periodId,transactionId,lineId,accountId].map(BigInt)
  if(priorKey){let comparison=0;for(let i=0;i<key.length&&!comparison;i++)comparison=key[i]<priorKey[i]?-1:key[i]>priorKey[i]?1:0;requireThat(comparison>0,'NetSuite accounting pagination is not in stable posting order',502)}priorKey=key
  const id=[scope.book,scope.subsidiary,periodId,transactionId,lineId,accountId].join(':');requireThat(!seen.has(id),'NetSuite returned a duplicate accounting posting identity',502);seen.add(id)
  const debit=netsuiteCents(r.debit),credit=netsuiteCents(r.credit);requireThat(debit>=0&&credit>=0&&!(debit&&credit),'NetSuite posting has invalid debit/credit',502)
  const date=netsuiteText(r.date,10);requireThat(/^\d{4}-\d{2}-\d{2}$/.test(date)&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date,'NetSuite posting date is invalid',502)
  const department=dim('departments',r.departmentid),classification=dim('classes',r.classid),location=dim('locations',r.locationid),amount=exact(debit-credit)
  movement[accountId]=exact((movement[accountId]??0)+amount)
  rows.push({id,transactionId,transactionType:netsuiteText(r.transactiontype,40),date,periodId,lineId,accountId,account:account.code,accountName:account.name,accountType:account.type,amount,department_name:department.name,class_name:classification.name,location_name:location.name,description:netsuiteText(r.memo??''),reference:netsuiteText(r.reference??'',200),sourceDimensions:{department:department.name,class:classification.name,location:location.name,departmentId:department.id,classId:classification.id,locationId:location.id}})
 }
 const readTrial=async(periods:string[])=>{const result:Record<string,number>={};for(const r of await netsuiteTrial(key,scope.book,scope.subsidiary,periods,deadline)){const id=netsuiteId(r.accountid);requireThat(chartMap.has(id)&&!Object.hasOwn(result,id),'NetSuite trial has an unknown or repeated account',502);result[id]=netsuiteCents(r.balance)}return result}
 const opening=await readTrial(openingPeriods),closing=await readTrial([...openingPeriods,...selected]),differences:Data[]=[]
 for(const a of chart){const difference=exact(exact((opening[a.id]??0)+(movement[a.id]??0))-(closing[a.id]??0));if(difference)differences.push({account:a.id,code:a.code,difference})}
 const sum=(r:Record<string,number>)=>Object.values(r).reduce((n,v)=>exact(n+v),0)
 const trialBalance={opening,movement,closing,automaticClose:{},differences,balanced:!differences.length&&sum(opening)===0&&sum(movement)===0&&sum(closing)===0,basis:'Posted subsidiary/book base-currency accounting impacts. Separate cumulative opening and closing SuiteQL aggregates; no inferred FX or balancing journals.'}
 // Repeat independent balances and metadata: a changing source must start a fresh review.
 requireThat(canonicalJson(inventory)===canonicalJson(await netsuiteMetadata(key,deadline))&&canonicalJson(opening)===canonicalJson(await readTrial(openingPeriods))&&canonicalJson(closing)===canonicalJson(await readTrial([...openingPeriods,...selected])),'NetSuite changed during the read; preview a fresh observation',409)
 return {month,from,to,currency:scope.currency,rows,chart,dimensions:{departments:inventory.departments,classes:inventory.classes,locations:inventory.locations},inventory,periods:selected,trialBalance,digest:netsuiteDigest({scope,month,selected,rows,inventory,trialBalance})}
}
