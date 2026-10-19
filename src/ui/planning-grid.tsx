import { useRef, useState, type ClipboardEvent } from 'react'
import { addMonths, command, decimalText, Field, Form, money, monthLabel, Table, type D } from './shared'
import './planning-grid.css'

type Address = { schedule: string; month: string }
type Split = { name: string; amount: string }
type Props = { state: D; view: D; refresh: () => Promise<void> }
const cellKey = (cell: Address) => `${cell.schedule}:${cell.month}`
const columnName = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : columnName(Math.floor(index / 26) - 1) + columnName(index % 26)
const coordinate = (row: number, column: number) => `${columnName(column)}${row + 1}`
const named = (rows: D[], id: string) => rows.find(row => row.id === id)?.name ?? 'Unavailable'

function ActualAmounts({ view, row, month }: { view: D; row: D; month: string }) {
 const amount = (sourceMonth: string) => {
  if (view.actualsHistory?.blockedMonths?.includes(sourceMonth)) return 'Unavailable; reconcile source'
  const cell = view.actualsHistory?.cells?.find((item: D) => item.line === row.line && item.department === row.department && item.month === sourceMonth)
  return cell ? money(cell.amount, view.workspace.currency) : 'Missing'
 }
 return <div className="planning-grid-actuals"><small>Actual: {amount(month)}</small><small>Prior year: {amount(addMonths(month, -12))}</small></div>
}

