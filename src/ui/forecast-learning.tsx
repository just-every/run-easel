import { useEffect, useState } from 'react'
import { Action, api, command, Field, Form, money, monthLabel, Table, type D } from './shared'

const COLUMNS = ['deal', 'name', 'plannedClose', 'actualClose', 'contract', 'invoiceDate', 'paidDate', 'amount']
/** One deal per line: id, name, expected close, actual close, then optionally contract, invoice date, paid date, amount. */
const parseDeals = (text: string) => text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^deal\s*,/i.test(l)).map(line => {
 const cells = line.split(',').map(c => c.trim())
 return Object.fromEntries(COLUMNS.flatMap((key, i) => cells[i] ? [[key, cells[i]]] : []))
})

/** Finance reviews what the company's own kept forecasts got wrong and turns a backtested revision into a draft proposal. */
export function ForecastLearning({ state, forecast, refresh }: { state: D; forecast: D; refresh: () => Promise<unknown> }) {
 const [view, setView] = useState<D | null>(null), [error, setError] = useState(''), [proposal, setProposal] = useState<D | null>(null)
 const currency = state.workspace.currency
 const load = () => api(`forecast-learning/${forecast.id}`).then(setView, e => setError(e.message))
 useEffect(() => { setView(null); setError(''); load() }, [forecast.id, forecast.revision, forecast.actualsThrough])
 return <section className="card" aria-label="Forecast learning">
  <h2>Forecast learning</h2>
  <p className="muted">Every kept forecast is compared with the months that closed after it. The error is split into timing (it reversed inside the closed months), driver (a measured assumption miss) and permanent. Easel suggests a revision only when its backtest on the last six to twelve kept forecasts lowers the error; nothing changes until you submit and promote the proposal.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {!view && !error && <p role="status">Reading kept forecasts…</p>}
  {view && <>
   <Table caption="Kept forecasts against what closed" heads={['Kept before', 'Error', 'Timing', 'Driver', 'Permanent']}>
    {view.kept.map((k: D) => <tr key={k.snapshot}><td>{k.label}{!k.backtested && k.reason && <><br /><small className="muted">{k.reason}</small></>}</td><td className="num">{money(k.gross, currency)}</td><td className="num">{money(k.timing, currency)}</td><td className="num">{money(k.driver, currency)}</td><td className="num">{money(k.permanent, currency)}</td></tr>)}
   </Table>
   {!view.kept.length && <p className="muted">Close a month to keep the first forecast.</p>}
   {view.measures.map((m: D) => <div key={m.key} className="pack">
    <h3>{m.label}: {m.meanDays > 0 ? '+' : ''}{m.meanDays} {m.unit}</h3>
    <p className="muted">{m.evidence}. Median {m.medianDays}, range {m.minDays} to {m.maxDays} {m.unit}.</p>
    <p>Backtest on {m.backtest.keptForecasts} kept forecasts: error {money(m.backtest.baselineError, currency)} now, {money(m.backtest.revisedError, currency)} with this revision; lower on {m.backtest.lowerOn}, higher on {m.backtest.worseOn}.</p>
    {m.suggestion.eligible
     ? <><p>{m.suggestion.affectedCount} input{m.suggestion.affectedCount === 1 ? '' : 's'} that {m.suggestion.affectedCount === 1 ? 'has' : 'have'} not started would move: {m.suggestion.affected.slice(0, 6).map((a: D) => `${a.name} (${a.field === 'start' ? monthLabel(String(a.to)) : a.to})`).join(', ')}.</p>
      <Action label="Create proposal" confirm={`Create a draft proposal that moves ${m.suggestion.affectedCount} input(s) by ${m.suggestion.days} ${m.unit}? The forecast stays unchanged until you submit and promote it.`} run={async () => { setProposal(await command('learning-propose', { scenario: forecast.id, measure: m.key, evidence: m.evidenceSha })); await refresh() }} /></>
     : <p className="muted">Not suggested: {m.suggestion.reasons.join('; ')}.</p>}
   </div>)}
   {!view.measures.length && <p className="muted">No assumption is measured yet. Record deal history below{view.payDetail ? ' or accept roster files with planned start dates' : ''}.</p>}
   {proposal && <p role="status">Draft proposal “{proposal.name}” created. Review it under Scenarios, then submit and promote it to change the forecast.</p>}
   <p className="muted">Stage probabilities: {view.stageProbabilities}. Churn: {view.churn}.</p>
   <Form submit="Save deal history" onSubmit={async (v, form) => { await command('deal-outcomes-save', { rows: parseDeals(v.deals) }); form.reset(); await load() }}>
    <Field label="Deal history" name="deals" type="textarea" hint="One deal per line: id, name, expected close, actual close (YYYY-MM-DD), then optionally contract origin, invoice date, paid date and invoice amount." />
   </Form>
   <p className="muted">{view.deals} deal{view.deals === 1 ? '' : 's'} recorded.</p>
  </>}
 </section>
}
