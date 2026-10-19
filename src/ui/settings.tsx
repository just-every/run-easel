import type { Shared } from './app'
import { Action, api, command, Field, Form, kindLabel, fiscalMonths, Table, type D } from './shared'

/** The plan's calendar, departments, lines, people and account mappings. Finance only. */
export function Settings({ state, refresh }: Shared) {
 const w = state.workspace
 const run = (op: string) => async (v: D, form?: HTMLFormElement) => { await command(op, v); form?.reset(); await refresh() }
 const deptName = (id: string) => state.departments.find((d: D) => d.id === id)?.name ?? '—'
 const target = (t: string) => t === 'excluded' ? 'Excluded' : t === 'cash' ? 'Cash balance' : state.lines.find((l: D) => l.id === t)?.name ?? t
 return <>
  <section className="card">
   <h2>Plan</h2>
   <p><a href="/api/easel/export" download>Download open export (ZIP)</a></p>
   <p className="muted">Table CSVs, scenario Excel workbooks, model JSON, snapshots and original files, with a SHA-256 manifest.</p>
   <Form submit="Save plan settings" onSubmit={run('workspace')}>
    <Field label="Company name" name="name" defaultValue={w.name} />
    <Field label="Reporting currency" name="currency" defaultValue={w.currency} />
    <Field label="Fiscal year starts in month" name="fiscalYearStart" defaultValue={String(w.fiscalYearStart)} options={fiscalMonths} />
    <Field label="First plan month" name="planStart" type="month" defaultValue={w.planStart} />
   </Form>
  </section>
  <section className="card">
   <h2>Departments</h2>
   <Table caption="Departments" heads={['Name', 'Shared costs', '']}>{state.departments.map((d: D) => <tr key={d.id}><td>{d.name}</td><td>{d.shared ? 'Shared (allocated)' : '—'}</td><td><Action kind="danger" label="Delete" run={async () => { await command('department-delete', { id: d.id }); await refresh() }} /></td></tr>)}</Table>
   <Form submit="Add department" onSubmit={run('department')}>
    <Field label="Department name" name="name" />
    <Field label="Shared costs department (allocated to others)" name="shared" type="checkbox" required={false} />
   </Form>
  </section>
  <section className="card">
   <h2>Planning lines</h2>
   <Table caption="Planning lines" heads={['Line', 'Type', 'Payroll', '']}>{state.lines.map((l: D) => <tr key={l.id}><td>{l.name}</td><td>{kindLabel[l.type]}</td><td>{l.payroll ? 'Yes' : '—'}</td><td><Action kind="danger" label="Delete" run={async () => { await command('line-delete', { id: l.id }); await refresh() }} /></td></tr>)}</Table>
   <Form submit="Add line" onSubmit={run('line')}>
    <Field label="Line name" name="name" />
    <Field label="Type" name="type" options={Object.entries(kindLabel).map(([value, label]) => ({ value, label }))} />
    <Field label="Payroll line (paid in its month, pay detail private)" name="payroll" type="checkbox" required={false} />
   </Form>
  </section>
  <section className="card">
   <h2>People</h2>
   <p className="muted">Finance plans everything. Contributors revise and submit their own departments and see only their own people's pay. Viewers read reports and published packs.</p>
   <Table caption="People" heads={['Name', 'Email', 'Role', 'Departments', 'Active', '']}>{state.members.map((m: D) => <tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td>{m.role}</td><td>{m.departments.map(deptName).join(', ') || '—'}</td><td>{m.active ? 'Yes' : 'No'}</td><td><Action kind="quiet" label="Send sign-in invitation" run={async () => { await api('invite', { email: m.email }) }} /></td></tr>)}</Table>
   <Form submit="Add person" onSubmit={run('member')}>
    <Field label="Name" name="name" />
    <Field label="Email" name="email" type="email" />
    <Field label="Role" name="role" options={[{ value: 'contributor', label: 'Contributor' }, { value: 'viewer', label: 'Viewer' }, { value: 'finance', label: 'Finance' }]} />
    <Field label="Departments (contributors)" name="departments" multiple required={false} options={state.departments.map((d: D) => ({ value: d.id, label: d.name }))} />
   </Form>
  </section>
  <section className="card">
   <h2>Account mappings</h2>
   <Table caption="Source accounts" heads={['Account', 'Name', 'Maps to']}>{state.accountMaps.map((m: D) => <tr key={m.id}><td>{m.id}</td><td>{m.name}</td><td>{target(m.target)}</td></tr>)}</Table>
   <p className="muted">Change a mapping from the Actuals preview, or here.</p>
   <Form submit="Save mapping" onSubmit={run('account-map')}>
    <Field label="Source account" name="account" />
    <Field label="Maps to" name="target" options={[...state.lines.map((l: D) => ({ value: l.id, label: l.name })), { value: 'excluded', label: 'Exclude (not planned)' }, { value: 'cash', label: 'Cash balance' }]} />
   </Form>
  </section>
 </>
}
