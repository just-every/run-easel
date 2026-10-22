import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { Action, api, command, Field, Form, options, Table, type D } from './shared'

/** Explicit group grants keep compensation in its existing owner-only door. */
export function Groups({ state, refresh }: Pick<Shared, 'state' | 'refresh'>) {
 const [report, setReport] = useState<D | null>(null), [selected, setSelected] = useState(''), [error, setError] = useState('')
 useEffect(() => { let live = true; api('access-report').then(v => { if (live) { setReport(v); setError('') } }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [state])
 const group = report?.groups.find((g: D) => g.id === selected)
 const list = (mode: string) => group?.departments[mode] ?? []
 return <section className="card"><h2>Groups and access report</h2>
  <p>Grants add to direct membership. Choose group-managed access on a person's membership to use only their group scope. Removing membership applies immediately. Compensation grants require the signed-in owner.</p>
  {error && <p role="alert" className="error">{error}</p>}
  <label>Edit group<select aria-label="Edit group" value={selected} onChange={e => setSelected(e.target.value)}><option value="">New group</option>{options(report?.groups ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  <Form key={`${group?.id}:${group?.revision}`} submit="Save group grants" onSubmit={async values => {
   const dimensions = Object.fromEntries((state.dimensions ?? []).filter((d: D) => values[`scope-${d.id}`] === 'restricted').map((d: D) => [d.id, { read: values[`read-${d.id}`] ?? [], edit: values[`edit-${d.id}`] ?? [] }]))
   const result = await command('group-save', { id: group?.id, revision: group?.revision, name: values.name, members: values.members, departments: { read: values.read, edit: values.edit, owners: values.owners }, dimensions, capabilities: values.capabilities })
   setSelected(result.id); await refresh()
  }}>
   <Field label="Group name" name="name" defaultValue={group?.name} />
   <Field label="Group people" name="members" multiple required={false} defaultValue={group?.members ?? []} options={(state.members ?? []).filter((m: D) => m.active).map((m: D) => ({ value: m.email, label: `${m.name} (${m.email})` }))} />
   <Field label="Departments: read" name="read" multiple required={false} defaultValue={list('read')} options={options(state.departments)} />
   <Field label="Departments: edit" name="edit" multiple required={false} defaultValue={list('edit')} options={options(state.departments)} />
   <Field label="Statement owner departments" name="owners" multiple required={false} defaultValue={list('owners')} options={options(state.departments)} />
   {(state.dimensions ?? []).map((d: D) => <div key={d.id}><Field label={`${d.name}: scope`} name={`scope-${d.id}`} defaultValue={group?.dimensions[d.id] ? "restricted" : "unrestricted"} options={[{value: "unrestricted", label: "All members, including unassigned"}, {value: "restricted", label: "Only selected members"}]} /><Field label={`${d.name}: read members`} name={`read-${d.id}`} multiple required={false} defaultValue={group?.dimensions[d.id]?.read ?? []} options={options(state.dimensionMembers.filter((m: D) => m.dimension === d.id))} /><Field label={`${d.name}: edit members`} name={`edit-${d.id}`} multiple required={false} defaultValue={group?.dimensions[d.id]?.edit ?? []} options={options(state.dimensionMembers.filter((m: D) => m.dimension === d.id))} /></div>)}
   <Field label="Group capabilities" name="capabilities" multiple required={false} defaultValue={group?.capabilities ?? []} options={['connections', 'model-structure', 'approvals', 'publishing'].map(value => ({ value, label: value }))} />
  </Form>
  {group && <div className="row"><Action label="Delete group" kind="danger" run={async () => { await command('group-delete', { id: group.id, revision: group.revision }); setSelected(''); await refresh() }} />{state.me.owner && <Action label={group.payDetail ? 'Revoke group pay detail' : 'Grant group pay detail'} run={async () => { await command('group-pay', { id: group.id, revision: group.revision, granted: !group.payDetail }); await refresh() }} />}</div>}
  {report && <Table caption="Who can see and change what" heads={['Person', 'Groups', 'Read departments', 'Edit departments', 'Capabilities', 'Compensation', 'Scenario access']}>{report.people.map((p: D) => <tr key={p.email}><th scope="row">{p.name}<small>{p.email}</small></th><td>{p.groups.map((id: string) => report.groups.find((g: D) => g.id === id)?.name).join(', ') || 'Direct membership'}{(['read', 'edit'] as const).map(mode => (p.grants?.[mode] ?? []).map((grant: D, index: number) => <small key={`${mode}-${index}`}>{mode}: {grant.id === 'direct' ? 'Direct membership' : report.groups.find((g: D) => g.id === grant.id)?.name} · {grant.departments === null ? 'All departments' : grant.departments.map((id: string) => state.departments.find((d: D) => d.id === id)?.name).join(', ') || 'No departments'} · {Object.entries(grant.dimensions).map(([id, members]) => `${state.dimensions.find((d: D) => d.id === id)?.name}: ${(members as string[]).map(member => state.dimensionMembers.find((m: D) => m.id === member)?.name ?? 'Unassigned').join(', ') || 'None'}`).join('; ') || 'All dimension members'}</small>))}</td><td>{p.departments.read.map((id: string) => state.departments.find((d: D) => d.id === id)?.name).join(', ') || 'None'}</td><td>{p.departments.edit.map((id: string) => state.departments.find((d: D) => d.id === id)?.name).join(', ') || 'None'}</td><td>{p.capabilities.join(', ') || 'None'}</td><td>{p.payDetail ? 'Granted' : 'No pay detail'}</td><td>{p.scenarios.map((s: D) => `${s.name}: ${s.mode}`).join(', ')}</td></tr>)}</Table>}
 </section>
}
