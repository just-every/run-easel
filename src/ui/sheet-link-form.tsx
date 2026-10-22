import { useEffect, useRef, useState } from 'react'
import type { Shared } from './app'
import { Action, addMonths, api, Field, Form, money, monthLabel, options, Table, type D } from './shared'

type Props = Pick<Shared, 'state'> & { saved: () => Promise<void> }
type Rectangle = { startRow: number; startColumn: number; rows: number; columns: number }
type Draft = { body: D; rectangle: Rectangle; schedules: D[] }
type Reviewed = { body: D; preview: D }

function rectangleOf(value: string): Rectangle {
 const match = /^(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6}):\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})$/.exec(value)
 if (!match) throw new Error("Use a sheet-qualified rectangle such as 'Capacity'!B2:C3.")
 const column = (text: string) => [...text.toUpperCase()].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1
 const startRow = Number(match[4]), startColumn = column(match[3])
 const rows = Number(match[6]) - startRow + 1, columns = column(match[5]) - startColumn + 1
 if (rows < 1 || columns < 1 || rows * columns > 2000 || startColumn + columns > 18278) throw new Error('Choose an ordered rectangle with at most 2,000 numeric cells.')
 return { startRow, startColumn, rows, columns }
}

function columnName(index: number) {
 let name = ''
 for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name
 return name
}

/** Choose existing entered rows, then retain the exact source review for saving. */
export function SheetLinkForm({ state, saved }: Props) {
 const [draft, setDraft] = useState<Draft | null>(null)
 const [reviewed, setReviewed] = useState<Reviewed | null>(null)
 const request = useRef(0)
 const working = state.scenarios.filter((s: D) => s.status === 'working' && s.kind !== 'proposal' && !s.sandbox)
 useEffect(() => { request.current++; setDraft(null); setReviewed(null) }, [state])
 const invalidate = () => { request.current++; setDraft(null); setReviewed(null) }
 if (!working.length) return <p>Create a shared working scenario before linking a Google Sheets range.</p>
 return <>
  <h3>Link a numeric range</h3>
  <p className="muted">Each source row maps to an existing entered schedule. Columns map to successive months starting with your first target month. Amounts use the plan currency, {state.workspace.currency}; every cell must contain a number with at most two decimal places.</p>
  <div onChange={invalidate}>
   <Form submit="Choose target rows" onSubmit={async v => {
    const mine = ++request.current
    setDraft(null); setReviewed(null)
    const rectangle = rectangleOf(v.range)
    const view = await api(`scenario/${encodeURIComponent(v.scenario)}`)
    const months = Array.from({ length: rectangle.columns }, (_, i) => addMonths(v.firstMonth, i))
    const planMonths = new Set(Array.from({ length: view.scenario.horizon ?? view.workspace.horizon }, (_, i) => addMonths(view.workspace.planStart, i)))
    const schedules = (view.inputs.schedule ?? []).filter((row: D) => row.originId && !row.history && !row.workbookOrigin && months.every(month =>
     planMonths.has(month) && (!view.scenario.actualsThrough || month > view.scenario.actualsThrough) && Object.hasOwn(row.values ?? {}, month) && !(row.subrows?.[month] ?? []).length))
    if (!schedules.length) throw new Error('No entered native schedule has editable cells for every selected month. Add those cells in Plan, then choose the range again.')
    if (mine === request.current) setDraft({ body: { name: v.name, scenario: v.scenario, spreadsheetId: v.spreadsheetId, range: v.range, firstMonth: v.firstMonth, cadence: v.cadence, hour: Number(v.hour), enabled: true }, rectangle, schedules })
   }}>
    <Field label="Link name" name="name" />
    <Field label="Spreadsheet ID" name="spreadsheetId" hint="The ID between /d/ and /edit in the Google Sheets address." />
    <Field label="Sheet and A1 rectangle" name="range" hint="For example, 'Capacity'!B2:C3. Include the sheet name and both corners; no header or blank cells." />
    <Field label="Working target scenario" name="scenario" options={options(working)} />
    <Field label="First target month" name="firstMonth" type="month" defaultValue={state.workspace.planStart} />
    <Field label="Pull schedule" name="cadence" options={[{ value: 'hourly', label: 'Hourly' }, { value: 'daily', label: 'Daily' }]} hint="The schedule starts only after you review and save the source baseline." />
    <Field label="Daily pull hour" name="hour" defaultValue="8" options={Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')}:00` }))} hint={`Daily schedules use ${state.workspace.timeZone ?? 'the company time zone'}. This hour is ignored for hourly pulls.`} />
   </Form>
  </div>
  {draft && <div onChange={() => { request.current++; setReviewed(null) }}>
   <h3>Map source rows</h3>
   <p>Source columns {columnName(draft.rectangle.startColumn)} through {columnName(draft.rectangle.startColumn + draft.rectangle.columns - 1)} map to {monthLabel(draft.body.firstMonth)} through {monthLabel(addMonths(draft.body.firstMonth, draft.rectangle.columns - 1))}.</p>
   <Form key={JSON.stringify(draft.body)} submit="Preview source baseline" onSubmit={async v => {
    const mine = ++request.current
    setReviewed(null)
    const mappings = Array.from({ length: draft.rectangle.rows }, (_, row) => Array.from({ length: draft.rectangle.columns }, (_, col) => ({
     source: `${columnName(draft.rectangle.startColumn + col)}${draft.rectangle.startRow + row}`, schedule: v[`row-${row}`], month: addMonths(draft.body.firstMonth, col)
    }))).flat()
    const { firstMonth: _firstMonth, ...definition } = draft.body
    const body = { ...definition, mappings }
    const preview = await api('sheet-links/preview', body)
    if (mine === request.current) setReviewed({ body, preview })
   }}>
    {Array.from({ length: draft.rectangle.rows }, (_, row) => <Field key={row} label={`Source row ${draft.rectangle.startRow + row} target schedule`} name={`row-${row}`} options={draft.schedules.map(schedule => ({ value: schedule.id, label: `${schedule.name} · ${state.departments.find((d: D) => d.id === schedule.department)?.name ?? schedule.department}` }))} />)}
   </Form>
  </div>}
  {reviewed && <>
   <h3>Review source baseline</h3>
   <p className="notice">Saving records this baseline and enables {reviewed.preview.cadence} pulls. It leaves the working plan unchanged. Later source changes create a separate submitted proposal for finance to review and promote.</p>
   <p style={{ overflowWrap: 'anywhere' }}>{reviewed.preview.source.spreadsheetId} · {reviewed.preview.source.range}</p>
   <p className="muted">Source read at {reviewed.preview.source.fetchedAt}. Target revision {reviewed.preview.scenarioRevision}.</p>
   <Table caption="Reviewed source baseline and native targets" heads={['Source cell', 'Schedule', 'Month', 'Native now', 'Source baseline']}>
    {reviewed.preview.cells.map((cell: D) => <tr key={cell.source}><td>{cell.source}</td><td>{cell.scheduleName}</td><td>{monthLabel(cell.month)}</td><td className="num">{money(cell.beforeCents, state.workspace.currency)}</td><td className="num">{money(cell.afterCents, state.workspace.currency)}</td></tr>)}
   </Table>
   <p className="muted" style={{ overflowWrap: 'anywhere' }}>Reviewed fingerprint: {reviewed.preview.digest}</p>
   <Action label="Save baseline and enable schedule" run={async () => {
    await api('sheet-links/save', { ...reviewed.body, digest: reviewed.preview.digest })
    invalidate(); await saved()
   }} />
  </>}
 </>
}
