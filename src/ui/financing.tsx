import { useState } from 'react'
import { Action, decimalText, Field, Form, money, monthLabel, options, Table, type D, type Option } from './shared'

type Save = (kind: string, body: D) => Promise<unknown>
const debtKinds = [{ value: 'term', label: 'Term loan' }, { value: 'credit', label: 'Line of credit' }, { value: 'venture', label: 'Venture debt' }]
const debtLabel = (kind: string) => debtKinds.find(k => k.value === kind)?.label ?? kind
const ratioText = (n?: number | null) => n == null ? '' : `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 10000)}${Math.abs(n) % 10000 ? `.${String(Math.abs(n) % 10000).padStart(4, '0').replace(/0+$/, '')}` : ''}`

/** Finance edits assumptions; saving a plan never executes a payment. */
export function FinancingInputs({ view, state, save, remove }: { view: D; state: D; save: Save; remove: (kind: string, id: string) => Promise<unknown> }) {
 const [editing, setEditing] = useState<{ kind: string; row: D } | null>(null)
 const [round, setRound] = useState(0)
 const debt: D[] = view.inputs.debt ?? [], equity: D[] = view.inputs.equity ?? []
 const months: string[] = view.calculation.months
 const currency = state.workspace.currency
 const row = (kind: string) => editing?.kind === kind ? editing.row : null
 const saveInput: Save = async (kind, body) => { await save(kind, body); setEditing(null); setRound(n => n + 1) }
 const removeInput = async (kind: string, id: string) => { await remove(kind, id); if (editing?.kind === kind && editing.row.id === id) setEditing(null) }
 const cancel = () => { setEditing(null); setRound(n => n + 1) }
 const depts = options(view.departments)
 const lines = options(view.lines.filter((l: D) => (l.type === 'cost-of-sales' || l.type === 'operating-expense') && !l.payroll && !l.nonCash))
 const d = row('debt'), e = row('equity')
 return <>
  <section className="card">
   <h2>Debt and credit</h2>
   <p className="muted">Plan borrowing, principal repayments and interest. These assumptions change the forecast; they do not send payments or arrange funding.</p>
   <Table caption="Loans and lines of credit" heads={['Name', 'Type', 'Starts', 'Maturity', 'Opening principal', 'Credit limit', 'Interest rate', '']}>
    {debt.map(r => <tr key={r.id}><td>{r.name}</td><td>{debtLabel(r.debtKind)}</td><td>{monthLabel(r.start)}</td><td>{monthLabel(r.maturity)}</td><td className="num">{money(r.openingCents, currency)}</td><td className="num">{r.debtKind === 'credit' ? money(r.limitCents, currency) : '—'}</td><td>{r.rateKind === 'variable' ? `${r.baseName} + ${decimalText(r.spreadBps)}%` : `${decimalText(r.annualRateBps)}% fixed`}</td><td><Action label="Edit" kind="quiet" run={async () => setEditing({ kind: 'debt', row: r })} /><Action label="Remove" kind="danger" run={() => removeInput('debt', r.id)} /></td></tr>)}
    {!debt.length && <tr><td colSpan={8}>No debt planned.</td></tr>}
   </Table>
   <h3>{d ? `Edit ${d.name}` : 'Add debt or credit'}</h3>
   {!lines.length && <p className="notice">Add an expense line under Settings for interest. Choose a line that is neither payroll nor non-cash.</p>}
   <DebtForm key={`${view.scenario.id}-${d?.id ?? 'new'}-${round}`} row={d} months={months} lines={lines} depts={depts} onSave={body => saveInput('debt', body)} onCancel={d ? cancel : undefined} />
  </section>
  <section className="card">
   <h2>Equity raises</h2>
   <p className="muted">Planned equity raises add cash and equity in the selected month without changing profit.</p>
   <Table caption="Planned equity raises" heads={['Name', 'Month', 'Amount', '']}>
    {equity.map(r => <tr key={r.id}><td>{r.name}</td><td>{monthLabel(r.month)}</td><td className="num">{money(r.amountCents, currency)}</td><td><Action label="Edit" kind="quiet" run={async () => setEditing({ kind: 'equity', row: r })} /><Action label="Remove" kind="danger" run={() => removeInput('equity', r.id)} /></td></tr>)}
    {!equity.length && <tr><td colSpan={4}>No equity raises planned.</td></tr>}
   </Table>
   <h3>{e ? `Edit ${e.name}` : 'Add an equity raise'}</h3>
   <Form key={`${view.scenario.id}-${e?.id ?? 'new-equity'}-${round}`} submit={e ? 'Save equity raise' : 'Add equity raise'} onSubmit={v => saveInput('equity', { ...v, id: e?.id })}>
    <Field label="Equity raise name" name="name" defaultValue={e?.name} />
    <Field label="Funding month" name="month" type="month" defaultValue={e?.month ?? months[0]} />
    <Field label="Amount raised" name="amount" defaultValue={decimalText(e?.amountCents)} />
    {e && <div className="wide"><button type="button" className="quiet" onClick={cancel}>Cancel edit</button></div>}
   </Form>
  </section>
 </>
}

