import { money, Table, useDate, type D } from './shared'

export function CashSchedule({ view }: { view: D }) {
 const date = useDate()
 return <>
  <p className="muted">{view.basis}</p>
  {view.bank && <p>Plaid observation {date(view.bank.asOf.slice(0, 10))} · {view.bank.accountCount} depository accounts · opening balance {money(view.bank.balanceCents, view.currency)}</p>}
  <Table caption="Weekly planned cash" heads={['Week', 'Opening', 'Collections', 'Payments', 'Adjustment', 'Closing', 'Note']}>
   {view.weeks.map((w: D) => <tr key={w.start}><td>{date(w.start)}–{date(w.end)}{w.assumedDates && <small> · includes assumed dates</small>}</td>{w.available ? <>{['opening', 'collections', 'payments', 'adjustment', 'closing'].map(k => <td className="num" key={k}>{money(w[k], view.currency)}</td>)}<td>{w.note || '—'}</td></> : <td colSpan={6}>Outside the plan horizon; unavailable</td>}</tr>)}
  </Table>
  <h3>Month-end reconciliation</h3>
  <Table caption="Weekly to monthly cash reconciliation" heads={['Period end', 'Monthly forecast', 'Dated schedule', 'Overrides to date', 'Weekly closing', 'Difference']}>
   {view.reconciliation.map((r: D) => <tr key={r.month}><td>{date(r.date)}{r.incomplete && <small> · incomplete source</small>}</td>{['monthly', 'scheduled', 'adjustment', 'weekly', 'difference'].map(k => <td className="num" key={k}>{money(r[k], view.currency)}</td>)}</tr>)}
  </Table>
 </>
}
