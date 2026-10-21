import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { api, command, Field, Form, money, monthLabel, options, Table, Action, type D } from './shared'

/** Structure uses the same forms and table frames as the existing settings. */
export function Dimensions({ state, refresh }: Pick<Shared, 'state' | 'refresh'>) {
 const [dimension, setDimension] = useState(state.dimensions?.[0]?.id ?? '')
 const members = (state.dimensionMembers ?? []).filter((m: D) => m.dimension === dimension)
 const save = (op: string) => async (b: D, form: HTMLFormElement) => { const result = await command(op, b); if (op === 'dimension') setDimension(result.id); form.reset(); await refresh() }
 return <section className="card" aria-label="Dimensions and account hierarchy">
  <h2>Dimensions and account hierarchy</h2>
  <Form submit="Add dimension" onSubmit={save('dimension')}><Field label="Dimension name" name="name" /></Form>
  <label>Manage dimension<select aria-label="Manage dimension" value={dimension} onChange={e => setDimension(e.target.value)}><option value="">Choose…</option>{options(state.dimensions ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  <Table caption="Dimension members" heads={['Member', 'Parent', '']}>{members.map((m: D) => <tr key={m.id}><td>{m.name}</td><td>{members.find((p: D) => p.id === m.parent)?.name ?? 'Total'}</td><td><Action label="Delete" kind="danger" run={async () => { await command('dimension-member-delete', { id: m.id }); await refresh() }} /></td></tr>)}</Table>
  {dimension && <Form key={dimension} submit="Save dimension member" onSubmit={async (b, form) => { await command('dimension-member', { ...b, dimension, id: b.id || undefined }); form.reset(); await refresh() }}>
   <Field label="Existing member to change" name="id" required={false} options={[{ value: '', label: 'New member' }, ...options(members)]} />
   <Field label="Member name" name="name" /><Field label="Parent member" name="parent" required={false} options={[{ value: '', label: 'Root' }, ...options(members)]} />
  </Form>}
  <h3>Account groups</h3>
  <Table caption="Account groups" heads={['Name', 'Parent', 'Type']}>{(state.lineGroups ?? []).map((g: D) => <tr key={g.id}><td>{g.name}</td><td>{state.lineGroups.find((p: D) => p.id === g.parent)?.name ?? 'Root'}</td><td>{g.type}</td></tr>)}</Table>
  <Form submit="Save account group" onSubmit={async (b, form) => { await command('line-group', { ...b, id: b.id || undefined }); form.reset(); await refresh() }}>
   <Field label="Existing account group" name="id" required={false} options={[{ value: '', label: 'New group' }, ...options(state.lineGroups ?? [])]} />
   <Field label="Account group name" name="name" /><Field label="Account group type" name="type" options={[{ value: 'revenue', label: 'Revenue' }, { value: 'cost-of-sales', label: 'Cost of sales' }, { value: 'operating-expense', label: 'Operating expense' }]} />
   <Field label="Parent account group" name="parent" required={false} options={[{ value: '', label: 'Root' }, ...options(state.lineGroups ?? [])]} />
  </Form>
  <Form submit="Assign line to account group" onSubmit={save('line-hierarchy')}><Field label="Planning line" name="line" options={options(state.lines)} /><Field label="Line account group" name="parent" required={false} options={[{ value: '', label: 'No group' }, ...options(state.lineGroups ?? [])]} /></Form>
  <h3>Source dimension rules</h3>
  <Table caption="Source dimension rules" heads={['Source', 'Match', 'Dimension member', '']}>{(state.dimensionMaps ?? []).map((r: D) => <tr key={r.id}><td>{r.sourceKind}: {r.source}</td><td>{r.match}</td><td>{state.dimensionMembers.find((m: D) => m.id === r.member)?.name}</td><td><Action label="Delete" run={async () => { await command('dimension-map-delete', { id: r.id }); await refresh() }} /></td></tr>)}</Table>
  {dimension && <Form key={`map-${dimension}`} submit="Save source dimension rule" onSubmit={async (b, form) => { await command('dimension-map', { ...b, dimension }); form.reset(); await refresh() }}>
   <Field label="Source dimension kind" name="sourceKind" options={['department', 'class', 'tracking-option'].map(value => ({ value, label: value }))} />
   <Field label="Source member value" name="source" /><Field label="Source member match" name="match" defaultValue="exact" options={[{ value: 'exact', label: 'Exact' }, { value: 'prefix', label: 'Prefix' }]} /><Field label="Mapped member" name="member" options={options(members)} />
  </Form>}
 </section>
}

export function DimensionFields({ structure, values = {} }: { structure: D; values?: D }) {
 return <>{(structure.dimension ?? []).map((d: D) => <Field key={d.id} label={`Dimension: ${d.name}`} name={`dimension-${d.id}`} defaultValue={values[d.id] ?? ''} required={false} options={[{ value: '', label: 'Unassigned' }, ...options((structure['dimension-member'] ?? []).filter((m: D) => m.dimension === d.id))]} />)}</>
}
export const dimensionValues = (b: D) => Object.fromEntries(Object.entries(b).filter(([key, value]) => key.startsWith('dimension-') && value).map(([key, value]) => [key.slice(10), value]))

export function DimensionPlan({ state, view, refresh }: Pick<Shared, 'state' | 'refresh'> & { view: D }) {
 const [dimension, setDimension] = useState(''), [member, setMember] = useState(''), [actuals, setActuals] = useState(false)
 const [report, setReport] = useState<D | null>(null), [error, setError] = useState('')
 const structure = view.dimensionStructure ?? { dimension: [], 'dimension-member': [] }
 const path = `dimension-report/${actuals ? 'actuals' : view.scenario.id}?${new URLSearchParams({ ...(dimension ? { dimension } : {}), ...(member ? { member } : {}) })}`
 useEffect(() => { let live = true; setReport(null); setError(''); api(path).then(r => { if (live) setReport(r) }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [path, view])
 const inputOptions = Object.entries(view.inputs).flatMap(([kind, rows]) => (rows as D[]).map(row => ({ value: `${kind}|${row.id}`, label: row.name ?? row.title ?? kind })))
 return <section className="card" aria-label="Dimension planning and reports">
  <h2>Dimension planning and reports</h2>
  {view.scenario.status === 'working' && <Form submit="Save input dimensions" onSubmit={async b => { const [kind, id] = b.input.split('|'); await command('input-dimensions', { scenario: view.scenario.id, revision: view.scenario.revision, kind, id, dimensions: dimensionValues(b) }); await refresh() }}>
   <Field label="Input to classify" name="input" options={inputOptions} /><DimensionFields structure={structure} />
  </Form>}
  <div className="row controls">
   <label>Report dimension<select aria-label="Report dimension" value={dimension} onChange={e => { setDimension(e.target.value); setMember('') }}><option value="">All dimensions</option>{options(structure.dimension).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
   <label>Report member<select aria-label="Report member" value={member} onChange={e => setMember(e.target.value)}><option value="">All members</option>{options(structure['dimension-member'].filter((m: D) => m.dimension === dimension)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
   <label className="check"><input aria-label="Accepted dimension actuals" type="checkbox" checked={actuals} onChange={e => setActuals(e.target.checked)} />Accepted actuals</label>
  </div>
  {error && <p role="alert" className="error">{error}</p>}
  {report && <>
   <p><a href={`/api/easel/dimension-report/${actuals ? 'actuals' : view.scenario.id}/document.xlsx?${path.split('?')[1]}`} download>Download dimension report Excel</a></p>
   {report.blocked.length > 0 && <p role="status">Some source members need mapping. Dependent line cells are unavailable; independent lines remain readable.</p>}
   <Table caption="Dimension rollups" heads={['Dimension / member', ...report.months.map(monthLabel)]}>{report.dimensions.flatMap((d: D) => d.members.map((m: D) => <tr key={`${d.id}:${m.id}`}><th scope="row">{d.name}: {m.name}{m.rollup ? ' (rollup)' : ''}</th>{report.months.map((month: string) => <td className="num" key={month}>{m.amounts[month] === null ? 'Unavailable' : money(m.amounts[month], report.currency)}</td>)}</tr>))}</Table>
   <Table caption="Account hierarchy subtotals" heads={['Account group', ...report.months.map(monthLabel)]}>{report.accountHierarchy.map((g: D) => <tr key={g.id}><th scope="row">{g.name}</th>{report.months.map((month: string) => <td key={month} className="num">{g.amounts[month] === null ? 'Unavailable' : money(g.amounts[month], report.currency)}</td>)}</tr>)}</Table>
  </>}
 </section>
}
