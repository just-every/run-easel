import { useEffect, useState } from 'react'
import { api, decimalText, money, monthLabel, Table, useDate, type D } from './shared'

export function Headcount({scenario,state,department}: {scenario:string;state:D;department:string}) {
 const [view,setView] = useState<D|null>(null),[error,setError]=useState(''),[month,setMonth]=useState('')
 const date = useDate()
 useEffect(() => {let live=true;setView(null);setError('');api(`headcount/${scenario}`).then(v=>{if(live){setView(v);setMonth(m=>v.months.some((r:D)=>r.month===m)?m:v.months.find((r:D)=>r.observations.length)?.month ?? v.months[0]?.month ?? '')}},e=>{if(live)setError(e.message)});return()=>{live=false}},[scenario,state])
 if(error)return <section className="card"><h2>Headcount plan against actual</h2><p role="alert">{error}</p></section>
 if(!view)return null
 const rows=view.months.filter((r:D)=>r.month===month&&(!department||r.department===department))
 const history=view.history.filter((r:D)=>r.asOf.slice(0,7)===month&&(!department||r.department===department))
 const value=(n:number|null)=>n===null?'Unavailable':n
 const cost=(n:number|null)=>n===null?'Unavailable':money(n,view.currency)
 return <section className="card">
  <h2>Headcount plan against actual</h2>
  <p className="muted">{view.source}. Headcount is measured on each listed observation date. Missing months stay unavailable. Costs are accepted pay runs, including employer taxes, benefits and fees.</p>
  <label className="inline">Headcount month<select aria-label="Headcount month" value={month} onChange={e=>setMonth(e.target.value)}>{[...new Set<string>(view.months.map((r:D)=>r.month))].map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
  <Table caption="Headcount comparison" heads={['Department','Plan headcount','Actual headcount','Difference','Plan hires','Actual hires','Plan departures','Actual departures','Backfills','Expected attrition','Plan payroll','Actual payroll','Cost difference']}>
   {rows.map((r:D)=><tr key={r.department}><th scope="row">{r.name}</th>{[r.plannedHeadcount,r.actualHeadcount,r.headcountDifference,r.plannedHires,r.actualHires,r.plannedDepartures,r.actualDepartures,r.backfills].map((v,i)=><td className="num" key={i}>{value(v)}</td>)}<td className="num">{decimalText(r.expectedAttritionHundredths)} people</td><td className="num">{cost(r.plannedCostCents)}</td><td className="num">{cost(r.actualCostCents)}</td><td className="num">{cost(r.costDifferenceCents)}</td></tr>)}
  </Table>
  <p className="muted">{rows[0]?.observations.map((r:D)=>`${r.provider}: ${date(r.asOf)}`).join(' · ') || 'No reviewed roster observation for this month'}. Planned departures are the month after an inclusive end month. Attrition is an assumption only; it does not change headcount or costs.</p>
  {rows.filter((r:D)=>r.issue).map((r:D)=><p role="alert" key={r.department}>{r.name}: {r.issue}</p>)}
  {history.length>0 && <Table caption="Hiring slippage history" heads={['Person','Position','Observed','Planned date','Actual date','Slippage','Backfill']}>
   {history.map((r:D,i:number)=><tr key={i}><td>{r.name}</td><td>{r.title}</td><td>{date(r.asOf)}</td><td>{r.plannedStartDate?date(r.plannedStartDate):'Unavailable'}</td><td>{date(r.actualStartDate)}</td><td>{r.slippageDays===null?'Unavailable':`${r.slippageDays} days`}</td><td>{view.positions.find((p:D)=>p.originId===r.backfillOrigin)?.title ?? '—'}</td></tr>)}
  </Table>}
 </section>
}
