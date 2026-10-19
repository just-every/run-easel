import { FinancingInputs } from './financing'
import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { AssetInputs } from './assets'
import { defaultScenario } from './overview'
import { Action, api, command, decimalText, Field, Form, money, monthLabel, options, ScenarioPicker, Table, type D, type Option } from './shared'

/** The assumptions behind a scenario: drivers, positions, expenses, schedules, allocations and cash timing. */
export function Plan({ state, refresh }: Shared) {
 const me = state.me
 const editable = state.scenarios.filter((s: D) => s.status === 'working' && ((me.role === 'finance' && (!s.sandbox || s.createdBy === me.email || s.sandbox.grants?.[me.email] === 'edit')) || (s.sandbox && (s.createdBy === me.email || s.sandbox.grants?.[me.email] === 'edit')) || s.kind === 'budget' || (s.kind === 'proposal' && s.createdBy === me.email)))
 const [id, setId] = useState(defaultScenario(editable))
 const [view, setView] = useState<D | null>(null)
 const [editing, setEditing] = useState<D | null>(null)
 const [round, setRound] = useState(0)
 // Only the latest request for the scenario on screen may fill the view.
 const [ticket] = useState({ n: 0 })
 const load = async () => { const mine = ++ticket.n; const value = await api(`scenario/${id}`); if (mine === ticket.n) setView(value) }
 useEffect(() => { setView(null); if (id) void load() }, [id, state])
 if (!editable.length) return <section className="card"><p>There is nothing for you to edit right now. Contributors edit the budget once finance requests their department's submission, and their own proposals.</p></section>
 const save = async (op: string, body: D) => { await command(op, { ...body, scenario: id }); setEditing(null); setRound(r => r + 1); await load(); await refresh() }
 const remove = async (kind: string, inputId: string) => { await command('input-delete', { kind, id: inputId }); await load(); await refresh() }
 const currency = state.workspace.currency
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
  <div className="row spread controls"><ScenarioPicker scenarios={editable} value={id} onChange={v => { setId(v); setEditing(null) }} />{sc && <span>Revision {sc.revision}</span>}</div>
  {sc?.kind === 'proposal' && <p className="notice">Proposal: {sc.request} — changes here stay in this proposal until finance promotes it.</p>}

  <section className="card">
   <h2>Revenue drivers</h2>
   <Table caption="Revenue models" heads={['Name', 'Driver', 'Line', 'Department', 'From', '']}>
    {(inputs.revenue ?? []).map((r: D) => <tr key={r.id}><td>{r.name}</td><td>{r.kind === 'volume' ? `${decimalText(r.startVolume)} units × ${money(r.rateCents, currency)}, ${decimalText(r.growthBps)}% a month` : `${decimalText(r.startCustomers)} customers × ${money(r.arpaCents, currency)}, churn ${decimalText(r.churnBps)}%`}</td><td>{lineName(r.line)}</td><td>{deptName(r.department)}</td><td>{monthLabel(r.start)}</td><td><Action label="Edit" kind="quiet" run={async () => edit('revenue', r)} /><Action label="Remove" kind="danger" run={() => remove('revenue', r.id)} /></td></tr>)}
   </Table>
   <RevenueForm key={form('revenue')?.id ?? `new-revenue-${round}`} row={form('revenue')} lines={revenueLines} depts={depts} allDepts={options(state.departments)} onSave={b => save('revenue', b)} />
  </section>

  <section className="card">
   <h2>Positions</h2>
   <p className="muted">On-costs are your own assumption (for example superannuation and payroll tax); Easel does not calculate payroll.</p>
   <Table caption="Positions" heads={['Title', 'Person', 'Department', 'From', 'To', 'Salary a year', 'On-costs', '']}>
    {(inputs.position ?? []).map((p: D) => <tr key={p.id}><td>{p.title}</td><td>{p.holder || 'To be hired'}</td><td>{deptName(p.department)}</td><td>{monthLabel(p.start)}</td><td>{p.end ? monthLabel(p.end) : '—'}</td><td className="num">{money(p.annualSalaryCents, currency)}</td><td className="num">{decimalText(p.onCostBps)}%</td><td><Action label="Edit" kind="quiet" run={async () => edit('position', p)} /><Action label="Remove" kind="danger" run={() => remove('position', p.id)} /></td></tr>)}
   </Table>
   {(() => { const p = form('position'); return <Form key={p?.id ?? `new-position-${round}`} submit={p ? 'Save position' : 'Add position'} onSubmit={v => save('position', { ...v, id: p?.id })}>
    <Field label="Position title" name="title" defaultValue={p?.title} />
    <Field label="Person" name="holder" required={false} defaultValue={p?.holder} hint="Leave empty for a hire still to be made" />
    <Field label="Department" name="department" options={depts} defaultValue={p?.department} />
    <Field label="Salary line" name="line" options={costLines} defaultValue={p?.line ?? state.lines.find((l: D) => l.payroll)?.id} />
    <Field label="Start month" name="start" type="month" defaultValue={p?.start} />
    <Field label="End month" name="end" type="month" required={false} defaultValue={p?.end} />
    <Field label="Annual salary" name="annualSalary" defaultValue={decimalText(p?.annualSalaryCents)} />
    <Field label="On-costs %" name="onCostPercent" defaultValue={p ? decimalText(p.onCostBps) : '12.00'} />
   </Form> })()}
  </section>

  <section className="card">
   <h2>Expenses</h2>
   <Table caption="Expenses" heads={['Name', 'Line', 'Department', 'Kind', 'Amount', 'From', 'To', '']}>
    {(inputs.expense ?? []).map((e: D) => <tr key={e.id}><td>{e.name}</td><td>{lineName(e.line)}</td><td>{deptName(e.department)}</td><td>{e.kind}</td><td className="num">{money(e.amountCents, currency)}</td><td>{monthLabel(e.start)}</td><td>{e.end ? monthLabel(e.end) : '—'}</td><td><Action label="Edit" kind="quiet" run={async () => edit('expense', e)} /><Action label="Remove" kind="danger" run={() => remove('expense', e.id)} /></td></tr>)}
   </Table>
   {(() => { const e = form('expense'); return <Form key={e?.id ?? `new-expense-${round}`} submit={e ? 'Save expense' : 'Add expense'} onSubmit={v => save('expense', { ...v, id: e?.id })}>
    <Field label="Expense name" name="name" defaultValue={e?.name} />
    <Field label="Expense line" name="line" options={costLines} defaultValue={e?.line} />
    <Field label="Department" name="department" options={depts} defaultValue={e?.department} />
    <Field label="Kind" name="kind" options={[{ value: 'recurring', label: 'Recurring monthly' }, { value: 'one-off', label: 'One-off' }]} defaultValue={e?.kind ?? 'recurring'} />
    <Field label="Amount" name="amount" defaultValue={decimalText(e?.amountCents)} hint="Monthly amount, or the one-off amount" />
    <Field label="Start month" name="start" type="month" defaultValue={e?.start} hint="For a one-off, the month it falls in" />
    <Field label="End month" name="end" type="month" required={false} defaultValue={e?.end} />
   </Form> })()}
  </section>

  {(inputs.schedule ?? []).length > 0 && <section className="card">
   <h2>Monthly schedules</h2>
   <p className="muted">Entered month by month, usually moved in from a workbook; each keeps the sheet and cell it came from.</p>
   <Table caption="Schedules" heads={['Name', 'Line', 'Department', 'Months', 'Total', 'Source', '']}>
    {inputs.schedule.map((s: D) => <tr key={s.id}><td>{s.name}</td><td>{lineName(s.line)}</td><td>{deptName(s.department)}</td><td>{Object.keys(s.values).length}</td><td className="num">{money(Object.values(s.values as Record<string, number>).reduce((a, v) => a + v, 0), currency)}</td><td>{s.provenance ? `${s.provenance.file} ${s.provenance.sheet} row ${s.provenance.row}` : 'entered'}</td><td><Action label="Remove" kind="danger" run={() => remove('schedule', s.id)} /></td></tr>)}
   </Table>
  </section>}

  {view && me.role === 'finance' && <FinancingInputs view={view} state={state} save={save} remove={remove} />}

  {view && <AssetInputs key={`assets-${round}`} view={view} state={state} save={save} remove={remove} />}

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
    <Field label="Costs paid after (months)" name="paymentLag" options={[0, 1, 2, 3].map(n => ({ value: String(n), label: String(n) }))} defaultValue={String(sc.cash.paymentLag)} hint="Payroll is paid in its month" />
    <Field label="Note" name="note" required={false} defaultValue={sc.cash.note} />
   </Form>
  </section>}
 </>
}

