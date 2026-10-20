import { WorkingCapital } from './working-capital'
import { useDate } from './shared'
import { useState, type ReactNode } from 'react'
import { money, monthLabel, Table, type D } from './shared'

type StatementLine = readonly [key: string, label: string, total?: boolean]

const balanceLines: StatementLine[] = [
 ['cash', 'Cash'],
 ['receivables', 'Receivables'],
 ['unbilledRevenue', 'Unbilled contract revenue'],
 ['inventory', 'Inventory (estimate)'],
 ['prepaid', 'Prepaid expenses'],
 ['capitalPrepayments', 'Capital prepayments'],
 ['fixedAssets', 'Fixed assets, net'],
 ['assets', 'Total assets', true],
 ['payables', 'Payables'],
 ['capitalPayables', 'Capital payables'],
 ['nonCashReserve', 'Non-cash reserve'],
 ['deferredRevenue', 'Deferred revenue'],
 ['accruedLiabilities', 'Accrued payroll and bonuses'],
 ['debt', 'Debt'],
 ['liabilities', 'Total liabilities', true],
 ['openingEquity', 'Opening equity (estimate)'],
 ['retainedEarnings', 'Retained earnings'],
 ['contributedEquity', 'Contributed equity'],
 ['equity', 'Total equity', true],
]

const cashFlowLines: StatementLine[] = [
 ['opening', 'Opening cash'],
 ['netIncome', 'Net income'],
 ['nonCashExpense', 'Non-cash expense'],
 ['prepaidChange', 'Prepaid expense change'],
 ['accruedLiabilitiesChange', 'Accrued liability change'],
 ['receivablesChange', 'Receivables change'],
 ['inventoryChange', 'Inventory change'],
 ['payablesChange', 'Payables change'],
 ['deferredRevenueChange', 'Deferred revenue change'],
 ['unbilledRevenueChange', 'Unbilled revenue change'],
 ['operating', 'Net operating cash flow', true],
 ['capex', 'Capital expenditure'],
 ['disposalProceeds', 'Disposal proceeds'],
 ['investing', 'Net investing cash flow', true],
 ['financing', 'Financing'],
 ['change', 'Net change in cash', true],
 ['closing', 'Closing cash', true],
]

/** Read the stored statement rows, including reconciliations; never rebuild a snapshot. */
export function Statements({ calculation, currency }: { calculation: D; currency: string }) {
 const displayDate = useDate()
 return <>
  <WorkingCapital calculation={calculation} currency={currency} />
  {calculation.contracts && <section className="card">
   <h2>Bookings, billings, revenue and collections</h2>
   <p className="muted">Bookings record contract value at start. Upfront invoices create receivables and deferred revenue; recognition releases deferred revenue as service is earned. Collections use invoice date plus exact DSO days.</p>
   <Table caption="Contract flows by month" heads={['Month', 'Bookings', 'Billings', 'Revenue', 'Collections', 'Receivables', 'Deferred revenue', 'Unbilled revenue']}>
    {calculation.contracts.months.map((r: D) => <tr key={r.month}><th scope="row">{monthLabel(r.month)}</th>{['bookings', 'billings', 'revenue', 'collections', 'receivables', 'deferredRevenue', 'unbilledRevenue'].map(k => <td className="num" key={k}>{money(r[k], currency)}</td>)}</tr>)}
   </Table>
   {calculation.contracts.invoices.length > 0 && <Table caption="Contract invoice dates" heads={['Contract', 'Invoice date', 'Collection date', 'Amount']}>
    {calculation.contracts.invoices.map((i: D, index: number) => <tr key={index}><th scope="row">{i.name}</th><td>{displayDate(i.date)}</td><td>{displayDate(i.collectionDate)}</td><td className="num">{money(i.amount, currency)}</td></tr>)}
   </Table>}
  </section>}
  <Statement heading="Balance sheet" caption="Balance sheet by month" calculation={calculation} rows={calculation.balanceSheet} lines={balanceLines} currency={currency} balance>
   <p className="muted">Opening equity is an estimate from opening assets less opening liabilities. Retained earnings accumulate the plan's net income.</p>
  </Statement>
  <Statement heading="Indirect cash flow" caption="Indirect cash flow by month" calculation={calculation} rows={calculation.cashFlow} lines={cashFlowLines} currency={currency}>
   <p className="muted">{calculation.financing ? 'Financing includes planned debt draws, principal repayments and equity raises. Interest is an operating cash outflow. These are planning assumptions, never executed payments.' : 'Financing assumptions were not captured in this older snapshot; its saved figures remain unchanged.'}</p>
  </Statement>
 </>
}

function Statement({ heading, caption, calculation, rows, lines, currency, balance = false, children }: {
 heading: string; caption: string; calculation: D; rows?: D[]; lines: StatementLine[]; currency: string; balance?: boolean; children: ReactNode
}) {
 const [selected, setSelected] = useState('')
 const check = rows?.find(r => r.month === selected)
 const months: string[] = calculation.months
 return <section className="card">
  <h2>{heading}</h2>
  {!rows ? <p className="muted">Statements not captured in this snapshot.</p> : <>
   {children}
   <Table caption={caption} heads={['Line', ...months.map(m => <span className={m <= (calculation.actualsThrough ?? '') ? 'actual' : ''}>{monthLabel(m)}</span>)]}>
    {lines.map(([key, label, total]) => <tr key={key} className={total ? 'total' : undefined}>
     <th scope="row">{label}</th>
     {months.map(month => <td key={month} className={`num${month <= (calculation.actualsThrough ?? '') ? ' actual' : ''}`}>{rows.find(r => r.month === month)?.[key] === undefined ? 'Not captured' : money(rows.find(r => r.month === month)?.[key], currency)}</td>)}
    </tr>)}
    <tr><th scope="row">Reconciliation</th>{months.map(month => {
     const row = rows.find(r => r.month === month)
     if (!row) return <td key={month}>Not captured</td>
     const balanced = balance ? row.balanceDifference === 0 && row.cashDifference === 0 : row.difference === 0
     const label = row.incompleteReasons?.length ? 'Incomplete' : balanced ? 'Balanced' : 'Imbalance'
     return <td key={month}><button type="button" className="quiet" aria-label={`${heading} reconciliation for ${monthLabel(month)}: ${label}`} aria-expanded={selected === month} onClick={() => setSelected(selected === month ? '' : month)}>{label}</button></td>
    })}</tr>
   </Table>
   {check && <div role="region" aria-label={`${heading} reconciliation details`}>
    <h3>Reconciliation, {monthLabel(check.month)}</h3>
    {balance ? <><p>Assets less liabilities and equity: {money(check.balanceDifference, currency)}</p><p>Cash difference: {money(check.cashDifference, currency)}</p></> : <p>Cash difference: {money(check.difference, currency)}</p>}
    {check.incompleteReasons?.length > 0 && <p role="status">Incomplete: invoice and cash amounts are known planning schedules; actual receipt allocation is unresolved.</p>}
    <p className="trace">{check.trace}</p>
    {check.causes?.length > 0 && <ul>{check.causes.map((cause: string, i: number) => <li key={i}>{cause}</li>)}</ul>}
    <button type="button" className="quiet" onClick={() => setSelected('')}>Close reconciliation</button>
   </div>}
  </>}
 </section>
}
