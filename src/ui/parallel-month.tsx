import { useEffect, useRef, useState } from 'react'
import { FilePicker } from './file-picker'
import { Action, api, command, Field, Form, money, monthLabel, Person, Table, type D } from './shared'
import { Dots } from './dots'

type Classification = { kind: 'mapping' | 'timing' | 'formula' | 'source-data'; explanation: string }
type Difference = { key: string; measure: string; easel: number; old: number; delta: number; classification: Classification | null }
type ComparisonRow = {
 key: string; line: string; department: string; lineName: string; departmentName: string
 actual: number; budget: number; forecast: number; oldActual: number; oldBudget: number; oldForecast: number
 differences: Difference[]
}
type Summary = { id: string; name: string; month: string; status: string; revision: number; sha256: string; signedBy?: string; signedAt?: string }
type Comparison = Summary & { currency: string; source: { file: string; sha256: string }; rows: ComparisonRow[] }
type Source = { month: string; name: string; filename: string; csv: string }
const classifications = [
 { value: 'mapping', label: 'Mapping' }, { value: 'timing', label: 'Timing' },
 { value: 'formula', label: 'Formula' }, { value: 'source-data', label: 'Source data' },
]
const classificationLabel = (kind: string) => classifications.find(c => c.value === kind)?.label ?? kind

function rememberComparison(id: string) {
 const url = new URL(window.location.href)
 if (id) url.searchParams.set('parallelMonth', id)
 else url.searchParams.delete('parallelMonth')
 window.history.replaceState(window.history.state, '', url)
}

/** Finance reviews and signs a persisted comparison of one closed month. */
export function ParallelMonth({ state, month }: { state: D; month: string }) {
 const [summaries, setSummaries] = useState<Summary[]>([])
 const [selected, setSelected] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState('')
 useEffect(() => {
  let live = true
  api(`parallel-month?month=${encodeURIComponent(month)}`).then((records: Summary[]) => {
   if (!live) return
   const remembered = new URL(window.location.href).searchParams.get('parallelMonth')
   const id = records.find(record => record.id === remembered)?.id ?? records[0]?.id ?? ''
   setSummaries(records); setSelected(id); rememberComparison(id); setLoading(false)
  }, e => { if (live) { setError(e.message); setLoading(false) } })
  return () => { live = false }
 }, [month])
 const choose = (id: string) => { setSelected(id); rememberComparison(id) }
 const updateSummary = (record: Comparison) => setSummaries(records => [record, ...records.filter(r => r.id !== record.id)])
 return <section className="card">
  <h2>Parallel month</h2>
  <p className="muted">Compare Easel with your old tool for {monthLabel(month)}, classify every difference, then sign off before switching.</p>
  {loading && <p role="status">Loading comparisons…</p>}
  {error && <p role="alert" className="error">{error}</p>}
  {!loading && !error && <>
   <label>Comparison<select aria-label="Parallel month comparison" value={selected} onChange={e => choose(e.target.value)}>
    <option value="">New comparison</option>
    {summaries.map(record => <option key={record.id} value={record.id}>{record.name} · {record.status}</option>)}
   </select></label>
   {selected
    ? <SavedComparison key={selected} id={selected} state={state} onUpdate={updateSummary} />
    : <NewComparison month={month} currency={state.workspace.currency} onSave={record => { updateSummary(record); choose(record.id) }} />}
  </>}
 </section>
}

