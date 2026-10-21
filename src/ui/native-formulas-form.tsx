import { useState } from 'react'
import { Field, Form, Table, type D, type Option } from './shared'

type Props = { row: D | null; revision: number; planStart: string; depts: Option[]; lines: Option[]; onSave: (body: D) => Promise<void>; onCancel: () => void }

export function NativeFormulaForm({ row, revision, planStart, depts, lines, onSave, onCancel }: Props) {
 const [shape, setShape] = useState(row?.dimension ? 'dimension' : 'scalar')
 const [unit, setUnit] = useState(row?.unit ?? 'count')
 const [line, setLine] = useState(row?.line ?? '')
 const [memberCount, setMemberCount] = useState<number>(row?.members?.length ?? 1)
 return <Form submit={row ? 'Save formula driver' : 'Add formula driver'} onSubmit={v => onSave({
  id: row?.id, revision, name: v.name, department: v.department, unit, start: v.start,
  ...(v.end ? { end: v.end } : {}),
  ...(unit === 'money' && line ? { line, ...(v.collectionLag !== '' ? { collectionLag: v.collectionLag } : {}) } : {}),
  ...(shape === 'scalar' ? { formula: v.formula } : {
   dimension: v.dimension,
   members: Array.from({ length: memberCount }, (_, i) => ({ name: v[`memberName${i}`], formula: v[`memberFormula${i}`] })),
  }),
 })}>
  <Field label="Formula driver name" name="name" defaultValue={row?.name} />
  <Field label="Department" name="department" options={depts} defaultValue={row?.department} />
  <label>Unit<select aria-label="Unit" value={unit} onChange={e => setUnit(e.target.value)}><option value="count">Count</option><option value="money">Money</option><option value="percent">Percent</option></select></label>
  <label>Formula shape<select aria-label="Formula shape" value={shape} onChange={e => setShape(e.target.value)}><option value="scalar">Scalar driver</option><option value="dimension">Dimension members</option></select></label>
  {unit === 'money' && <div className="field">
   <label>Output line<select aria-label="Output line" value={line} onChange={e => setLine(e.target.value)}><option value="">Driver only</option>{lines.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select></label>
   <small>Optional. Posts this driver to the selected line; dimension members are summed.</small>
  </div>}
  <Field label="Start month" name="start" type="month" defaultValue={row?.start ?? planStart} />
  <Field label="End month" name="end" type="month" required={false} defaultValue={row?.end} />
  {unit === 'money' && line && <Field label="Collected after (months)" name="collectionLag" options={[0, 1, 2, 3].map(n => ({ value: String(n), label: String(n) }))} defaultValue={String(row?.collectionLag ?? 0)} hint="Revenue output collection timing; expenses use scenario payment timing." />}
  {shape === 'scalar' ? <Field label="Formula expression" name="formula" type="textarea" defaultValue={row?.formula} hint={'Use named drivers, for example DRIVER("Tickets per customer") * LOOKUP("Cost per ticket","Region","West") * DRIVER("Customers").'} /> : <>
   <Field label="Dimension name" name="dimension" defaultValue={row?.dimension} hint="A named dimension such as Region. Each member has its own expression." />
   <div className="wide">
    <Table caption="Dimension members" heads={['Member', 'Expression']}>
     {Array.from({ length: memberCount }, (_, i) => <tr key={i}>
      <td><Field label={`Member ${i + 1} name`} name={`memberName${i}`} defaultValue={row?.members?.[i]?.name} /></td>
      <td><Field label={`Member ${i + 1} formula`} name={`memberFormula${i}`} type="textarea" defaultValue={row?.members?.[i]?.formula} /></td>
     </tr>)}
    </Table>
    <div className="row"><button type="button" disabled={memberCount >= 100} onClick={() => setMemberCount(n => n + 1)}>Add member</button>{memberCount > 1 && <button type="button" className="quiet" onClick={() => setMemberCount(n => n - 1)}>Remove last member</button>}</div>
   </div>
  </>}
  <details className="wide" style={{ overflowWrap: 'anywhere' }}>
   <summary>Formula syntax</summary>
   <p>Enter ordinary decimal values; percent drivers use percentage points (10 means 10%). Arithmetic supports +, -, *, / and comparisons =, &lt;&gt;, &lt;, &lt;=, &gt;, &gt;=.</p>
   <p>Reference names in quotes: <code>DRIVER("Customers")</code>, <code>LOOKUP("Cost per ticket","Region","West")</code> or <code>SUM("Regional support","Region")</code>. <code>MEMBER()</code> names the current dimension member.</p>
   <p><code>IF(test,yes,no)</code>, <code>MIN(a,b)</code>, <code>MAX(a,b)</code>, <code>ROUND(value,decimalPlaces)</code> and <code>GROWTH(value,percent)</code> are supported.</p>
   <p><code>PRIOR("Customers",1)</code> reads the previous period. <code>DRIVER("Customers",-2)</code> reads two periods earlier. Use <code>LINE("Revenue","Sales",-1)</code>, <code>ACTUAL("Revenue","Sales",-1)</code> or <code>VERSION("Budget","Revenue","Sales",-1)</code> for a line, actuals or another version; the final offset is optional.</p>
  </details>
  {row && <div className="wide"><button type="button" className="quiet" onClick={onCancel}>Cancel editing</button></div>}
 </Form>
}
