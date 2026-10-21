import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { api, command, Field, Form, money, monthLabel, Table, type D } from './shared'

const kinds = [['budget', 'Budget'], ['average', 'Average'], ['monthEnd', 'Month-end']] as const

/** The plan's statements in the reporting currency, at the rates finance keeps. */
export function ReportingCurrency({ state, refresh, scenario }: Pick<Shared, 'state' | 'refresh'> & { scenario: string }) {
 const [t, setT] = useState<D | null>(null)
 const [error, setError] = useState('')
 const finance = state.me.role === 'finance'
 useEffect(() => { let live = true; setError(''); if (scenario) api(`translation/${scenario}`).then(v => { if (live) setT(v) }, e => setError(e.message)); return () => { live = false } }, [scenario, state])
 if (!t || (t.status === 'not-set' && !finance)) return error ? <p role="alert" className="error">{error}</p> : null
 const to = t.reportingCurrency ?? state.fxTable?.reporting ?? 'USD', local = t.planCurrency ?? state.workspace.currency
 const bs = t.months.filter((m: D) => m.balanceSheet)
 return <section className="card" aria-label="Reporting currency">
  <h2>Reporting currency</h2>
  {t.status === 'not-set' && <p>The plan is in {local}. Finance can enter rates to read it in another currency.</p>}
  {t.status === 'different-plan-currency' && <p className="error">These rates were entered for another plan currency; enter new {local} rates.</p>}
  {t.status === 'applied' && <p className="muted">{local} plan translated to {to}. {t.rateBasis}</p>}
  {finance && <Form key={state.fxTable?.at ?? 'unset'} submit="Save rates" onSubmit={async v => { await command('fx-rate', v); await refresh() }}>
   <Field label="Reporting currency" name="reporting" defaultValue={state.fxTable?.reporting ?? 'USD'} />
   <Field label="Rate month" name="month" type="month" />
   {kinds.map(([k, label]) => <Field key={k} label={`${label} rate`} name={k} required={false} hint={k === 'budget' ? `${to} per 1 ${local}; leave blank to keep` : undefined} />)}
  </Form>}
  {t.status === 'applied' && <>
   <Table caption={`Profit and loss in ${to}`} heads={['', ...t.months.map((m: D) => monthLabel(m.month))]}>
    {[['revenue', 'Revenue'], ['costOfSales', 'Cost of sales'], ['operatingExpenses', 'Operating expenses'], ['profit', 'Profit']].map(([k, label]) => <tr key={k} className={k === 'profit' ? 'total' : ''}><td>{label}</td>{t.months.map((m: D) => <td key={m.month} className="num">{m.profit ? money(m.profit[k], to) : '—'}</td>)}</tr>)}
    <tr><td>Average rate</td>{t.months.map((m: D) => <td key={m.month} className="num">{m.rates.average ?? '—'}</td>)}</tr>
   </Table>
   <Table caption={`Balance sheet in ${to}`} heads={['', ...t.months.map((m: D) => monthLabel(m.month))]}>
    {[['assets', 'Total assets'], ['liabilities', 'Total liabilities'], ['equity', 'Total equity'], ['translationAdjustment', 'Translation adjustment'], ['translationAdjustmentMovement', 'Adjustment in the month']].map(([k, label]) => <tr key={k} className={k === 'equity' ? 'total' : ''}><td>{label}</td>{t.months.map((m: D) => <td key={m.month} className="num">{m.balanceSheet ? money(m.balanceSheet[k], to) : '—'}</td>)}</tr>)}
    <tr><td>Month-end rate</td>{t.months.map((m: D) => <td key={m.month} className="num">{m.rates.monthEnd ?? '—'}</td>)}</tr>
   </Table>
   {t.months.some((m: D) => m.unavailable) && <p className="muted">A month shows “—” until finance enters the rate it needs; nothing is guessed. {bs.length === 0 ? 'No month can be translated yet.' : ''}</p>}
   <ul className="plain">{t.months.filter((m: D) => m.unavailable).slice(0, 6).map((m: D) => <li key={m.month}>{monthLabel(m.month)}: needs {m.unavailable.join('; ')}</li>)}</ul>
  </>}
 </section>
}

/** Closed-month profit variance in the reporting currency, with the currency effect separated out. */
export function ConstantCurrency({ month }: { month: string }) {
 const [v, setV] = useState<D | null>(null)
 useEffect(() => { let live = true; setV(null); if (month) api(`translation-variance/${month}`).then(r => { if (live) setV(r) }, () => {}); return () => { live = false } }, [month])
 if (!v || v.status === 'not-set') return null
 const to = v.reportingCurrency
 return <section className="card" aria-label="Constant-currency variance">
  <h2>Constant-currency variance, {monthLabel(month)}</h2>
  {v.unavailable ? <p>{v.unavailable}.</p> : <>
   <p className="muted">{v.rateBasis}</p>
   <Table caption={`Profit in ${to}`} heads={['Budget', 'Actual', 'Actual at budget rate', 'Variance', 'Constant-currency variance', 'Currency effect']}>
    <tr>{['budget', 'actual', 'actualAtBudgetRate', 'variance', 'constantCurrencyVariance', 'currencyEffect'].map(k => <td key={k} className="num">{money(v.totals[k], to)}</td>)}</tr>
   </Table>
  </>}
 </section>
}
