import { useState } from 'react'
import { decimalText, Field, Form, type D, type Option } from './shared'

export function collectionPayload(values: D): D {
 return values.collectionMethod === 'curve' ? { collectionCurve: Array.from({length:Number(values.collectionCount)},(_,i)=>({days:values[`collectionDays${i}`],percent:values[`collectionPercent${i}`]})) } : {}
}

export function CollectionFields({row,contract}:{row:D|null;contract:boolean}) {
 const [method,setMethod]=useState(row?.collectionMethod ?? (contract?'dso':'lag'))
 const [count,setCount]=useState<number>(row?.collectionCurve?.length??2)
 return <>
  <label>Collection timing<select aria-label="Collection timing" name="collectionMethod" value={method} onChange={e=>setMethod(e.target.value)}>
   {!contract&&<option value="lag">Monthly lag</option>}<option value="dso">Days sales outstanding</option><option value="curve">Collection curve</option>
  </select></label>
  {method==='lag'&&<Field label="Collected after (months)" name="collectionLag" options={[0,1,2,3].map(n=>({value:String(n),label:String(n)}))} defaultValue={String(row?.collectionLag??1)} />}
  {method==='dso'&&<Field label="DSO (days)" name="dsoDays" type="number" defaultValue={String(row?.dsoDays??30)} hint={contract?'Exact calendar days after each planned invoice date.':'Exact calendar days after the assumed month-end invoice.'} />}
  {method==='curve'&&<>
   {contract&&<input type="hidden" name="dsoDays" value="0" />}
   <input type="hidden" name="collectionCount" value={count} />
   {Array.from({length:count},(_,i)=><div className="row wide" key={i}>
    <Field label={`Collection ${i+1} days`} name={`collectionDays${i}`} type="number" defaultValue={row?.collectionCurve?.[i]?.days??(i===0?0:60)} />
    <Field label={`Collection ${i+1} percent`} name={`collectionPercent${i}`} defaultValue={row?.collectionCurve?.[i]?decimalText(row.collectionCurve[i].bps):'50'} />
   </div>)}
   <div className="row wide"><button type="button" disabled={count>=24} onClick={()=>setCount(n=>n+1)}>Add collection installment</button>{count>1&&<button type="button" onClick={()=>setCount(n=>n-1)}>Remove last collection installment</button>}</div>
   <p className="muted wide">Shares must total 100%. Cents are apportioned by largest remainder, with earlier installments winning ties. Days run from {contract?'each contract invoice date':'the assumed month-end invoice'}.</p>
  </>}
 </>
}

export function CollectionSummary({row}:{row:D}) {
 return row.collectionMethod==='dso'?<small> · DSO {row.dsoDays} days from invoice date</small>:row.collectionMethod==='curve'?<small> · {row.collectionCurve.map((r:D)=>`${decimalText(r.bps)}% at ${r.days} days`).join('; ')}</small>:null
}

export function PayrollFields({row}:{row:D|null}) {
 const [scheduled,setScheduled]=useState(!!row?.payDay)
 return <>
  <label>Payroll cash timing<select aria-label="Payroll cash timing" value={scheduled?'date':'month'} onChange={e=>setScheduled(e.target.value==='date')}><option value="month">Paid in earned month</option><option value="date">Entered pay date</option></select></label>
  {scheduled&&<>
   <Field label="Payroll pay day" name="payDay" type="number" defaultValue={row?.payDay??5} hint="Day 1–31, clamped to the pay month's last day." />
   <Field label="Second payroll pay day" name="secondPayDay" type="number" required={false} defaultValue={row?.secondPayDay} hint="Optional for semimonthly pay. Later than the first day, up to 31; both clamp to period end. Equal installments, first receives any cent remainder." />
   <Field label="Payroll pay month offset" name="payMonthOffset" options={[0,1,2,3].map(n=>({value:String(n),label:n===0?'Earned month':`${n} month${n===1?'':'s'} after earned`}))} defaultValue={String(row?.payMonthOffset??1)} />
   <p className="muted wide">Base pay, entered on-costs, benefits, employer match and tax estimates accrue in the earned month and settle on the entered pay date or dates. A position bonus and its incremental taxes settle on the first pay day in its bonus period, without the month offset. This does not run payroll or make a payment.</p>
  </>}
 </>
}

export function ExpenseForm({row,lines,depts,onSave}:{row:D|null;lines:Option[];depts:Option[];onSave:(values:D)=>Promise<void>}) {
 const [kind,setKind]=useState(row?.kind??'recurring')
 return <Form submit={row?'Save expense':'Add expense'} onSubmit={values=>onSave({...values,kind,id:row?.id})}>
  <Field label="Expense name" name="name" defaultValue={row?.name} />
  <Field label="Expense line" name="line" options={lines} defaultValue={row?.line} />
  <Field label="Department" name="department" options={depts} defaultValue={row?.department} />
  <label>Kind<select aria-label="Kind" value={kind} onChange={e=>setKind(e.target.value)}>{[['recurring','Recurring monthly'],['one-off','One-off'],['prepaid','Prepaid expense'],['bonus','Quarterly bonus accrual']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  <Field label="Amount" name="amount" defaultValue={decimalText(row?.amountCents)} hint={kind==='prepaid'?'Total amount prepaid.':kind==='bonus'?'Total bonus earned in each three-month quarter.':'Monthly amount, or the one-off amount.'} />
  <Field label="Start month" name="start" type="month" defaultValue={row?.start} hint={kind==='prepaid'?'First service month; an earlier start can establish an opening estimate.':kind==='bonus'?'First month of bonus accrual.':'First month of the expense.'} />
  {kind==='prepaid'?<>
   <Field label="Amortization months" name="amortizationMonths" type="number" defaultValue={row?.amortizationMonths??12} />
   <Field label="Prepayment month" name="paymentMonth" type="month" required={false} defaultValue={row?.paymentMonth} hint="At or before service starts; blank uses the start month. Equal monthly expense, final month receives the cent remainder." />
  </>:kind==='bonus'?<>
   <Field label="First bonus pay month" name="payMonth" type="month" defaultValue={row?.payMonth} hint="At or after the first quarter ends. Settles at month end and every three months thereafter; final accrual month receives the cent remainder." />
  </>:<>
   <Field label="End month" name="end" type="month" required={false} defaultValue={row?.end} />
   <VendorFields row={row} />
  </>}
 </Form>
}

export function VendorFields({row}:{row:D|null}) {
 const [method,setMethod]=useState(row?.paymentMethod??'lag')
 return <>
   <label>Vendor payment timing<select aria-label="Vendor payment timing" name="paymentMethod" value={method} onChange={e=>setMethod(e.target.value)}><option value="lag">Scenario monthly lag</option><option value="dpo">Days payables outstanding</option><option value="terms">Vendor payment terms</option></select></label>
   {method==='dpo'&&<Field label="DPO (days)" name="dpoDays" type="number" defaultValue={row?.dpoDays??30} />}
   {method==='terms'&&<Field label="Vendor term days" name="paymentTermDays" type="number" defaultValue={row?.paymentTermDays??30} />}
   {method!=='lag'&&<p className="muted wide">The invoice is assumed dated at month end; payment follows by the entered number of exact calendar days.</p>}
 </>
}
