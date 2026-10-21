import { useState } from 'react'
import { NativeFormulaForm } from './native-formulas-form'
import { Action, decimalText, money, monthLabel, options, Table, type D, type Option } from './shared'

type Props = { state: D; view: D; depts: Option[]; save: (op: string, body: D) => Promise<void>; remove: (kind: string, id: string) => Promise<void> }

export function NativeFormulas({ state, view, depts, save, remove }: Props) {
 const [editing, setEditing] = useState<D | null>(null)
 const rows: D[] = view.inputs.formula ?? []
 const values: D[] = view.calculation.formulaValues ?? []
 const departmentName = (id: string) => state.departments.find((d: D) => d.id === id)?.name ?? '—'
 const lineName = (id: string) => state.lines.find((l: D) => l.id === id)?.name ?? '—'
 return <section className="card">
  <h2>Formula drivers</h2>
  <p className="muted">Define reusable drivers or post a money formula to a planning line. Calculated values are read-only; edit the expressions below.</p>
  {rows.length ? <Table caption="Formula definitions" heads={['Name', 'Definition', 'Unit', 'Output', 'Department', 'From', '']}>
   {rows.map(row => <tr key={row.id}>
    <td>{row.name}</td>
    <td className="wrap">{row.dimension ? <details><summary>{row.dimension} ({row.members.length} members)</summary><Table caption={`${row.name}: ${row.dimension}`} heads={['Member', 'Formula']}>{row.members.map((member: D) => <tr key={member.name}><td>{member.name}</td><td className="wrap"><code>{member.formula}</code></td></tr>)}</Table></details> : <code>{row.formula}</code>}</td>
    <td>{row.unit === 'money' ? state.workspace.currency : row.unit === 'percent' ? 'Percent' : 'Count'}</td>
    <td>{row.line ? lineName(row.line) : 'Driver only'}</td><td>{departmentName(row.department)}</td><td>{monthLabel(row.start)}</td>
    <td><Action label="Edit" kind="quiet" run={async () => setEditing(row)} /><Action label="Remove" kind="danger" run={() => remove('formula', row.id)} /></td>
   </tr>)}
  </Table> : <p className="muted">No formula drivers yet.</p>}
  <NativeFormulaForm key={editing?.id ?? 'new'} row={editing} revision={view.scenario.revision} planStart={state.workspace.planStart} depts={depts} lines={options(state.lines)} onSave={async body => { await save('formula', body); setEditing(null) }} onCancel={() => setEditing(null)} />
  <details>
   <summary>Calculated driver values and traces (read-only)</summary>
   {values.length ? <Table caption="Computed formula drivers" heads={['Driver', 'Dimension', 'Member', 'Month', 'Value', 'Trace']}>
    {values.map((value, i) => <tr key={`${value.originId}:${value.member ?? ''}:${value.month}:${i}`}>
     <td>{value.name}</td><td>{value.dimension ?? '—'}</td><td>{value.member ?? '—'}</td><td>{monthLabel(value.month)}</td>
     <td className="num">{value.unit === 'money' ? money(value.value, state.workspace.currency) : `${decimalText(value.value)}${value.unit === 'percent' ? '%' : ''}`}</td>
     <td className="wrap trace">{value.trace}</td>
    </tr>)}
   </Table> : <p className="muted">No calculated driver values for this scenario.</p>}
  </details>
 </section>
}