function DebtForm({ row, months, lines, depts, onSave, onCancel }: { row: D | null; months: string[]; lines: Option[]; depts: Option[]; onSave: (body: D) => Promise<unknown>; onCancel?: () => void }) {
 const [debtKind, setDebtKind] = useState(row?.debtKind ?? 'term')
 const [rateKind, setRateKind] = useState(row?.rateKind ?? 'fixed')
 const [amortization, setAmortization] = useState(row?.amortization ?? 'interest-only')
 const first = months[0], last = months.at(-1)
 const outside = (values: D = {}) => Object.fromEntries(Object.entries(values).filter(([month]) => !months.includes(month)).map(([month, value]) => [month, decimalText(value)]))
 const schedule = (values: D, prefix: string) => Object.fromEntries(months.flatMap(month => {
  const value = String(values[`${prefix}-${month}`] ?? '').trim()
  return value ? [[month, value]] : []
 }))
 return <Form submit={row ? 'Save debt' : 'Add debt'} onSubmit={v => {
  const covenants = Object.fromEntries(['minimumCash', 'minimumLiquidity', 'maximumLeverage'].flatMap(key => String(v[key] ?? '').trim() ? [[key, String(v[key]).trim()]] : []))
  return onSave({ id: row?.id, name: v.name, debtKind, line: v.line, department: v.department, start: v.start, maturity: v.maturity,
   opening: v.opening, limit: v.limit || '0', rateKind, annualRate: v.annualRate || '0', baseName: rateKind === 'variable' ? v.baseName : undefined,
   spreadPercent: v.spreadPercent || '0', amortization, amortizationStart: v.amortizationStart || first, termMonths: v.termMonths || '12', covenants,
   draws: { ...outside(row?.drawsCents), ...schedule(v, 'draw') }, repayments: { ...outside(row?.repaymentsCents), ...schedule(v, 'repayment') }, baseRates: rateKind === 'variable' ? { ...outside(row?.baseRatesBps), ...schedule(v, 'base') } : {} })
 }}>
  <Field label="Loan or credit name" name="name" defaultValue={row?.name} />
  <label>Debt type<select aria-label="Debt type" name="debtKind" value={debtKind} onChange={e => setDebtKind(e.target.value)}>{debtKinds.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
  <Field label="Interest expense line" name="line" options={lines} defaultValue={row?.line} />
  <Field label="Department" name="department" options={depts} defaultValue={row?.department} />
  <Field label="Start month" name="start" type="month" defaultValue={row?.start ?? first} />
  <Field label="Maturity month" name="maturity" type="month" defaultValue={row?.maturity ?? last} />
  <Field label="Opening principal" name="opening" defaultValue={row ? decimalText(row.openingCents) : '0'} />
  <Field label="Credit limit" name="limit" required={debtKind === 'credit'} defaultValue={row ? decimalText(row.limitCents) : debtKind === 'credit' ? '' : '0'} hint="Required for a line of credit" />
  <label>Interest rate type<select aria-label="Interest rate type" name="rateKind" value={rateKind} onChange={e => setRateKind(e.target.value)}><option value="fixed">Fixed rate</option><option value="variable">Variable base rate plus margin</option></select></label>
  {rateKind === 'fixed' ? <Field key="fixed-rate" label="Annual interest rate %" name="annualRate" defaultValue={row ? decimalText(row.annualRateBps) : '0'} /> : <>
   <Field key="base-name" label="Base rate name" name="baseName" defaultValue={row?.baseName} hint="For example, the lender's reference rate" />
   <Field key="spread" label="Margin above base rate %" name="spreadPercent" defaultValue={row ? decimalText(row.spreadBps) : '0'} />
  </>}
  <label>Principal repayment plan<select aria-label="Principal repayment plan" name="amortization" value={amortization} onChange={e => setAmortization(e.target.value)}><option value="interest-only">Interest only until maturity</option><option value="equal-principal">Equal principal repayments</option></select></label>
  {amortization === 'equal-principal' && <>
   <Field key="amortization-start" label="Principal repayments start" name="amortizationStart" type="month" defaultValue={row?.amortizationStart ?? first} />
   <Field key="term-months" label="Principal repayment term (months)" name="termMonths" defaultValue={String(row?.termMonths ?? 12)} />
  </>}
  <div className="wide"><h3>Covenants</h3><p className="muted">Leave a threshold empty to omit that test. Tests run each month while the debt is active.</p></div>
  <Field label="Minimum closing cash" name="minimumCash" required={false} defaultValue={decimalText(row?.covenants?.minimumCashCents)} hint="Tests cash at month end" />
  <Field label="Minimum liquidity" name="minimumLiquidity" required={false} defaultValue={decimalText(row?.covenants?.minimumLiquidityCents)} hint="Tests closing cash plus undrawn credit" />
  <Field label="Maximum debt / EBITDA" name="maximumLeverage" required={false} defaultValue={ratioText(row?.covenants?.maximumLeverageBps)} hint="Enter a ratio, such as 3 for 3×. Tests total debt divided by annualized current-month EBITDA." />
  <div className="wide">
   <h3>Monthly borrowing and repayments</h3>
   <p className="muted">Enter additional draws and extra principal repayments in their month. Leave empty months without an event. {rateKind === 'variable' && 'Enter the annual base rate for each applicable month, before the margin.'}</p>
   <Table caption="Debt assumptions by month" heads={['Month', 'Draw', 'Extra principal repayment', ...(rateKind === 'variable' ? ['Annual base rate %'] : [])]}>
    {months.map(month => <tr key={month}><th scope="row">{monthLabel(month)}</th>
     <td><input aria-label={`Draw in ${monthLabel(month)}`} name={`draw-${month}`} inputMode="decimal" defaultValue={decimalText(row?.drawsCents?.[month])} /></td>
     <td><input aria-label={`Extra principal repayment in ${monthLabel(month)}`} name={`repayment-${month}`} inputMode="decimal" defaultValue={decimalText(row?.repaymentsCents?.[month])} /></td>
     {rateKind === 'variable' && <td><input aria-label={`Annual base rate % in ${monthLabel(month)}`} name={`base-${month}`} inputMode="decimal" defaultValue={decimalText(row?.baseRatesBps?.[month])} /></td>}
    </tr>)}
   </Table>
  </div>
  {onCancel && <div className="wide"><button type="button" className="quiet" onClick={onCancel}>Cancel edit</button></div>}
 </Form>
}

const covenantLabel: Record<string, string> = { 'minimum-cash': 'Minimum closing cash', 'minimum-liquidity': 'Minimum liquidity', 'maximum-leverage': 'Maximum debt / EBITDA' }
const statusLabel: Record<string, string> = { pass: 'Met', breach: 'Breach' }
function Trace({ trace }: { trace?: string }) {
 return trace ? <details><summary>How this was calculated</summary><p className="trace" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: '14rem' }}>{trace}</p></details> : null
}

