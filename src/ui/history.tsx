import { DimensionFields, dimensionValues } from './dimensions'
import { addMonths, command, decimalText, Field, Form, money, monthLabel, options, Table, type D } from './shared'
import { Dots, glue } from './dots'

type HistoryProps = { state: D; view: D; save: (op: string, body: D) => Promise<void>; refresh: () => Promise<void> }
const named = (rows: D[], id: string, absent: string) => rows.find(row => row.id === id)?.name ?? absent
const lineName = (view: D, id: string) => named(view.lines ?? [], id, 'Planning line unavailable')
const departmentName = (view: D, id: string) => id ? named(view.departments ?? [], id, 'Department unavailable') : 'No department'
const historicalCell = (view: D, line: string, department: string, month: string) => view.actualsHistory?.cells.find((cell: D) => cell.line === line && cell.department === department && cell.month === month)
function actualText(view: D, line: string, department: string, month: string) {
 if (view.actualsHistory?.blockedMonths?.includes(month)) return 'Actuals unavailable; reconcile source'
 const cell = historicalCell(view, line, department, month)
 return cell ? money(cell.amount, view.workspace.currency) : 'Missing'
}
function ActualPair({ view, line, department, month }: { view: D; line: string; department: string; month: string }) {
 return <><small>Actual: {actualText(view, line, department, month)}</small><br /><small>Prior year: {actualText(view, line, department, addMonths(month, -12))}</small></>
}
const enteredValues = (values: D, months: string[], previous: D = {}) => ({
 ...Object.fromEntries(Object.entries(previous).filter(([month]) => !months.includes(month)).map(([month, value]) => [month, decimalText(value as number)])),
 ...Object.fromEntries(months.filter(month => String(values[`amount-${month}`] ?? '').trim() !== '').map(month => [month, values[`amount-${month}`]])),
})

function EnteredSchedule({ view, row, save }: { view: D; row: D; save: HistoryProps['save'] }) {
 const months: string[] = view.calculation.months
 return <Form key={`${row.id}:${view.scenario.revision}`} className="form form-rows" submit={`Save ${row.name}`} onSubmit={values => save('schedule', {
  id: row.id, name: row.name, line: row.line, department: row.department,
  values: enteredValues(values, months, row.values), scenarioRevision: view.scenario.revision,
 })}>
  <Table caption={`${row.name} monthly inputs`} heads={['Schedule', 'Line', 'Department', ...months.map(monthLabel)]}>
   <tr><th scope="row">{row.name}</th><td>{lineName(view, row.line)}</td><td>{departmentName(view, row.department)}</td>{months.map(month => <td key={month}>
    <input aria-label={`${row.name} ${monthLabel(month)} amount`} name={`amount-${month}`} defaultValue={decimalText(row.values[month])} inputMode="decimal" size={12} />
    <ActualPair view={view} line={row.line} department={row.department} month={month} />
   </td>)}</tr>
  </Table>
  {row.provenance && <Dots as="p" className="muted">{`Source: ${row.provenance.file}`}{row.provenance.sheet}{row.provenance.row != null && `row ${row.provenance.row}`}</Dots>}
 </Form>
}

function DerivedSchedule({ view, row }: { view: D; row: D }) {
 const history = row.history
 const sourceName = glue(`${lineName(view, history.sourceLine)} · ${departmentName(view, history.sourceDepartment)}`)
 return <>
  <h3>{row.name}</h3><p>{glue(`${lineName(view, row.line)} · ${departmentName(view, row.department)}`)}. {history.window} actual month(s), starting {history.offset} month(s) earlier from {sourceName}, growth {decimalText(history.growthBps)}%.</p>
  <Table caption={`${row.name} calculated monthly amounts`} heads={['Month', 'Calculated amount', 'Actual', 'Prior-year actual', 'Calculation and sources']}>
   {view.calculation.months.map((month: string) => {
    const sources: D[] = view.calculation.cells.filter((cell: D) => cell.line === row.line && cell.department === row.department && cell.month === month).flatMap((cell: D) => cell.sources.filter((source: D) => source.kind === 'schedule' && source.id === row.originId))
    return <tr key={month}><th scope="row">{monthLabel(month)}</th><td className="num">{sources.length ? money(sources.reduce((sum, source) => sum + source.amount, 0), view.workspace.currency) : 'Unavailable'}</td><td className="num">{actualText(view, row.line, row.department, month)}</td><td className="num">{actualText(view, row.line, row.department, addMonths(month, -12))}</td><td className="wrap">{sources.length ? <details><summary>Show calculation for {monthLabel(month)}</summary>{sources.map((source, i) => <p key={i}>{source.trace}</p>)}</details> : 'No calculated source is available for this month.'}</td></tr>
   })}
  </Table>
 </>
}

