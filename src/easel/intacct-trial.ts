import { requireThat, type Data } from './types'
export function intacctCents(value:unknown):number{
 requireThat(typeof value==='string'&&/^-?\d+(?:\.\d{1,2})?$/.test(value),'Intacct returned an invalid exact monetary string',502)
 const [a,b='']=value.replace('-','').split('.'),n=(value.startsWith('-')?-1:1)*(Number(a)*100+Number(b.padEnd(2,'0')))
 requireThat(Number.isSafeInteger(n),'Intacct exceeds exact cents',409);return n
}
export const intacctExact=(n:number)=>{requireThat(Number.isSafeInteger(n),'Intacct exceeds exact cents',409);return n}
/** No inferred fiscal rollover: any unexplained report transfer stays a difference. */
export function reconcileIntacctTrial(chart:Data[],report:Data[],rows:Data[],currency:string){
 const opening:Record<string,number>={},closing:Record<string,number>={},movement:Record<string,number>={},seen=new Set<string>()
 for(const r of report){
  const a=chart.find(a=>a.code===r.accountno)
  requireThat(a&&!seen.has(a.id)&&r.currency===currency&&r.reportingbook==='ACCRUAL','Intacct trial scope, account or currency changed',502)
  seen.add(a.id)
  const dr=intacctCents(r.startbalancedebit),cr=intacctCents(r.startbalancecredit),ed=intacctCents(r.endbalancedebit),ec=intacctCents(r.endbalancecredit)
  requireThat([dr,cr,ed,ec].every(n=>n>=0)&&!(dr&&cr)&&!(ed&&ec),'Intacct trial debit/credit columns are invalid',502)
  opening[a.id]=intacctExact(dr-cr);closing[a.id]=intacctExact(ed-ec)
 }
 requireThat(seen.size===chart.length,'Intacct trial balance omitted accounts; request zero balances',502)
 for(const r of rows)movement[r.accountId]=intacctExact((movement[r.accountId]??0)+r.amount)
 const differences=chart.map(a=>({account:a.code,accountId:a.id,difference:intacctExact(opening[a.id]+(movement[a.id]??0)-closing[a.id])})).filter(r=>r.difference!==0)
 const openingDifference=Object.values(opening).reduce((n,v)=>intacctExact(n+v),0),closingDifference=Object.values(closing).reduce((n,v)=>intacctExact(n+v),0)
 return{basis:'Entity-local ACCRUAL, nonstatistical; opening plus posted movement compared account by account to independent closing balances. Unexplained fiscal report transfers require correcting review.',opening,closing,movement,differences,openingDifference,closingDifference,balanced:!differences.length&&openingDifference===0&&closingDifference===0}
}
