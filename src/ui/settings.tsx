import { PlaidConnection } from './plaid-connection'
import { WarehouseInputs } from './warehouse'
import { SheetLinks } from './sheet-links'
import { Entities } from './entities'
import { Groups } from './groups'
import { Dimensions } from './dimensions'
import { BALANCE_TARGETS, balanceTarget } from '../easel/balance-targets'
import { AccountRules } from './account-rules'
import { GaugeConnection } from './gauge-connection'
import type { Shared } from './app'
import { Action, api, command, Field, Form, decimalText, kindLabel, fiscalMonths, US_TIME_ZONES, ENGLISH_LOCALES, DATE_FORMATS, Table, type D } from './shared'
import { Dots } from './dots'

/** The plan's calendar, departments, lines, people and account mappings. Finance only. */
export function Settings({ state, refresh }: Shared) {
 const w = state.workspace
 const run = (op: string) => async (v: D, form?: HTMLFormElement) => { await command(op, v); form?.reset(); await refresh() }
 const deptName = (id: string) => state.departments.find((d: D) => d.id === id)?.name ?? '—'
 const target = (t: string) => t === 'excluded' ? 'Excluded' : balanceTarget(t) ? balanceTarget(t)!.label : state.lines.find((l: D) => l.id === t)?.name ?? t
 return <>
  <section className="card">
   <h2>Plan</h2>
   {state.me.payDetail ? <>
    <p><a href="/api/easel/export" download>Download open export (ZIP)</a></p>
    <p className="muted">Table CSVs, scenario Excel workbooks, model JSON, snapshots and original files, with a SHA-256 manifest.</p>
   </> : <p className="muted">The complete open export includes individual pay detail. Ask the owner for a pay-detail grant to download this archive.</p>}
   <Form submit="Save plan settings" onSubmit={async v => { await command('workspace', v); await refresh() }}>
    <Field label="Company name" name="name" defaultValue={w.name} />
    <Field label="Reporting currency" name="currency" defaultValue={w.currency} />
    <Field label="Fiscal year starts in month" name="fiscalYearStart" defaultValue={String(w.fiscalYearStart)} options={fiscalMonths} />
    <Field label="Plan horizon (months)" name="horizon" type="number" defaultValue={w.horizon} hint="12–60 accounting periods. Frozen plans and existing forecast windows keep their captured horizon." />
    <Dots as="p" className="muted">{w.retailStartDate ? [`Accounting calendar: ${w.calendar ?? 'calendar-month'}`, `first period starts ${w.retailStartDate}. Fixed after setup.`] : `Accounting calendar: ${w.calendar ?? 'calendar-month'}. Fixed after setup.`}</Dots>
    <Field label="Language and region" name="locale" defaultValue={w.locale ?? 'en-US'} options={ENGLISH_LOCALES} />
    <Field label="Date display" name="dateFormat" defaultValue={w.dateFormat ?? 'MM/DD/YYYY'} options={DATE_FORMATS} />
    <Field label="Company time zone" name="timeZone" defaultValue={w.timeZone ?? 'America/New_York'} options={[...US_TIME_ZONES, ...(!US_TIME_ZONES.some(z => z.value === w.timeZone) && w.timeZone ? [{value:w.timeZone,label:w.timeZone}] : [])]} />
    <Field label="First plan month" name="planStart" type="month" defaultValue={w.planStart} />
   </Form>
  </section>
  <section className="card">
   <h2>Departments</h2>
   <Table caption="Departments" heads={['Name', 'Shared costs', 'On-cost default', '']}>{state.departments.map((d: D) => <tr key={d.id}><td>{d.name}</td><td>{d.shared ? 'Shared (allocated)' : '—'}</td><td>{decimalText(d.onCostDefaultBps ?? 0)}%</td><td><Action kind="danger" label="Delete" run={async () => { await command('department-delete', { id: d.id }); await refresh() }} /></td></tr>)}</Table>
   <Form submit="Add department" onSubmit={run('department')}>
    <Field label="Department name" name="name" />
    <Field label="Department on-cost default %" name="onCostDefaultPercent" defaultValue="0" hint="Captured by positions saved without an override; existing positions stay unchanged." />
    <Field label="Shared costs department (allocated to others)" name="shared" type="checkbox" required={false} />
   </Form>
  </section>
  <section className="card">
   <h2>Department compensation defaults</h2>
   <Form submit="Save department default" onSubmit={async v => { const d = state.departments.find((d:D) => d.id === v.department); await command('department',{id:d.id,name:d.name,shared:d.shared,onCostDefaultPercent:v.onCostDefaultPercent}); await refresh() }}>
    <Field label="Department" name="department" options={state.departments.map((d:D)=>({value:d.id,label:d.name}))} />
    <Field label="Department on-cost default %" name="onCostDefaultPercent" defaultValue="0" hint="Applied when a position is next saved with no override. Existing and frozen costs stay unchanged." />
   </Form>
  </section>
  <section className="card">
   <h2>Planning lines</h2>
   <Table caption="Planning lines" heads={['Line', 'Type', 'Cash treatment', '']}>{state.lines.map((l: D) => <tr key={l.id}><td>{l.name}</td><td>{kindLabel[l.type]}</td><td>{l.nonCash ? 'Non-cash' : l.payroll ? 'Payroll' : 'Standard'}</td><td><Action kind="danger" label="Delete" run={async () => { await command('line-delete', { id: l.id }); await refresh() }} /></td></tr>)}</Table>
   <Form submit="Add line" onSubmit={run('line')}>
    <Field label="Line name" name="name" />
    <Field label="Type" name="type" options={Object.entries(kindLabel).map(([value, label]) => ({ value, label }))} />
    <Field label="Payroll line (paid in its month, pay detail private)" name="payroll" type="checkbox" required={false} />
    <Field label="Non-cash expense line" name="nonCash" type="checkbox" required={false} hint="Depreciation and disposal gains or losses do not become cash payments." />
   </Form>
  </section>
  <section className="card">
   <h2>People</h2>
   <p className="muted">Finance plans across departments. Contributors revise and submit their own departments. Pay detail is separate: only the owner can grant it, and a contributor's grant covers only their own departments. Viewers read reports and published packs without individual pay detail. Adding a person does not grant pay access.</p>
   <p className="muted">The owner always has pay access. Finance and administrator access alone do not include it.</p>
   <Table caption="People" heads={['Name', 'Email', 'Role', 'Departments', 'Active', 'Pay detail', '']}>{state.members.map((m: D) => <tr key={m.id}>
    <td>{m.name}</td><td>{m.email}</td><td>{m.role}</td><td>{m.departments.map(deptName).join(', ') || '—'}</td><td>{m.active ? 'Yes' : 'No'}</td>
    <td>{m.role === 'viewer' ? 'Unavailable for viewers' : m.payDetail ? 'Granted' : 'Not granted'}</td>
    <td>
     <Action kind="quiet" label="Send sign-in invitation" run={async () => { await api('invite', { email: m.email }) }} />
     {state.me.owner && m.role !== 'viewer' && <Action kind={m.payDetail ? 'danger' : 'quiet'} label={m.payDetail ? 'Revoke pay detail' : 'Grant pay detail'} run={async () => { await command('pay-detail', { email: m.email, granted: !m.payDetail }); await refresh() }} />}
    </td>
   </tr>)}</Table>
   <Form submit="Add person" onSubmit={run('member')}>
    <Field label="Name" name="name" />
    <Field label="Email" name="email" type="email" />
    <Field label="Role" name="role" options={[{ value: 'contributor', label: 'Contributor' }, { value: 'viewer', label: 'Viewer' }, { value: 'finance', label: 'Finance' }]} />
    <Field label="Group-managed access only" name="groupOnly" type="checkbox" required={false} hint="Use only current group grants. Direct department choices are ignored." />
    <Field label="Departments (contributors)" name="departments" multiple required={false} options={state.departments.map((d: D) => ({ value: d.id, label: d.name }))} />
   </Form>
  </section>
  <Entities state={state} refresh={refresh} />
  <Groups state={state} refresh={refresh} />
  <Dimensions state={state} refresh={refresh} />
  <AccountRules state={state} refresh={refresh} />
  {state.me.role === 'finance' && <GaugeConnection />}
  {state.me.role === 'finance' && <PlaidConnection />}
  {state.me.role === 'finance' && <WarehouseInputs />}
  <SheetLinks state={state} refresh={refresh} />
  <section className="card">
   <h2>Account mappings</h2>
   <Table caption="Source accounts" heads={['Account', 'Name', 'Maps to']}>{state.accountMaps.map((m: D) => <tr key={m.id}><td>{m.id}</td><td>{m.name}</td><td>{target(m.target)}</td></tr>)}</Table>
   <p className="muted">Change a mapping from the Actuals preview, or here.</p>
   <Form submit="Save mapping" onSubmit={run('account-map')}>
    <Field label="Source account" name="account" />
    <Field label="Maps to" name="target" options={[...state.lines.map((l: D) => ({ value: l.id, label: l.name })), { value: 'excluded', label: 'Exclude (not planned)' }, ...BALANCE_TARGETS]} />
   </Form>
  </section>
 </>
}
