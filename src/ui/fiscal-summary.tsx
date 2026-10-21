import { useState } from 'react'
import { fiscalSummary } from '../easel/fiscal-summary'
import { Field, money, Table, type D } from './shared'

/** Use the existing setup form; the chosen accounting calendar then stays fixed. */
export function CalendarFields() {
 const [calendar, setCalendar] = useState('calendar-month')
 return <>
  <Field label="Plan horizon (months)" name="horizon" type="number" defaultValue="12" hint="12–60 accounting periods, including multi-year budgets." />
  <label>Accounting calendar<select aria-label="Accounting calendar" name="calendar" value={calendar} onChange={e => setCalendar(e.target.value)}>
   <option value="calendar-month">Calendar months</option><option value="4-4-5">4-4-5 retail</option><option value="5-4-4">5-4-4 retail</option>
  </select></label>
  {calendar !== 'calendar-month' && <Field label="First retail period starts" name="retailStartDate" type="date" hint="Choose an exact date within the first plan month. Consecutive 52-week years; no automatic 53rd week. Fixed after setup." />}
 </>
}

export function FiscalSummary({ view, department }: { view: D; department: string }) {
 const [frequency, setFrequency] = useState('quarters')
 const summary = department ? fiscalSummary(view.workspace, view.calculation, view.lines, department) : view.fiscal
 if (!summary) return null
 const retail = summary.calendar !== 'calendar-month'
 const groups = frequency === 'years' ? summary.years : summary.quarters
 return <section className="card" aria-label="Fiscal summaries">
  <h2>Fiscal summaries</h2>
  <label>Roll-up<select aria-label="Roll-up" value={frequency} onChange={e => setFrequency(e.target.value)}><option value="quarters">Fiscal quarters</option><option value="years">Fiscal years</option></select></label>
  <p className="muted">Flows sum the displayed periods in cents. Cash uses the first opening and last closing balance. Partial quarters and years are marked.</p>
  <Table caption="Fiscal totals" heads={['Period', 'Revenue', 'Cost of sales', 'Operating expenses', 'Profit', ...(!department ? ['Closing cash'] : [])]}>
   {groups.map((g: D) => <tr key={g.label}><th scope="row">{g.label}{g.complete ? '' : ' (partial)'}</th>{[g.revenue, g.costOfSales, g.operatingExpenses, g.profit, ...(!department ? [g.cash?.closing] : [])].map((v, i) => <td className="num" key={i}>{v === undefined ? 'Unavailable' : money(v, view.workspace.currency)}</td>)}</tr>)}
  </Table>
  <details><summary>Accounting periods · {retail ? `${summary.calendar} retail` : 'calendar months'}</summary>
   <p className="muted">{retail ? 'YYYY-MM keys identify consecutive accounting periods; they are not Gregorian months. Monthly driver amounts apply once per period. Dates below are inclusive; each retail year has 52 weeks.' : 'Each accounting period is one Gregorian month.'}</p>
   <Table caption="Accounting periods" heads={['Key', 'Fiscal period', 'Starts', 'Ends', 'Weeks']}>
    {summary.periods.map((p: D) => <tr key={p.key}><td>{p.key}</td><td>{p.fiscalYear} P{p.period} · Q{p.quarter}</td><td>{p.fromDate}</td><td>{p.throughDate}</td><td>{p.weeks ?? '—'}</td></tr>)}
   </Table>
  </details>
 </section>
}