/** Actual references stay calculated; only entered schedules expose amount inputs. */
export function HistoryInputs({ state, view, save, refresh }: HistoryProps) {
 const months: string[] = view.calculation.months
 const departments: D[] = (view.departments ?? []).filter((department: D) => state.me.role === 'finance' || state.me.departments.includes(department.id))
 const lines: D[] = view.lines ?? []
 const schedules: D[] = view.inputs.schedule ?? []
 const key = `${view.scenario.id}:${view.scenario.revision}`
 return <>
  <section className="card"><h2>Actual-reference schedules</h2>
   <p className="muted">Use accepted actuals from the same month last year or the three completed months before each plan month. Missing or in-progress source months block calculation; an accepted zero remains zero.</p>
   <Form key={`reference-${key}`} submit="Add actual-reference schedule" onSubmit={values => save('schedule', {
    name: values.name, line: values.line, department: values.department, scenarioRevision: view.scenario.revision,
    history: { sourceLine: values.sourceLine, sourceDepartment: values.sourceDepartment, offset: values.recipe === 'prior-year' ? 12 : 1, window: values.recipe === 'prior-year' ? 1 : 3, growthPercent: values.growthPercent },
   })}>
    <Field label="Schedule name" name="name" />
    <Field label="Target line" name="line" options={options(lines)} />
    <Field label="Target department" name="department" options={options(departments)} />
    <Field label="Actual source line" name="sourceLine" options={options(lines)} />
    <Field label="Actual source department" name="sourceDepartment" options={options(departments)} />
    <Field label="Actual-reference recipe" name="recipe" defaultValue="prior-year" options={[{ value: 'prior-year', label: 'Same month last year' }, { value: 'trailing-three', label: 'Average of prior three months' }]} />
    <Field label="Growth %" name="growthPercent" defaultValue="0" />
   </Form>
   {schedules.filter(row => row.history).map(row => <DerivedSchedule key={row.id} row={row} view={view} />)}
  </section>
  <section className="card"><h2>Monthly budget inputs</h2>
   <p className="muted">Enter amounts in {view.workspace.currency}. Blank months have no entered value. Current and prior-year actuals are shown beside each amount; missing actuals are never treated as zero.</p>
   {schedules.filter(row => row.values && !row.history).map(row => <EnteredSchedule key={`${row.id}:${key}`} row={row} view={view} save={save} />)}
   <details><summary>Add an entered monthly schedule</summary><Form key={`entered-${key}`} submit="Add monthly schedule" onSubmit={values => save('schedule', {
    name: values.name, line: values.line, department: values.department, dimensions: dimensionValues(values), values: enteredValues(values, months), scenarioRevision: view.scenario.revision,
   })}>
    <Field label="Monthly schedule name" name="name" />
    <Field label="Monthly schedule line" name="line" options={options(lines)} />
    <Field label="Monthly schedule department" name="department" options={options(departments)} />
    <DimensionFields structure={view.dimensionStructure ?? {}} />
    {months.map(month => <Field key={month} label={`${monthLabel(month)} amount`} name={`amount-${month}`} required={false} />)}
   </Form></details>
  </section>
  {state.me.role === 'finance' && <section className="card"><h2>Budget from actuals</h2>
   <p className="muted">Create a new budget using each plan month’s accepted actuals from the same month in the prior year. Apply growth by planning line. Every required source month must be complete; missing or in-progress actuals prevent creation.</p>
   <Form key={`seed-${view.scenario.id}`} submit="Create budget from actuals" onSubmit={async values => {
    await command('budget-from-actuals', { name: values.name, growth: Object.fromEntries(lines.map(line => [line.id, values[`growth-${line.id}`]])) })
    await refresh()
   }}>
    <Field label="New budget name" name="name" />
    {lines.map(line => <Field key={line.id} label={`${line.name} growth %`} name={`growth-${line.id}`} defaultValue="0" />)}
   </Form>
  </section>}
 </>
}

/** Aggregate planning amounts alongside the current and prior-year actual source. */
export function ActualHistoryOverlay({ view, department }: { view: D; department?: string }) {
 if (!view.actualsHistory || !view.calculation) return null
 const months: string[] = view.calculation.months
 const relevant = new Set([...months, ...months.map(month => addMonths(month, -12))])
 const cells: D[] = view.calculation.cells
 const pairs = new Map<string, { line: string; department: string }>()
 for (const cell of [...cells, ...view.actualsHistory.cells]) {
  if (!relevant.has(cell.month) || (department && cell.department !== department)) continue
  if (!(view.lines ?? []).some((line: D) => line.id === cell.line)) continue
  pairs.set(`${cell.line}|${cell.department}`, { line: cell.line, department: cell.department })
 }
 return <section className="card"><h2>Actuals alongside the plan</h2>
  {view.actualsHistory.status === 'not-captured' && <p>Historical overlays were not captured for this older version.</p>}
  <p className="muted">Each month shows the current scenario amount, accepted actuals for that month, and the same month in the prior year. Missing means no accepted source cell is available.</p>
  {pairs.size === 0 ? <p>No visible planning or actual-history rows are available.</p> : <Table caption="Plan and accepted actuals by month" heads={['Line', 'Department', ...months.map(monthLabel)]}>
   {[...pairs.values()].map(pair => <tr key={`${pair.line}|${pair.department}`}><th scope="row">{lineName(view, pair.line)}</th><td>{departmentName(view, pair.department)}</td>{months.map(month => {
    const plan = cells.filter(cell => cell.line === pair.line && cell.department === pair.department && cell.month === month)
    return <td className="num" key={month}><span>Scenario: {plan.length ? money(plan.reduce((sum, cell) => sum + cell.amount, 0), view.workspace.currency) : 'No amount'}</span><br /><ActualPair view={view} line={pair.line} department={pair.department} month={month} /></td>
   })}</tr>)}
  </Table>}
 </section>
}