function RevenueForm({ row, lines, depts, allDepts, onSave }: { row: D | null; lines: Option[]; depts: Option[]; allDepts: Option[]; onSave: (b: D) => Promise<void> }) {
 const [kind, setKind] = useState(row?.kind ?? 'customers')
 return <Form submit={row ? 'Save revenue model' : 'Add revenue model'} onSubmit={v => onSave({ ...v, id: row?.id, kind })}>
  <label className="wide-select">Driver<select aria-label="Driver" value={kind} onChange={e => setKind(e.target.value)}><option value="customers">Customers × revenue per customer</option><option value="volume">Volume × rate</option></select></label>
  <Field key="name" label="Revenue model name" name="name" defaultValue={row?.name} />
  <Field key="line" label="Revenue line" name="line" options={lines} defaultValue={row?.line} />
  <Field key="department" label="Department" name="department" options={depts} defaultValue={row?.department} />
  <Field key="start" label="Start month" name="start" type="month" defaultValue={row?.start} />
  <Field key="collectionLag" label="Collected after (months)" name="collectionLag" options={[0, 1, 2, 3].map(n => ({ value: String(n), label: String(n) }))} defaultValue={String(row?.collectionLag ?? 1)} />
  {kind === 'volume' ? <>
   <Field key="startVolume" label="Starting volume" name="startVolume" defaultValue={decimalText(row?.startVolume)} />
   <Field key="growthPercent" label="Monthly growth %" name="growthPercent" defaultValue={row ? decimalText(row.growthBps) : '0'} />
   <Field key="rate" label="Rate per unit" name="rate" defaultValue={decimalText(row?.rateCents)} />
  </> : <>
   <Field key="startCustomers" label="Starting customers" name="startCustomers" defaultValue={decimalText(row?.startCustomers)} />
   <Field key="newPerMonth" label="New customers per month" name="newPerMonth" defaultValue={row ? decimalText(row.newPerMonth) : '0'} />
   <Field key="newPerRep" label="New customers per ramped hire" name="newPerRep" defaultValue={row ? decimalText(row.newPerRep) : '0'} />
   <Field key="repDepartment" label="Hiring department" name="repDepartment" required={false} options={allDepts} defaultValue={row?.repDepartment} />
   <Field key="rampMonths" label="Ramp months" name="rampMonths" defaultValue={String(row?.rampMonths ?? 3)} />
   <Field key="churnPercent" label="Monthly churn %" name="churnPercent" defaultValue={row ? decimalText(row.churnBps) : '0'} />
   <Field key="arpa" label="Monthly revenue per customer" name="arpa" defaultValue={decimalText(row?.arpaCents)} />
  </>}
 </Form>
}
