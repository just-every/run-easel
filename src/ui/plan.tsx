import { DimensionPlan, DimensionFields, dimensionValues } from './dimensions'
import { WorkbookDrivers } from './workbook-drivers'
import { NativeFormulas } from './native-formulas'
import { CollectionSummary, ExpenseForm, PayrollFields } from './working-capital-inputs'
import { CommercialExpenseForm, CommercialExpenseSummary } from './commercial-costs'
import { GaugeUtilization } from './gauge-utilization'
import { HistoryInputs } from './history'
import { PlanningGrid } from './planning-grid'
import { FinancingInputs } from './financing'
import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { AssetInputs } from './assets'
import { RevenueForm, RevenueSummary } from './revenue'
import { defaultScenario } from './overview'
import { Action, api, command, decimalText, Field, Form, money, monthLabel, options, ScenarioPicker, Table, type D } from './shared'

/** The assumptions behind a scenario: drivers, positions, expenses, schedules, allocations and cash timing. */
export function Plan({ state, refresh }: Shared) {
 const me = state.me
 const editable = state.scenarios.filter((s: D) => s.status === 'working' && ((me.role === 'finance' && (!s.sandbox || s.createdBy === me.email || s.sandbox.grants?.[me.email] === 'edit' || s.effectiveAccess === 'edit')) || (s.sandbox && (s.createdBy === me.email || s.sandbox.grants?.[me.email] === 'edit' || s.effectiveAccess === 'edit')) || s.kind === 'budget' || (s.kind === 'proposal' && s.createdBy === me.email)))
 const [id, setId] = useState(defaultScenario(editable))
 const [view, setView] = useState<D | null>(null)
 const [editing, setEditing] = useState<D | null>(null)
 const [newDimensions, setNewDimensions] = useState<D>({})
 const [round, setRound] = useState(0)
 // Only the latest request for the scenario on screen may fill the view.
 const [ticket] = useState({ n: 0 })
 const load = async () => { const mine = ++ticket.n; const value = await api(`scenario/${id}`); if (mine === ticket.n) setView(value) }
 useEffect(() => { setView(null); if (id) void load() }, [id, state])
 if (!editable.length) return <section className="card"><p>There is nothing for you to edit right now. Contributors edit the budget once finance requests their department's submission, and their own proposals.</p></section>
 const save = async (op: string, body: D) => { await command(op, { ...body, ...(!body.id ? { dimensions: newDimensions } : {}), scenario: id }); setEditing(null); setRound(r => r + 1); await load(); await refresh() }
 const remove = async (kind: string, inputId: string) => { await command('input-delete', { kind, id: inputId }); await load(); await refresh() }
 const currency = view?.workspace.currency ?? state.workspace.currency
 const localState = view ? { ...state, workspace: { ...state.workspace, ...view.workspace } } : state
 const myDepartments = me.role === 'finance' ? state.departments : state.departments.filter((d: D) => me.departments.includes(d.id))
 const deptName = (d: string) => state.departments.find((x: D) => x.id === d)?.name ?? '—'
 const lineName = (l: string) => state.lines.find((x: D) => x.id === l)?.name ?? '—'
 const revenueLines = options(state.lines.filter((l: D) => l.type === 'revenue'))
 const costLines = options(state.lines.filter((l: D) => l.type !== 'revenue'))
 const depts = options(myDepartments)
 const inputs = view?.inputs ?? {}
 const edit = (kind: string, row: D) => setEditing({ kind, row })
 const form = (kind: string) => (editing?.kind === kind ? editing.row : null)
 const sc = view?.scenario
 return <>
  <div className="row spread controls"><ScenarioPicker scenarios={editable} value={id} onChange={v => { setId(v); setEditing(null); setNewDimensions({}) }} />{sc && <span>Revision {sc.revision}</span>}</div>
  {sc?.kind === 'proposal' && <p className="notice">Proposal: {sc.request} — changes here stay in this proposal until finance promotes it.</p>}

  {!!view?.dimensionStructure?.dimension.length && <section className="card" aria-label="Dimensions for new inputs"><h2>Dimensions for new inputs</h2>
   <p>Choose the members for new drivers, positions and expenses in this plan. Existing inputs keep their own members when edited.</p>
   <Form key={id} submit="Use these input dimensions" onSubmit={async values => { setNewDimensions(dimensionValues(values)) }}><DimensionFields structure={view.dimensionStructure} /> </Form>
   <p role="status">{Object.entries(newDimensions).map(([dimension, member]) => `${view.dimensionStructure.dimension.find((d: D) => d.id === dimension)?.name}: ${view.dimensionStructure['dimension-member'].find((m: D) => m.id === member)?.name}`).join(', ') || 'New inputs are unassigned unless this plan supplies its entity.'}</p>
  </section>}

  <section className="card">
   <h2>Revenue drivers</h2>
   <Table caption="Revenue models" heads={['Name', 'Driver', 'Line', 'Department', 'From', '']}>
    {(inputs.revenue ?? []).map((r: D) => <tr key={r.id}><td>{r.name}</td><td><RevenueSummary row={r} currency={currency} /><CollectionSummary row={r} /></td><td>{lineName(r.line)}</td><td>{deptName(r.department)}</td><td>{monthLabel(r.start)}</td><td><Action label="Edit" kind="quiet" run={async () => edit('revenue', r)} /><Action label="Remove" kind="danger" run={() => remove('revenue', r.id)} /></td></tr>)}
   </Table>
   <RevenueForm key={form('revenue')?.id ?? `new-revenue-${round}`} row={form('revenue')} lines={revenueLines} depts={depts} allDepts={options(state.departments)} positions={inputs.position ?? []} payDetail={me.payDetail} onSave={b => save('revenue', b)} />
  </section>

  {me.role === 'finance' && sc && <GaugeUtilization key={`gauge-${sc.id}:${sc.revision}`} scenario={id} revision={sc.revision} drivers={(inputs.revenue ?? []).filter((r: D) => r.kind === 'services')} currency={currency} onChange={async () => { await load(); await refresh() }} />}

  {(inputs['workbook-model'] ?? []).map((book:D)=><WorkbookDrivers key={book.id} book={book} revision={sc.revision} onChange={async()=>{await load();await refresh()}} />)}

  {view && sc && <NativeFormulas key={`formulas-${sc.id}:${sc.revision}`} state={localState} view={view} depts={depts} save={save} remove={remove} />}

  <section className="card">
   <h2>Positions</h2>
   {me.payDetail ? <>
   <p className="muted">On-costs are your own additional assumption. An enabled tax policy adds employer-tax estimates separately; review on-costs to avoid counting the same tax twice. Easel never runs payroll.</p>
   <Table caption="Positions" heads={['Title', 'Person', 'Department', 'From', 'To', 'Base compensation', 'On-costs', '']}>
    {(inputs.position ?? []).map((p: D) => <tr key={p.id}><td>{p.title}</td><td>{p.holder || 'To be hired'}</td><td>{deptName(p.department)}</td><td>{monthLabel(p.start)}</td><td>{p.end ? monthLabel(p.end) : '—'}</td><td className="num">{p.payBasis === 'hourly' ? `${money(p.hourlyRateCents, currency)} × ${decimalText(p.expectedHours)} hours/period` : `${money(p.annualSalaryCents, currency)} a year`}</td><td className="num">{decimalText(p.onCostBps)}%</td><td><Action label="Edit" kind="quiet" run={async () => edit('position', p)} /><Action label="Remove" kind="danger" run={() => remove('position', p.id)} /></td></tr>)}
   </Table>
   {(() => { const p = form('position'); return <Form key={p?.id ?? `new-position-${round}`} submit={p ? 'Save position' : 'Add position'} onSubmit={v => save('position', { ...v, id: p?.id })}>
    <Field label="Position title" name="title" defaultValue={p?.title} />
    <Field label="Person" name="holder" required={false} defaultValue={p?.holder} hint="Leave empty for a hire still to be made" />
    <Field label="Department" name="department" options={depts} defaultValue={p?.department} />
    <Field label="Salary line" name="line" options={costLines} defaultValue={p?.line ?? state.lines.find((l: D) => l.payroll)?.id} />
    <Field label="Start month" name="start" type="month" defaultValue={p?.start} />
    <Field label="Planned start date" name="plannedStartDate" type="date" required={false} defaultValue={p?.plannedStartDate} hint="Optional exact date in the start month; required for day slippage" />
    <Field label="Backfills position" name="backfillOrigin" required={false} options={[{value:"",label:"No backfill"},...(inputs.position ?? []).filter((q: D) => q.id !== p?.id).map((q: D) => ({value:q.originId,label:q.title}))]} defaultValue={p?.backfillOrigin} />
    <Field label="Monthly attrition assumption %" name="attritionPercent" defaultValue={decimalText(p?.attritionBps ?? 0)} hint="Shown as expected departures; does not remove positions or change payroll" />
    <Field label="End month" name="end" type="month" required={false} defaultValue={p?.end} />
    <Field label="Pay basis" name="payBasis" options={[{value:'salary',label:'Annual salary'},{value:'hourly',label:'Hourly rate × expected hours'}]} defaultValue={p?.payBasis ?? 'salary'} />
    <Field label="Hourly pay rate" name="hourlyRate" defaultValue={decimalText(p?.hourlyRateCents ?? 0)} hint="Use zero for salary positions" />
    <Field label="Expected hours per period" name="expectedHours" defaultValue={decimalText(p?.expectedHours ?? 0)} hint="Fixed expected hours in each active accounting period; use zero for salary positions" />
    <Field label="Benefits per person per period" name="benefits" defaultValue={decimalText(p?.benefitsCents ?? 0)} hint="Additional employer cost estimate, excluded from taxable wages and on-costs" />
    <Field label="401(k) employer match estimate %" name="retirementMatchPercent" defaultValue={decimalText(p?.retirementMatchBps ?? 0)} hint="Salary or hourly wages only, excluding commission. No eligibility, employee deferral or statutory-limit calculation." />
    <Field label="Annual salary" name="annualSalary" defaultValue={decimalText(p?.annualSalaryCents)} hint="Use zero for hourly positions" />
    <Field label="Employment type" name="employmentType" options={[{value:'W-2',label:'W-2 employee'},{value:'1099',label:'1099 contractor'}]} defaultValue={p?.employmentType ?? 'W-2'} />
    <Field label="Prior year-to-date taxable wages" name="taxYtdWages" required={false} defaultValue={p?.taxYtdWagesCents === undefined ? '' : decimalText(p.taxYtdWagesCents)} hint="Before the first plan month; required for a continuing W-2 position when tax estimates start midyear" />
    <PayrollFields row={p} />
    <Field label="Commission planning estimate %" name="commissionPercent" defaultValue={decimalText(p?.commissionRateBps ?? 0)} hint="Applies only to explicitly linked contract bookings at start; no on-costs. ASC 340-40 capitalisation is not modelled." />
    <Field label="Commission quota per period" name="commissionQuota" defaultValue={decimalText(p?.commissionQuotaCents ?? 0)} hint="Linked contract bookings only; resets each accounting period. Zero disables attainment." />
    <Field label="Commission accelerators" name="commissionTiers" type="textarea" required={false} defaultValue={(p?.commissionTiers ?? []).map((t: D) => `${decimalText(t.attainmentBps)}:${decimalText(t.rateBps)}`).join('\n')} hint="One attainment %:rate % per line, e.g. 100:15 then 150:20. Higher rates apply only above each threshold." />
    <Field label="Merit increase %" name="meritPercent" defaultValue={decimalText(p?.meritBps ?? 0)} />
    <Field label="Merit effective date" name="meritDate" type="date" required={false} defaultValue={p?.meritDate} hint="One increase, prorated by inclusive UTC days in its first period." />
    <Field label="Position bonus % of annual salary" name="bonusPercent" defaultValue={decimalText(p?.bonusBps ?? 0)} />
    <Field label="Bonus payment period" name="bonusMonth" type="month" required={false} defaultValue={p?.bonusMonth} hint="One bonus, using the annual salary rate at period end. Paid in this period, without on-costs or employer match." />
    <Field label="On-costs %" name="onCostPercent" required={false} defaultValue={p && p.onCostSource !== 'department' ? decimalText(p.onCostBps) : ''} hint="Blank captures the department default when saved; enter 0 to override it with zero. Existing positions keep their captured rate." />
   </Form> })()}
   </> : <p className="muted">Individual positions and pay require a pay-detail grant from the owner. Payroll totals remain available in Overview.</p>}
  </section>

  <section className="card">
   <h2>Expenses</h2>
   <Table caption="Expenses" heads={['Name', 'Line', 'Department', 'Kind', 'Amount', 'From', 'To', '']}>
    {(inputs.expense ?? []).map((e: D) => <tr key={e.id}><td>{e.name}</td><td>{lineName(e.line)}</td><td>{deptName(e.department)}</td><td>{e.kind}</td><td className="num">{['acquisition', 'inventory'].includes(e.kind) ? <CommercialExpenseSummary row={e} currency={currency} /> : money(e.amountCents, currency)}</td><td>{monthLabel(e.start)}</td><td>{e.end ? monthLabel(e.end) : '—'}</td><td><Action label="Edit" kind="quiet" run={async () => edit('expense', e)} /><Action label="Remove" kind="danger" run={() => remove('expense', e.id)} /></td></tr>)}
   </Table>
   {(() => { const e = form('expense'); return e && ['acquisition', 'inventory'].includes(e.kind) ? <CommercialExpenseForm row={e} view={view!} currency={currency} save={save} /> : <ExpenseForm key={e?.id ?? `new-expense-${round}`} row={e} lines={costLines} depts={depts} onSave={v => save('expense', v)} /> })()}
  </section>

  {(inputs.schedule ?? []).length > 0 && <section className="card">
   <h2>Monthly schedules</h2>
   <p className="muted">Entered month by month, usually moved in from a workbook; each keeps the sheet and cell it came from.</p>
   <Table caption="Schedules" heads={['Name', 'Line', 'Department', 'Months', 'Total', 'Source', '']}>
    {inputs.schedule.map((s: D) => <tr key={s.id}><td>{s.name}</td><td>{lineName(s.line)}</td><td>{deptName(s.department)}</td><td>{s.history ? 'Actual reference' : Object.keys(s.values).length}</td><td className="num">{s.history ? 'Calculated' : money(Object.values(s.values as Record<string, number>).reduce((a, v) => a + v, 0), currency)}</td><td>{s.provenance ? `${s.provenance.file} ${s.provenance.sheet}${s.provenance.row == null ? '' : ` row ${s.provenance.row}`}` : 'entered'}</td><td><Action label="Remove" kind="danger" run={() => remove('schedule', s.id)} /></td></tr>)}
   </Table>
  </section>}

  {view && <DimensionPlan state={state} view={view} refresh={refresh} />}

  {view && <PlanningGrid key={`grid-${sc.id}:${sc.revision}`} state={state} view={view} refresh={refresh} />}

  {view && <HistoryInputs state={state} view={view} save={save} refresh={refresh} />}

  {view && me.role === 'finance' && <FinancingInputs view={view} state={localState} save={save} remove={remove} />}

  {view && <AssetInputs key={`assets-${round}`} view={view} state={localState} save={save} remove={remove} />}

  {me.role === 'finance' && <section className="card">
   <h2>Shared-cost allocation</h2>
   <Table caption="Allocation rules" heads={['Name', 'From', 'Basis', 'To', '']}>
    {(inputs.allocation ?? []).map((a: D) => <tr key={a.id}><td>{a.name}</td><td>{deptName(a.sourceDepartment)}</td><td>{a.basis === 'headcount' ? 'Headcount each month' : 'Fixed shares'}</td><td>{a.targets.map((t: D) => `${deptName(t.department)}${t.bps !== undefined ? ` ${decimalText(t.bps)}%` : ''}`).join(', ')}</td><td><Action label="Remove" kind="danger" run={() => remove('allocation', a.id)} /></td></tr>)}
   </Table>
   <Form key={`allocation-${round}`} submit="Add allocation" onSubmit={v => save('allocation', { name: v.name, sourceDepartment: v.sourceDepartment, basis: v.basis, targets: (v.targets as string[]).map((d: string) => ({ department: d, percent: v[`share-${d}`] })) })}>
    <Field label="Allocation name" name="name" />
    <Field label="Shared department" name="sourceDepartment" options={options(state.departments.filter((d: D) => d.shared))} />
    <Field label="Basis" name="basis" options={[{ value: 'headcount', label: 'Headcount each month' }, { value: 'fixed', label: 'Fixed shares' }]} defaultValue="headcount" />
    <Field label="Receiving departments" name="targets" multiple options={options(state.departments.filter((d: D) => !d.shared))} />
    {state.departments.filter((d: D) => !d.shared).map((d: D) => <Field key={d.id} label={`Fixed share for ${d.name} %`} name={`share-${d.id}`} required={false} />)}
   </Form>
  </section>}

  {me.role === 'finance' && sc && <section className="card">
   <h2>Opening cash and timing</h2>
   <p className="muted">Opening cash is {sc.cash.basis === 'imported' ? `imported from ${sc.cash.importedFrom?.rows ?? 0} accepted actuals rows mapped to the cash balance` : 'an estimate'}: {money(sc.cash.openingCents, currency)}.</p>
   <Form key={`cash-${sc.revision}`} submit="Save cash settings" onSubmit={v => save('scenario-cash', v)}>
    <Field label="Opening cash basis" name="basis" options={[{ value: 'estimate', label: 'Estimate I enter' }, { value: 'imported', label: 'Imported from actuals' }]} defaultValue={sc.cash.basis} hint="Imported cash uses the mapped cash balance account before the first plan month." />
    <Field label="Opening cash (estimate)" name="opening" required={false} defaultValue={decimalText(sc.cash.openingCents)} />
    <Field label="Opening receivables" name="receivables" defaultValue={decimalText(sc.cash.receivablesCents)} hint="Collected in the first plan month" />
    <Field label="Opening payables" name="payables" defaultValue={decimalText(sc.cash.payablesCents)} hint="Paid in the first plan month" />
    <Field label="Revenue collected after (months)" name="collectionLag" options={[0, 1, 2, 3].map(n => ({ value: String(n), label: String(n) }))} defaultValue={String(sc.cash.collectionLag)} />
    <Field label="Costs paid after (months)" name="paymentLag" options={[0, 1, 2, 3].map(n => ({ value: String(n), label: String(n) }))} defaultValue={String(sc.cash.paymentLag)} hint="Payroll uses its entered pay date, or its earned month when no date is set." />
    <Field label="Note" name="note" required={false} defaultValue={sc.cash.note} />
   </Form>
  </section>}
 </>
}