function NewComparison({ month, currency, onSave }: { month: string; currency: string; onSave: (record: Comparison) => void }) {
 const [file, setFile] = useState<{ filename: string; csv: string } | null>(null)
 const [preview, setPreview] = useState<{ source: Source; comparison: Comparison } | null>(null)
 const [error, setError] = useState(''), [reading, setReading] = useState(false)
 const live = useRef(true), fileRead = useRef(0)
 useEffect(() => { live.current = true; return () => { live.current = false } }, [])
 return <>
  <p><a href={`/api/easel/parallel-month/template/${month}.csv`} download>Download old-tool comparison template (CSV)</a></p>
  <p className="muted">CSV header: <code style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>line,department,actual,budget,forecast</code>. Use planning line and department IDs; department may be blank. Enter amounts in {currency} as decimals.</p>
  {!preview && <Form submit="Preview parallel month" onSubmit={async values => {
   if (reading) throw new Error('Wait for the CSV file to finish loading')
   if (!file) throw new Error('Choose a CSV file')
   const source = { month, name: String(values.name), ...file }
   const comparison: Comparison = await command('parallel-month-preview', source)
   if (live.current) setPreview({ source, comparison })
  }}>
   <Field label="Comparison name" name="name" />
   <FilePicker label="Old-tool CSV file" button="Choose a CSV file" accept=".csv,text/csv" filename={file?.filename} onFile={async picked => {
    const read = ++fileRead.current
    setFile(null); setError(''); setReading(true)
    try {
     const csv = await picked.text()
     if (live.current && fileRead.current === read) setFile({ filename: picked.name, csv })
    } catch (e) { if (live.current && fileRead.current === read) setError((e as Error).message) }
    finally { if (live.current && fileRead.current === read) setReading(false) }
   }} />
   {reading && <p role="status">Reading CSV…</p>}
   {error && <p role="alert" className="error">{error}</p>}
  </Form>}
  {preview && <>
   <h3>Preview: {preview.comparison.name}</h3>
   <p className="muted">Nothing is saved yet. Save this exact preview to classify its differences.</p>
   <Dots as="p" className="trace">{`Source: ${preview.comparison.source.file}`}<>SHA-256: <span style={{ overflowWrap: 'anywhere' }}>{preview.comparison.source.sha256}</span></></Dots>
   <ComparisonRows comparison={preview.comparison} />
   <p className="trace">Comparison SHA-256: <span style={{ overflowWrap: 'anywhere' }}>{preview.comparison.sha256}</span></p>
   <div className="row">
    <Action label="Save this exact comparison" run={async () => {
     const record: Comparison = await command('parallel-month-save', { ...preview.source, fingerprint: preview.comparison.sha256 })
     if (live.current) onSave(record)
    }} />
    <button type="button" className="quiet" onClick={() => setPreview(null)}>Change source and preview again</button>
   </div>
  </>}
 </>
}

