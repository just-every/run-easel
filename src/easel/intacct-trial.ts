import { requireThat, type Data } from './types'
export function intacctCents(value:unknown):number{
 requireThat(typeof value==='string'&&/^-?\d+(?:\.\d{1,2})?$/.test(value),'Intacct returned an invalid exact monetary string',502)
 const [a,b='']=value.replace('-','').split('.'),n=(value.startsWith('-')?-1:1)*(Number(a)*100+Number(b.padEnd(2,'0')))
 requireThat(Number.isSafeInteger(n),'Intacct exceeds exact cents',409);return n
}
export const intacctExact=(n:number)=>{requireThat(Number.isSafeInteger(n),'Intacct exceeds exact cents',409);return n}
/** No inferred fiscal rollover: any unexplained report transfer stays a difference. */
export function reconcileIntacctTrial(chart:Data[],report:Data[],rows:Data[],currency:string,from:string,firstFiscalMonth:string){
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
 const reportTransfers:Record<string,number>={}
 if(Number(from.slice(5,7))===Number(firstFiscalMonth)){
  for(const a of chart.filter(a=>a.closingType==='closing account')){
   const target=chart.find(t=>t.code===a.closingAccount)
   requireThat(target&&target.id!==a.id&&target.closingType==='non-closing account','Intacct closing account metadata is unavailable or cyclic',502)
   const amount=opening[a.id]
   reportTransfers[a.id]=intacctExact((reportTransfers[a.id]??0)-amount)
   reportTransfers[target.id]=intacctExact((reportTransfers[target.id]??0)+amount)
  }
  // A transfer is recognized only when every documented closing pair explains the independent report.
  if(!chart.every(a=>opening[a.id]+(movement[a.id]??0)+(reportTransfers[a.id]??0)===closing[a.id]))for(const key of Object.keys(reportTransfers))delete reportTransfers[key]
 }
 const differences=chart.map(a=>({account:a.code,accountId:a.id,difference:intacctExact(opening[a.id]+(movement[a.id]??0)+(reportTransfers[a.id]??0)-closing[a.id])})).filter(r=>r.difference!==0)
 const openingDifference=Object.values(opening).reduce((n,v)=>intacctExact(n+v),0),closingDifference=Object.values(closing).reduce((n,v)=>intacctExact(n+v),0)
 return{basis:'Entity-local ACCRUAL, nonstatistical; opening plus posted movement compared account by account to independent closing balances. Unexplained fiscal report transfers require correcting review.',opening,closing,movement,reportTransfers,differences,openingDifference,closingDifference,balanced:!differences.length&&openingDifference===0&&closingDifference===0}
}

/** Reconcile the proposed accepted journal, including earlier corrections and
 * separately reviewed fiscal report transfers, rather than provider data alone. */
export function reconcileIntacctLedger(chart:Data[],trial:Data,accepted:Data[],deltas:Data[],history:Data[],month:string){
 const opening:Record<string,number>={},closing:Record<string,number>={}
 const add=(balances:Record<string,number>,id:string,amount:number)=>{balances[id]=intacctExact((balances[id]??0)+amount)}
 for(const row of accepted){
  requireThat(typeof row.intacctAccountId==='string'&&Number.isSafeInteger(row.amount),'Accepted Intacct provenance is incomplete',409)
  add(closing,row.intacctAccountId,row.amount)
  if(row.intacctMonth<month||row.intacctOpening)add(opening,row.intacctAccountId,row.amount)
 }
 for(const row of deltas){
  add(closing,row.accountId,row.amount)
  if(row.opening)add(opening,row.accountId,row.amount)
 }
 // These are report presentation transfers, never invented ledger postings.
 // The requested month's receipt is replaced by its newly reviewed report.
 for(const receipt of history.filter(r=>r.month<month&&r.status==='accepted')){
  for(const [id,amount]of Object.entries(receipt.trialBalance.reportTransfers??{})){
   add(opening,id,amount as number);add(closing,id,amount as number)
  }
 }
 for(const [id,amount]of Object.entries(trial.reportTransfers))add(closing,id,amount as number)
 const ids=[...new Set([...chart.map(a=>a.id),...Object.keys(opening),...Object.keys(closing)])]
 const differences=ids.map(id=>({accountId:id,account:chart.find(a=>a.id===id)?.code??accepted.find(r=>r.intacctAccountId===id)?.account??id,
  opening:opening[id]??0,providerOpening:trial.opening[id]??0,openingDifference:intacctExact((opening[id]??0)-(trial.opening[id]??0)),
  closing:closing[id]??0,providerClosing:trial.closing[id]??0,difference:intacctExact((closing[id]??0)-(trial.closing[id]??0)),
 })).filter(r=>r.openingDifference!==0||r.difference!==0)
 const priorMonths=history.filter(r=>r.month<month).map(r=>r.month as string).sort()
 const reviewMonths=differences.some(r=>r.openingDifference!==0)?priorMonths:[]
 return{basis:'Accepted Easel ledger plus the proposed journal deltas and reviewed fiscal report transfers, compared to independent provider opening and closing balances.',opening,closing,differences,reviewMonths,balanced:!differences.length}
}
