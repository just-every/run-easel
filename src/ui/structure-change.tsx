import { decimalText, money, monthLabel, Table, type D } from './shared'
import { Dots, glue } from './dots'

function FieldValue({ field, value, currency }: { field: string; value: unknown; currency: string }) {
 if (value == null) return 'Not set'
 if (typeof value === 'number' && field.endsWith('Bps')) return `${decimalText(value)}%`
 if (typeof value === 'number' && field.endsWith('Cents')) return money(value, currency)
 if (typeof value === 'boolean') return value ? 'Yes' : 'No'
 if (typeof value === 'object') return <details><summary>Structured value</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(value, null, 2)}</pre></details>
 return String(value)
}

/** The captured structure change and its effect on each working scenario. */
export function StructureChange({ state, detail }: { state: D; detail: D }) {
 const currencyBefore = detail.structureBefore.workspace[0]?.currency ?? state.workspace.currency
 const currencyAfter = detail.structureAfter.workspace[0]?.currency ?? state.workspace.currency
 const changes: D[] = detail.changes
 const scenarios: D[] = detail.scenarios
 const recordName = (kind: 'line' | 'department', id: string) => {
  if (!id && kind === 'department') return 'No department'
  const change = changes.find(c => c.kind === kind && c.id === id)
  if (change) {
   const before = change.before?.name, after = change.after?.name
   if (before && after && before !== after) return `${before} → ${after}`
   return after ?? before ?? change.name
  }
  return detail.structureAfter[kind]?.find((r: D) => r.id === id)?.name ?? detail.structureBefore[kind]?.find((r: D) => r.id === id)?.name ?? `Unavailable ${kind} (${id})`
 }
 const amount = (value: number | null, unit: string | null) => value == null || unit == null ? 'Unavailable' : money(value, unit)
 return <details style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
  <summary>Model structure version</summary>
  <p>Source model revision: {detail.modelRevisionBefore}</p>
  {changes.length === 0 ? <p>No structure records changed.</p> : changes.map(change => <div key={`${change.kind}:${change.id}`}>
   <Dots as="p"><strong>{change.name}</strong>{change.kind}{change.before === null ? 'Added' : change.after === null ? 'Removed' : 'Changed'}</Dots>
   {change.fields.length > 0 ? <Table caption={`Changed fields: ${change.name}`} heads={['Field', 'Before', 'After']}>
    {change.fields.map((field: D) => <tr key={field.field}>
     <td>{field.field.replace(/(?:Cents|Bps)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c: string) => c.toUpperCase())}{field.field.endsWith('Bps') ? ' %' : ''}</td><td style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: '10rem' }}><FieldValue field={field.field} value={field.before} currency={currencyBefore} /></td><td style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: '10rem' }}><FieldValue field={field.field} value={field.after} currency={currencyAfter} /></td>
    </tr>)}
   </Table> : <p>No field values changed.</p>}
  </div>)}
  {scenarios.length === 0 && <p>No working scenarios were compared.</p>}
  {scenarios.map(scenario => <div key={scenario.id}>
   <Dots as="p"><strong>{glue(scenario.name)}</strong>{`Revision ${scenario.revisionBefore} → ${scenario.revisionAfter}`}</Dots>
   {scenario.currencyBefore && scenario.currencyAfter && scenario.currencyBefore !== scenario.currencyAfter && <p>Difference unavailable because the currencies differ.</p>}
   {scenario.blockedBefore && <p>Before calculation unavailable: {scenario.blockedBefore}</p>}
   {scenario.blockedAfter && <p>After calculation unavailable: {scenario.blockedAfter}</p>}
   {scenario.changedCells.length > 0 ? <Table caption={`Changed cells: ${scenario.name}`} heads={['Month', 'Line', 'Department', `Before (${scenario.currencyBefore ?? 'currency unavailable'})`, `After (${scenario.currencyAfter ?? 'currency unavailable'})`, `Difference (${scenario.currency})`]}>
    {scenario.changedCells.map((cell: D) => <tr key={`${cell.line}:${cell.department}:${cell.month}`}>
     <td>{monthLabel(cell.month)}</td><td>{recordName('line', cell.line)}</td><td>{recordName('department', cell.department)}</td>
     <td className="num">{amount(cell.before, scenario.currencyBefore)}</td><td className="num">{amount(cell.after, scenario.currencyAfter)}</td><td className="num">{amount(cell.difference, scenario.currency)}</td>
    </tr>)}
   </Table> : <p>{scenario.blockedBefore || scenario.blockedAfter ? 'Changed cells unavailable because a calculation could not complete.' : 'No calculated cells changed.'}</p>}
  </div>)}
 </details>
}
