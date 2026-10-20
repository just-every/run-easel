import { money, monthLabel, Table, type D } from './shared'

export function WorkingCapital({calculation,currency}:{calculation:D;currency:string}) {
 const working=calculation.workingCapital
 if(!working)return null
 return <section className="card">
  <h2>Prepaids and accrued liabilities</h2>
  <p className="muted">Reviewed ledger allocations replace corresponding opening estimates from entered payment, service and pay-date assumptions. Prepayments amortize into expense; payroll and bonuses accrue when earned and settle on planned pay dates. No payments are executed.</p>
  <Table caption="Working capital by month" heads={['Month','Prepaid assets','Prepaid expense','Prepayments','Accrued liabilities','Earned payroll and bonus','Pay-date settlements']}>
   {working.months.map((r:D)=><tr key={r.month}><th scope="row">{monthLabel(r.month)}</th>{['prepaid','prepaidExpense','prepaidPayments','accruedLiabilities','accruedExpense','accruedPayments'].map(key=><td className="num" key={key}>{money(r[key],currency)}</td>)}</tr>)}
  </Table>
  {working.rows.length>0&&<details><summary>Visible payment and recognition traces</summary>
   <Table caption="Working capital source traces" heads={['Month','Source','Prepaid assets','Accrued liabilities','Trace']}>
    {working.rows.map((r:D)=><tr key={`${r.originId}:${r.month}`}><th scope="row">{monthLabel(r.month)}</th><td>{r.name}</td><td className="num">{money(r.prepaid,currency)}</td><td className="num">{money(r.accruedLiabilities,currency)}</td><td className="wrap">{r.trace}</td></tr>)}
   </Table>
  </details>}
  {working.issues.length>0&&<ul>{working.issues.map((issue:D,index:number)=><li key={index} role="alert">{monthLabel(issue.month)}: {issue.reason}</li>)}</ul>}
 </section>
}
