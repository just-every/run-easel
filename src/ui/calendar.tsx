import { useEffect, useState } from 'react'
import { Action, api, command, Field, Form, Person, Table, useDate, type D } from './shared'
import { Dots, DotText } from './dots'

const STATUS: Record<string, string> = { pending: 'Pending', sending: 'Sending', accepted: 'Accepted', suppressed: 'Suppressed', uncertain: 'Outcome unknown', blocked: 'Blocked', canceled: 'Canceled' }
const CHANNEL: Record<string, string> = { email: 'Email', slack: 'Slack', teams: 'Microsoft Teams', nook: 'Nook', none: '—' }

/** Planning calendar: dated tasks, reminders and escalations in the company zone. */
export function PlanningCalendar({ state }: { state: D }) {
 const displayDate = useDate()
 const [view, setView] = useState<D | null>(null), [error, setError] = useState('')
 const finance = state.me.role === 'finance'
 const reload = async () => { try { setView(await api('calendar')); setError('') } catch (e) { setError((e as Error).message) } }
 useEffect(() => { void reload() }, [state])
 const deptName = (id: string) => id ? state.departments.find((d: D) => d.id === id)?.name ?? id : 'Company-wide'
 return <section className="card" id="planning-calendar">
  <h2>Planning calendar</h2>
  {error && <p role="alert" className="error">{error}</p>}
  {!view && !error && <p role="status">Loading the planning calendar…</p>}
  {view && <>
   <p className="muted">Times are in the company zone, {view.zone}. Owners get a reminder at 09:00 the day before a task is due; an open task escalates to finance at 09:00 on the first weekday after its due date. Shared chat channels get only a generic reminder and a sign-in link.</p>
   {view.tasks.length ? <Table caption="Planning tasks" heads={['Task', 'Owner', 'Due', <Dots>Reminder{'escalation'}</Dots>, 'Status', '']}>
    {view.tasks.map((t: D) => <tr key={t.id}>
     <td className="wrap"><DotText text={t.name} /><Dots as="small">{deptName(t.department)}{t.kind === 'submission' ? 'Department submission' : view.kinds[t.kind]}</Dots></td>
     <td className="wrap">{t.owners.length ? t.owners.map((o: string) => <span key={o} style={{ display: 'block' }}><Person state={state} email={o} /></span>) : 'No active owner'}</td>
     <td><span className="date-token">{displayDate(t.due)}</span></td>
     <td className="wrap">{t.reminderLabel}<small style={{ display: 'block' }}>Escalates {t.escalationLabel}</small></td>
     <td className="wrap"><span className="pill">{t.open ? 'Open' : t.doneLabel}</span>{t.completedAt && <Dots as="small"><Person state={state} email={t.completedBy} /><span className="date-token">{displayDate(t.completedAt)}</span></Dots>}</td>
     <td>{t.open && t.source === 'calendar' && (finance || t.owners.includes(state.me.email)) && <Action label="Mark complete" run={async () => { await command('calendar-task-complete', { id: t.id, revision: t.revision }); await reload() }} />}</td>
    </tr>)}
   </Table> : <p>No planning tasks for you.</p>}
   {finance && <>
    <h3>New planning task</h3>
    <TaskForm state={state} kinds={view.kinds} saved={reload} />
    <h3>Reminders</h3>
    <ReminderSettings view={view} saved={reload} />
    {view.canConnectNook && <NookConnection view={view} saved={reload} />}
   </>}
   {view.deliveries.length > 0 && <Table caption="Reminder and escalation deliveries" heads={['Task', 'Kind', 'Channel', 'Scheduled', 'Sent', 'Outcome', '']}>
    {view.deliveries.map((d: D) => <tr key={d.id}>
     <td className="wrap">{d.taskName}</td><td>{d.kind === 'reminder' ? 'Reminder' : 'Escalation'}</td>
     <td className="wrap">{CHANNEL[d.channel] ?? d.channel}{d.channel === 'email' && <small style={{ display: 'block', overflowWrap: 'anywhere' }}>{d.recipient}</small>}</td>
     <td className="wrap">{d.scheduledLabel}</td><td className="wrap">{d.dispatchedLabel ?? '—'}</td>
     <td className="wrap"><span className="pill">{STATUS[d.status] ?? d.status}</span><small style={{ display: 'block' }}>{d.label ?? d.reason}</small></td>
     <td>{finance && d.status === 'pending' && d.attempts > 0 && <Action label="Retry" kind="quiet" run={async () => { await command('calendar-delivery-retry', { id: d.id }); await reload() }} />}</td>
    </tr>)}
   </Table>}
  </>}
 </section>
}