function SavedComparison({ id, state, onUpdate }: { id: string; state: D; onUpdate: (record: Comparison) => void }) {
 const [comparison, setComparison] = useState<Comparison | null>(null), [error, setError] = useState('')
 useEffect(() => {
  let live = true
  api(`parallel-month/${encodeURIComponent(id)}`).then(record => { if (live) setComparison(record) }, e => { if (live) setError(e.message) })
  return () => { live = false }
 }, [id])
 if (error) return <p role="alert" className="error">{error}</p>
 if (!comparison) return <p role="status">Loading comparison…</p>
 const update = (record: Comparison) => { setComparison(record); onUpdate(record) }
 const signed = comparison.status === 'signed'
 const differences = comparison.rows.flatMap(row => row.differences.map(difference => ({ row, difference })))
 const remaining = differences.filter(({ difference }) => !difference.classification?.explanation.trim()).length
 return <>
  <Dots as="h3">{comparison.name}{comparison.status}</Dots>
  <Dots as="p" className="muted">{monthLabel(comparison.month)}{`revision ${comparison.revision}`}{comparison.currency}</Dots>
  <ComparisonRows comparison={comparison} />
  <Dots as="p" className="trace">{`Source: ${comparison.source.file}`}<>SHA-256: <span style={{ overflowWrap: 'anywhere' }}>{comparison.source.sha256}</span></></Dots>
  <p className="trace">Comparison SHA-256: <span style={{ overflowWrap: 'anywhere' }}>{comparison.sha256}</span></p>
  {signed ? <p role="status">Signed off by <Person state={state} email={comparison.signedBy} />{comparison.signedAt && <> at <span style={{ overflowWrap: 'anywhere' }}>{comparison.signedAt.slice(0, 19).replace('T', ' ')}</span></>}. This comparison is frozen.</p> : <>
   <h3>Classify differences</h3>
   <p role="status">{remaining ? `${remaining} of ${differences.length} differences still need a classification and explanation.` : 'Every difference is classified. Ready for finance sign-off.'}</p>
   {differences.map(({ row, difference }) => <details key={difference.key} className="card-row" open={!difference.classification}>
    <summary><Dots>{row.lineName}{row.departmentName || 'No department'}{difference.measure}{difference.classification ? classificationLabel(difference.classification.kind) : 'Unclassified'}</Dots></summary>
    <Dots as="p">{`Easel ${money(difference.easel, comparison.currency)}`}{`old tool ${money(difference.old, comparison.currency)}`}{`difference ${money(difference.delta, comparison.currency)}`}</Dots>
    <Form key={`${difference.key}-${difference.classification?.kind ?? ''}-${difference.classification?.explanation ?? ''}`} submit="Save classification" onSubmit={async values => {
     update(await command('parallel-month-classify', { id: comparison.id, revision: comparison.revision, key: difference.key, kind: values.kind, explanation: values.explanation }))
    }}>
     <Field label={`Classification for ${row.lineName} · ${row.departmentName || 'No department'} · ${difference.measure}`} name="kind" options={classifications} defaultValue={difference.classification?.kind} />
     <Field label={`Explanation for ${row.lineName} · ${row.departmentName || 'No department'} · ${difference.measure}`} name="explanation" type="textarea" defaultValue={difference.classification?.explanation} />
    </Form>
   </details>)}
   {remaining === 0 && <Action label="Sign off this exact comparison" confirm="Sign off this comparison before switching? Its rows and classifications will be frozen with your name and this digest." run={async () => {
    update(await command('parallel-month-sign', { id: comparison.id, revision: comparison.revision, sha256: comparison.sha256 }))
   }} />}
  </>}
 </>
}

function ComparisonRows({ comparison }: { comparison: Comparison }) {
 const { currency, rows } = comparison
 const count = rows.reduce((total, row) => total + row.differences.length, 0)
 return <>
  <Dots as="p">{`${rows.length} line and department rows`}{`${count} differences. Differences are Easel minus the old tool.`}</Dots>
  <Table caption="Parallel month amounts" heads={['Line', 'Department', 'Easel actual', 'Old actual', 'Easel budget', 'Old budget', 'Easel forecast', 'Old forecast']}>
   {rows.map(row => <tr key={row.key}><th scope="row">{row.lineName}<div className="muted">{row.line}</div></th><td>{row.departmentName || 'No department'}{row.department && <div className="muted">{row.department}</div>}</td>{[row.actual, row.oldActual, row.budget, row.oldBudget, row.forecast, row.oldForecast].map((amount, index) => <td key={index} className="num">{money(amount, currency)}</td>)}</tr>)}
  </Table>
  {count > 0 ? <Table caption="Parallel month differences" heads={['Line', 'Department', 'Measure', 'Easel', 'Old tool', 'Difference', 'Classification', 'Explanation']}>
   {rows.flatMap(row => row.differences.map(difference => <tr key={difference.key}><th scope="row">{row.lineName}</th><td>{row.departmentName || 'No department'}</td><td>{difference.measure}</td><td className="num">{money(difference.easel, currency)}</td><td className="num">{money(difference.old, currency)}</td><td className="num">{money(difference.delta, currency)}</td><td>{difference.classification ? classificationLabel(difference.classification.kind) : 'Unclassified'}</td><td className="wrap">{difference.classification?.explanation ?? '—'}</td></tr>))}
  </Table> : <p className="muted">All three amounts match for every row.</p>}
 </>
}
