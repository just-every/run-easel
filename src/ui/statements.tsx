import { useState, type ReactNode } from 'react'
import { money, monthLabel, Table, type D } from './shared'

type StatementLine = readonly [key: string, label: string, total?: boolean]

const balanceLines: StatementLine[] = [
 ['cash', 'Cash'],
 ['receivables', 'Receivables'],
 ['capitalPrepayments', 'Capital prepayments'],
 ['fixedAssets', 'Fixed assets, net'],
 ['assets', 'Total assets', true],
 ['payables', 'Payables'],
 ['capitalPayables', 'Capital payables'],
 ['nonCashReserve', 'Non-cash reserve'],
 ['liabilities', 'Total liabilities', true],
 ['openingEquity', 'Opening equity (estimate)'],
 ['retainedEarnings', 'Retained earnings'],
 ['equity', 'Total equity', true],
]

const cashFlowLines: StatementLine[] = [
 ['opening', 'Opening cash'],
 ['netIncome', 'Net income'],
 ['nonCashExpense', 'Non-cash expense'],
 ['receivablesChange', 'Receivables change'],
 ['payablesChange', 'Payables change'],
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
 return <>
  <Statement heading="Balance sheet" caption="Balance sheet by month" calculation={calculation} rows={calculation.balanceSheet} lines={balanceLines} currency={currency} balance>
   <p className="muted">Opening equity is an estimate from opening assets less opening liabilities. Retained earnings accumulate the plan's net income.</p>
  </Statement>
  <Statement heading="Indirect cash flow" caption="Indirect cash flow by month" calculation={calculation} rows={calculation.cashFlow} lines={cashFlowLines} currency={currency}>
   <p className="muted">Future financing is unavailable: borrowing, repayments, equity contributions and distributions are not modelled. Financing shown as zero does not represent a funding plan.</p>
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
     {months.map(month => <td key={month} className={`num${month <= (calculation.actualsThrough ?? '') ? ' actual' : ''}`}>{money(rows.find(r => r.month === month)?.[key], currency)}</td>)}
    </tr>)}
    <tr><th scope="row">Reconciliation</th>{months.map(month => {
     const row = rows.find(r => r.month === month)
     if (!row) return <td key={month}>Not captured</td>
     const balanced = balance ? row.balanceDifference === 0 && row.cashDifference === 0 : row.difference === 0
     return <td key={month}><button type="button" className="quiet" aria-label={`${heading} reconciliation for ${monthLabel(month)}: ${balanced ? 'Balanced' : 'Imbalance'}`} aria-expanded={selected === month} onClick={() => setSelected(selected === month ? '' : month)}>{balanced ? 'Balanced' : 'Imbalance'}</button></td>
    })}</tr>
   </Table>
   {check && <div role="region" aria-label={`${heading} reconciliation details`}>
    <h3>Reconciliation, {monthLabel(check.month)}</h3>
    {balance ? <><p>Assets less liabilities and equity: {money(check.balanceDifference, currency)}</p><p>Cash difference: {money(check.cashDifference, currency)}</p></> : <p>Cash difference: {money(check.difference, currency)}</p>}
    <p className="trace">{check.trace}</p>
    {check.causes?.length > 0 && <ul>{check.causes.map((cause: string, i: number) => <li key={i}>{cause}</li>)}</ul>}
    <button type="button" className="quiet" onClick={() => setSelected('')}>Close reconciliation</button>
   </div>}
  </>}
 </section>
}