function TaskForm({ state, kinds, saved }: { state: D; kinds: Record<string, string>; saved: () => Promise<void> }) {
 const [department, setDepartment] = useState('')
 const members: D[] = state.members.filter((m: D) => m.active)
 const owners = department ? members.filter(m => m.role === 'contributor' && m.departments.includes(department)) : [state.me, ...members.filter(m => m.role === 'finance' && m.email !== state.me.email)]
 return <Form submit="Add task" onSubmit={async (v, form) => { await command('calendar-task-save', { kind: v.kind, name: v.name, department, owner: v.owner, due: v.due }); form.reset(); setDepartment(''); await saved() }}>
  <Field label="Task" name="kind" options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} />
  <Field label="Task name" name="name" />
  <label>Department<select aria-label="Department" value={department} onChange={e => setDepartment(e.target.value)}>
   <option value="">Company-wide (finance owns)</option>{state.departments.map((d: D) => <option key={d.id} value={d.id}>{d.name}</option>)}
  </select></label>
  <Field key={department} label="Owner" name="owner" options={owners.map(m => ({ value: m.email, label: `${m.name} · ${m.email}` }))} hint={department ? 'An active contributor assigned to this department.' : 'Active finance.'} />
  <Field label="Due date" name="due" type="date" />
 </Form>
}

function ReminderSettings({ view, saved }: { view: D; saved: () => Promise<void> }) {
 const s = view.schedule, ch = view.channels
 const usable = (['slack', 'teams', 'nook'] as const).filter(c => ch[c].configured && !ch[c].error)
 return <>
  <p>{s?.enabled ? <>Reminders are on, sent as scheduler:calendar for <strong>{s.configuredBy.name}</strong>.</> : 'Reminders are off.'}</p>
  {s?.paused && <p role="alert" className="error">{s.paused}</p>}
  <ul className="plain">{(['slack', 'teams', 'nook'] as const).map(c => <li key={c}>{CHANNEL[c]}: {ch[c].error ?? (ch[c].configured ? `configured${ch[c].host ? ` (${ch[c].host})` : ''}` : c === 'nook' ? 'not connected' : 'not connected — add an incoming webhook in your deployment configuration')}</li>)}</ul>
  <Form submit="Save reminders" onSubmit={async v => { await command('calendar-schedule-save', { enabled: !!v.enabled, channels: usable.filter(c => v[`channel-${c}`]), revision: s?.revision ?? 0 }); await saved() }}>
   <Field label="Send reminders, escalations and digests" name="enabled" type="checkbox" defaultValue={s?.enabled ?? false} />
   {usable.map(c => <Field key={c} label={`Also post a generic reminder to ${CHANNEL[c]}`} name={`channel-${c}`} type="checkbox" defaultValue={s?.channels?.includes(c) ?? false} />)}
  </Form>
 </>
}

function NookConnection({ view, saved }: { view: D; saved: () => Promise<void> }) {
 const nook = view.channels.nook
 const post = async (op: string, body: D) => {
  const r = await fetch(`/api/easel/connections/nook/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({})) as D).error ?? `Request failed (${r.status})`)
  await saved()
 }
 return <>
  <h3>Nook channel</h3>
  {nook.configured ? <><p>Connected to channel {nook.conversation} at {nook.origin} with token ending {nook.suffix}.</p><Action label="Disconnect Nook" kind="quiet" run={() => post('disconnect', {})} /></>
   : <Form submit="Connect Nook" onSubmit={async v => post('connect', { origin: v.origin, conversation: v.conversation, token: v.token })}>
    {nook.error && <p className="error">{nook.error}</p>}
    <Field label="Nook address" name="origin" hint="Your Nook origin, like https://nook.example.com." />
    <Field label="Nook channel ID" name="conversation" />
    <Field label="Integration token" name="token" type="password" hint="Create one in Nook under You → Team → Integration tokens. It is sealed and never exported or archived." />
   </Form>}
 </>
}