/** Every edit is reviewed without writing, then saved as one fenced revision. */
export function PlanningGrid({ state, view, refresh }: Props) {
 const schedules: D[] = (view.inputs.schedule ?? []).filter((row: D) => row.values && !row.history)
 const months: string[] = view.calculation.months
 const [draft, setDraft] = useState<Record<string, string>>({})
 const [selection, setSelection] = useState<Set<string>>(new Set())
 const [chosen, setChosen] = useState<Address | null>(null)
 const [note, setNote] = useState('')
 const [splits, setSplits] = useState<Split[]>([])
 const [review, setReview] = useState<{ request: D; result: D } | null>(null)
 const [busy, setBusy] = useState(false)
 const [error, setError] = useState('')
 const [message, setMessage] = useState('')
 const sequence = useRef(0)
 const currency = view.workspace.currency
 const scope = { scenario: view.scenario.id, revision: view.scenario.revision }
 const lines: D[] = view.lines ?? state.lines
 const departments: D[] = view.departments ?? state.departments
 const selected = schedules.flatMap(row => months.map(month => ({ schedule: row.id, month }))).filter(cell => selection.has(cellKey(cell)))
 const valueAt = (cell: Address) => draft[cellKey(cell)] ?? decimalText(schedules.find(row => row.id === cell.schedule)?.values[cell.month])
 const invalidate = () => { ++sequence.current; setReview(null); setError(''); setMessage('') }
 const choose = (cell: Address) => {
  if (chosen && cellKey(chosen) === cellKey(cell)) return
  const row = schedules.find(item => item.id === cell.schedule)
  setChosen(cell); setNote(row?.notes?.[cell.month] ?? '')
  setSplits((row?.subrows?.[cell.month] ?? []).map((split: D) => ({ name: split.name, amount: decimalText(split.amount) })))
 }
 const preview = async (body: D) => {
  if (busy) return
  const ticket = ++sequence.current
  setReview(null); setError(''); setMessage(''); setBusy(true)
  const request = { ...scope, ...body }
  try {
   const result = await command('grid-preview', request)
   if (ticket === sequence.current) setReview({ request, result })
  } catch (err) { if (ticket === sequence.current) setError((err as Error).message) }
  finally { setBusy(false) }
 }
 const paste = (event: ClipboardEvent<HTMLInputElement>, startRow: number, startColumn: number) => {
  event.preventDefault()
  const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n').replace(/\n$/, '')
  const changes = text.split('\n').flatMap((line, row) => line.split('\t').map((value, column) => ({
   schedule: schedules[startRow + row]?.id ?? `outside-row-${startRow + row + 1}`,
   month: months[startColumn + column] ?? addMonths(months[0], startColumn + column),
   value, address: coordinate(startRow + row, startColumn + column),
  })))
  void preview({ changes })
 }
 const save = async () => {
  if (!review || review.result.refused?.length || busy) return
  setBusy(true); setError('')
  try {
   await command('grid-save', { ...review.request, fingerprint: review.result.fingerprint })
   setReview(null); setDraft({}); setSelection(new Set()); setChosen(null); setMessage('Grid changes saved.')
   await refresh()
  } catch (err) { setReview(null); setError((err as Error).message) }
  finally { setBusy(false) }
 }
 const undo = async () => {
  if (busy) return
  invalidate(); setBusy(true)
  try { await command('grid-undo', scope); setDraft({}); setSelection(new Set()); setChosen(null); setMessage('Previous grid save undone.'); await refresh() }
  catch (err) { setError((err as Error).message) }
  finally { setBusy(false) }
 }
 const calculated = new Map<string, D>()
 for (const cell of view.calculation.cells as D[]) {
  const key = `${cell.line}:${cell.department}`
  if (!calculated.has(key)) calculated.set(key, { line: cell.line, department: cell.department, cells: {} })
  calculated.get(key)!.cells[cell.month] = cell
 }
 const chosenRow = schedules.find(row => row.id === chosen?.schedule)
 return <section className="card planning-grid" aria-label="Planning grid" data-revision={view.scenario.revision}>
  <div className="row spread"><h2>Planning grid</h2><button type="button" className="quiet" disabled={busy} onClick={() => void undo()}>Undo last grid save</button></div>
  <p className="muted">Enter {currency} amounts or paste a spreadsheet rectangle into an entered cell. Review every change before applying it. Coordinates start at A1 in the first entered schedule and month.</p>
  {schedules.length === 0 ? <p>Add an entered monthly schedule below to start entering amounts.</p> : <>
   <Table caption="Planning grid monthly inputs" className="planning-grid-table" heads={['Line / department / schedule', ...months.map((month, column) => `${columnName(column)} · ${monthLabel(month)}`)]}>
    {schedules.map((row, rowIndex) => <tr key={row.id}>
     <th scope="row"><span>{rowIndex + 1}. {named(lines, row.line)}</span><small>{named(departments, row.department)}</small><small>{row.name}</small><button type="button" className="quiet" disabled={busy} onClick={() => {
      invalidate(); const next = new Set(selection), all = months.every(month => next.has(cellKey({ schedule: row.id, month })))
      for (const month of months) { const key = cellKey({ schedule: row.id, month }); if (all) next.delete(key); else next.add(key) }
      setSelection(next)
     }}>Select {row.name} months</button></th>
     {months.map((month, column) => {
      const cell = { schedule: row.id, month }, key = cellKey(cell), label = `${row.name} ${monthLabel(month)}`
      return <td key={month} data-selected={selection.has(key)}>
       <label className="check"><input type="checkbox" aria-label={`Select ${label}`} checked={selection.has(key)} disabled={busy} onChange={event => {
        invalidate(); const next = new Set(selection); if (event.target.checked) next.add(key); else next.delete(key); setSelection(next)
       }} />{coordinate(rowIndex, column)}</label>
       <input aria-label={`${label} grid amount`} inputMode="decimal" value={valueAt(cell)} disabled={busy} onFocus={() => choose(cell)} onChange={event => { invalidate(); setDraft(old => ({ ...old, [key]: event.target.value })) }} onPaste={event => paste(event, rowIndex, column)} />
       <ActualAmounts view={view} row={row} month={month} />
       {row.notes?.[month] && <small className="planning-grid-detail">Note: {row.notes[month]}</small>}
       {(row.subrows?.[month] ?? []).map((split: D, index: number) => <small className="planning-grid-detail" key={index}>{split.name}: {money(split.amount, currency)}</small>)}
      </td>
     })}
    </tr>)}
   </Table>
   <div className="row controls"><button type="button" disabled={busy || !Object.keys(draft).length} onClick={() => void preview({ changes: Object.entries(draft).map(([key, value]) => {
    const cell = schedules.flatMap(row => months.map(month => ({ schedule: row.id, month }))).find(item => cellKey(item) === key)!
    return { ...cell, value }
   }) })}>Preview cell edits</button><button type="button" className="quiet" disabled={busy || !selection.size} onClick={() => { invalidate(); setSelection(new Set()) }}>Clear selection</button><span>{selection.size} cells selected</span></div>
   <details className="card-row"><summary>Spread, adjust or copy selected cells</summary>
    <p>Even, proportional and prior-year spreads divide a total across the selection with an exact cent remainder. Percent and amount changes accept negative values. Copy uses the focused cell’s value for selected later months of the same schedule.</p>
    <Form submit="Preview selection changes" onSubmit={async values => {
     if (!selected.length) { setError('Select at least one entered cell.'); return }
     if (values.operation === 'copy' && !chosen) { setError('Focus the cell to copy first.'); return }
     const cells = values.operation === 'copy' ? selected.filter(cell => cell.schedule === chosen!.schedule && cell.month > chosen!.month) : selected
     if (!cells.length) { setError('Select later months of the focused schedule to copy into.'); return }
     await preview({ operation: values.operation, cells, ...(values.operation === 'percent' ? { percent: values.amount } : values.operation === 'copy' ? { value: valueAt(chosen!) } : { amount: values.amount }) })
    }}>
     <Field label="Grid operation" name="operation" defaultValue="even" options={[{ value: 'even', label: 'Spread evenly' }, { value: 'proportional', label: 'Spread by current values' }, { value: 'prior-year', label: 'Spread by prior-year actuals' }, { value: 'percent', label: 'Change by percent' }, { value: 'amount', label: 'Change by amount' }, { value: 'copy', label: 'Copy focused value forward' }]} />
     <Field label="Total, percent or amount change" name="amount" required={false} hint="Ignored when copying the focused value" />
    </Form>
   </details>
   {chosen && chosenRow && <details className="card-row" key={cellKey(chosen)}><summary>Note and split: {chosenRow.name} · {monthLabel(chosen.month)}</summary>
    <p>Named sub-rows become this cell’s total. Detail is available to finance and this department’s contributors.</p>
    <label>Cell note<textarea aria-label="Grid cell note" rows={3} value={note} disabled={busy} onChange={event => { invalidate(); setNote(event.target.value) }} /></label>
    {splits.map((split, index) => <div className="form planning-grid-split" key={index}>
     <label>Sub-row name<input aria-label={`Sub-row ${index + 1} name`} value={split.name} disabled={busy} onChange={event => { invalidate(); setSplits(old => old.map((item, i) => i === index ? { ...item, name: event.target.value } : item)) }} /></label>
     <label>Sub-row amount<input aria-label={`Sub-row ${index + 1} amount`} inputMode="decimal" value={split.amount} disabled={busy} onChange={event => { invalidate(); setSplits(old => old.map((item, i) => i === index ? { ...item, amount: event.target.value } : item)) }} /></label>
     <button type="button" className="quiet" disabled={busy} onClick={() => { invalidate(); setSplits(old => old.filter((_, i) => i !== index)) }}>Remove sub-row {index + 1}</button>
    </div>)}
    <div className="row controls"><button type="button" className="quiet" disabled={busy} onClick={() => { invalidate(); setSplits(old => [...old, { name: '', amount: '' }]) }}>Add named sub-row</button><button type="button" disabled={busy} onClick={() => void preview({ changes: [{ ...chosen, ...(splits.length ? {} : { value: valueAt(chosen) }), note, subrows: splits }] })}>Preview cell note and split</button></div>
   </details>}
  </>}
  {busy && <p role="status">Working…</p>}
  {error && <p role="alert" className="error">{error}</p>}
  {message && <p role="status">{message}</p>}
  {review && <div className="planning-grid-review" aria-label="Grid change preview">
   <h3>Review grid changes</h3><p>Revision {review.result.revision}. Nothing has been saved.</p>
   {(review.result.refused ?? []).length > 0 && <><p role="alert" className="error">The whole change is refused. Correct these cells and preview again.</p><ul>{review.result.refused.map((item: D, index: number) => <li key={index}>{typeof item.address === 'string' ? item.address : JSON.stringify(item.address)}: {item.error}</li>)}</ul></>}
   <Table caption="Grid change preview" heads={['Schedule / month', 'New amount', 'Note and sub-rows']}>
    {(review.result.changes ?? []).map((change: D, index: number) => <tr key={index}><th scope="row">{schedules.find(row => row.id === change.schedule)?.name ?? change.schedule}<small>{monthLabel(change.month)}</small></th><td className="num">{money(change.value, currency)}</td><td className="wrap">{change.note}{(change.subrows ?? []).map((split: D, splitIndex: number) => <div key={splitIndex}>{split.name}: {money(split.amount, currency)}</div>)}</td></tr>)}
   </Table>
   <div className="row controls"><button type="button" disabled={busy || !!review.result.refused?.length || !review.result.changes?.length} onClick={() => void save()}>Apply grid changes</button><button type="button" className="quiet" disabled={busy} onClick={invalidate}>Discard preview</button></div>
  </div>}
  <details><summary>Calculated cells and their traces (read-only)</summary>
   <p className="muted">Driver, formula and scenario totals are calculated. Edit their source assumptions to change them.</p>
   <Table caption="Read-only calculated planning cells" className="planning-grid-table" heads={['Line / department', ...months.map(monthLabel)]}>
    {[...calculated.entries()].map(([key, row]) => <tr key={key}><th scope="row">{named(lines, row.line)}<small>{named(departments, row.department)}</small></th>{months.map(month => {
     const cell = row.cells[month]
     return <td key={month}>{cell ? <><span>{money(cell.amount, currency)}</span><details><summary>Trace {monthLabel(month)}</summary>{cell.sources.map((source: D, index: number) => <p key={index}>{source.trace}</p>)}</details></> : 'No calculated cell'}</td>
    })}</tr>)}
   </Table>
  </details>
 </section>
}