/** Display captured results; older snapshots are never rebuilt in the browser. */
export function FinancingSchedule({ calculation, currency }: { calculation: D; currency: string }) {
 const financing = calculation.financing
 if (!financing) return <section className="card"><h2>Financing</h2><p className="muted">Financing was not captured in this snapshot.</p></section>
 const totals: D[] = financing.totals, rows: D[] = financing.rows ?? [], equityRows: D[] = financing.equityRows ?? [], covenants: D[] = financing.covenants
 return <section className="card">
  <h2>Financing</h2>
  <p className="muted">Borrowing, principal repayments and equity raises affect financing cash. Interest affects profit and operating cash. This is a funding plan; no payments are executed.</p>
  <Table caption="Monthly financing totals" heads={['Month', 'Opening debt', 'Draws', 'Interest', 'Principal repaid', 'Closing debt', 'Equity raised', 'Cumulative equity raised', 'Net financing cash', 'Calculation']}>
   {totals.map(t => <tr key={t.month}><th scope="row">{monthLabel(t.month)}</th>{['openingDebt', 'draws', 'interest', 'repayments', 'closingDebt', 'equityRaised', 'cumulativeEquity', 'financingCash'].map(key => <td className="num" key={key}>{money(t[key], currency)}</td>)}<td><Trace trace={t.trace} /></td></tr>)}
  </Table>
  <h3>Covenant tests</h3>
  <p className="muted">Minimum cash uses closing cash. Liquidity adds undrawn credit. Debt / EBITDA divides total debt by annualized current-month EBITDA; a non-positive EBITDA cannot support that ratio.</p>
  {covenants.length ? <Table caption="Monthly covenant results" heads={['Month', 'Test', 'Threshold', 'Result', 'First breach', 'Calculation']}>
   {covenants.map((c, i) => <tr key={`${c.sourceId}-${c.month}-${c.kind}-${i}`}><th scope="row">{monthLabel(c.month)}</th><td>{covenantLabel[c.kind]}</td><td className="num">{/leverage/i.test(c.kind) ? `${ratioText(c.threshold)}×` : money(c.threshold, currency)}</td><td>{statusLabel[c.status]}</td><td>{c.firstBreachMonth ? monthLabel(c.firstBreachMonth) : 'None'}</td><td><Trace trace={c.trace} /></td></tr>)}
  </Table> : <p className="muted">No covenant tests in this plan.</p>}
  {rows.length > 0 && <>
   <h3>Debt schedule</h3>
   <Table caption="Monthly debt principal and interest" heads={['Month', 'Loan or credit', 'Type', 'Opening principal', 'Draw', 'Interest', 'Principal repaid', 'Closing principal', 'Annual rate', 'Credit limit', 'Calculation']}>
    {rows.map((r, i) => <tr key={`${r.originId}-${r.month}-${i}`}><th scope="row">{monthLabel(r.month)}</th><td>{r.name}</td><td>{debtLabel(r.kind)}</td>{['opening', 'draw', 'interest', 'repayment', 'closing'].map(key => <td className="num" key={key}>{money(r[key], currency)}</td>)}<td className="num">{decimalText(r.annualRateBps)}%</td><td className="num">{r.kind === 'credit' ? money(r.limit, currency) : '—'}</td><td><Trace trace={r.trace} /></td></tr>)}
   </Table>
  </>}
  {equityRows.length > 0 && <>
   <h3>Equity schedule</h3>
   <Table caption="Equity cash contributions" heads={['Month', 'Equity raise', 'Amount', 'Calculation']}>
    {equityRows.map((r, i) => <tr key={`${r.originId}-${r.month}-${i}`}><th scope="row">{monthLabel(r.month)}</th><td>{r.name}</td><td className="num">{money(r.amount, currency)}</td><td><Trace trace={r.trace} /></td></tr>)}
   </Table>
  </>}
 </section>
}
