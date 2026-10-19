import { command, Form, type D } from './shared'

/** Current action classification lives separately from the published pack. */
export function PackActionDepartment({ state, pack, decision, refresh }: { state: D; pack: D; decision: D; refresh: () => Promise<void> }) {
 if (state.me.role !== 'finance' || pack.status !== 'published' || pack.progress?.[decision.id]?.status === 'done') return null
 const department = state.actionDepartments?.find((entry: D) => entry.pack === pack.id && entry.decision === decision.id)?.department ?? decision.department ?? ''
 const label = `Department for action: ${decision.text}`
 return <>
  {!department && <p className="muted">This unclassified action stays in the company pack and stays out of department statements until finance assigns a department.</p>}
  <Form key={department} submit="Save action department" onSubmit={async values => {
   await command('pack-action-department', { pack: pack.id, decision: decision.id, department: values.department }); await refresh()
  }}>
   <label>{label}<select aria-label={label} name="department" defaultValue={department}>
    <option value="">Unclassified</option>
    {state.departments.map((entry: D) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
   </select></label>
  </Form>
 </>
}
