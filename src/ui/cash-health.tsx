import type { Shared } from './app'
import { command, decimalText, Field, Form, money, monthLabel, Table, type D } from './shared'
import { Dots } from './dots'

/** The same current agreement checks saved and working cash, including proposals. */
export function CashHealth({ health, currency, title = 'Cash health' }: { health: D | null; currency: string; title?: string }) {
 if (!health) return <section className="card"><h2>{title}</h2><p>Company cash diagnostics are unavailable for this grant.</p></section>
 const crossing = health.months.find((m: D) => m.month === health.firstFloorBreach)
 const crossingRunway = crossing?.runwayHundredths === null ? (crossing.runwayBasis === 'cash-exhausted' ? 'Cash exhausted' : 'Not burning') : `${decimalText(crossing?.runwayHundredths)} months`
 const check = (value: boolean | null) => value === null ? 'Not assessed' : value ? 'Below minimum' : 'Meets minimum'
 return <section className="card" aria-label={title}>
  <h2>{title}</h2>
  {health.incompleteReasons?.length > 0 && <p role="status">Incomplete: these diagnostics describe the known cash planning schedule. Actual contract receipt allocation is unresolved.</p>}
  <Dots as="p">{`Lowest cash: ${monthLabel(health.lowestCash?.month)}`}{`${money(health.lowestCash?.closing, currency)}. Cash-zero month: ${health.cashZeroMonth ? monthLabel(health.cashZeroMonth) : 'None in forecast'}.`}</Dots>
  {health.agreementStatus === 'not-agreed' ? <p>No finance-agreed cash floor or runway minimum yet.</p> : health.agreementStatus === 'different-currency' ? <p className="error">The agreement is in {health.agreement.currency}; these {currency} amounts cannot be checked against it.</p> : <>
   <p>Current agreed cash floor: {money(health.agreement.floorCents, currency)}. Runway minimum: {decimalText(health.agreement.runwayMinimumHundredths)} months.</p>
   <p>First below cash floor: {health.incompleteReasons?.length ? 'Not assessed: incomplete cash' : health.firstFloorBreach ? monthLabel(health.firstFloorBreach) : 'None'}. First below runway minimum: {health.incompleteReasons?.length ? 'Not assessed: incomplete cash' : health.firstRunwayBreach ? monthLabel(health.firstRunwayBreach) : 'None'}.</p>
  </>}
  {crossing && <p>Runway at cash-floor crossing: {crossingRunway}.</p>}
  <p className="muted">Runway uses closing cash divided by the current and up to two preceding months’ average net burn. Negative runway means cash is already exhausted; nonpositive average burn has no finite runway. Current agreed thresholds also check frozen cash without changing its saved numbers.</p>
  <Table caption={title + ' by month'} heads={['Month', 'Gross burn', 'Net burn', 'Runway (months)', 'Cash floor', 'Runway minimum']}>
   {health.months.map((m: D) => <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{money(m.grossBurnCents, currency)}</td><td className="num">{money(m.netBurnCents, currency)}</td><td className="num">{m.runwayHundredths === null ? (m.runwayBasis === 'cash-exhausted' ? 'Cash exhausted' : 'Not burning') : decimalText(m.runwayHundredths)}</td><td className={m.floorBreached ? 'error' : ''}>{check(m.floorBreached)}</td><td className={m.runwayBreached ? 'error' : ''}>{check(m.runwayBreached)}</td></tr>)}
  </Table>
 </section>
}

export function CashAgreement({ state, refresh }: Pick<Shared, 'state' | 'refresh'>) {
 if (state.me.role !== 'finance') return null
 const agreement = state.workspace.cashAgreement
 return <section className="card"><h2>Agreed cash constraints</h2>
  <p className="muted">Finance agrees these {state.workspace.currency} thresholds for every scenario and proposal. Equality meets a minimum.</p>
  <Form key={agreement?.at ?? 'unagreed'} submit="Save cash constraints" onSubmit={async v => { await command('cash-constraints', v); await refresh() }}>
   <Field label="Agreed cash floor" name="floor" defaultValue={decimalText(agreement?.floorCents)} />
   <Field label="Minimum runway (months)" name="runwayMinimum" defaultValue={decimalText(agreement?.runwayMinimumHundredths)} />
  </Form>
 </section>
}
