import { useDate } from './shared'
import { useEffect, useState } from 'react'
import { Action, api, command, decimalText, Field, Form, money, monthLabel, Person, Table, type D } from './shared'

type MetricRule = {
 id: string; name: string; kind: 'overspend' | 'runway'; department?: string; owner: string
 dueDays: number; enabled: boolean; percentBps: number; amountCents: number; runwayHundredths: number
 revision: number; currency: string; lastEvaluatedAt?: string; blocked?: string
}
type MetricTask = {
 id: string; name: string; rule: string; ruleRevision: number; scenario: string; month: string
 owner: string; due: string; status: 'open' | 'done'; revision: number
 evidence: { summary: string; currency: string; sources: string[] }
 completedBy?: string; completedAt?: string
}
type MetricList = { rules: MetricRule[]; tasks: MetricTask[] }
type RefreshResult = { created: string[]; blocked: { rule: string; reason: string }[] }

/** Rule management stays with finance; task visibility comes from the server. */
export function MetricTasks({ state }: { state: D }) {
 const displayDate = useDate()
 const [list, setList] = useState<MetricList | null>(null), [error, setError] = useState('')
 const [editing, setEditing] = useState<MetricRule | null>(null), [newForm, setNewForm] = useState(0)
 const [checked, setChecked] = useState<RefreshResult | null>(null)
 const finance = state.me.role === 'finance', visible = finance || state.me.role === 'contributor'
 useEffect(() => {
  let live = true
  if (visible) api('metric-tasks').then((value: MetricList) => { if (live) { setList(value); setError('') } }, e => { if (live) setError((e as Error).message) })
  return () => { live = false }
 }, [state, visible])
 const reload = async () => {
  try { setList(await api('metric-tasks')); setError('') }
  catch (e) { setError((e as Error).message); throw e }
 }
 if (!visible) return null
 const departmentName = (id?: string) => state.departments.find((d: D) => d.id === id)?.name ?? id ?? 'Company'
 const ruleName = (id: string) => list?.rules.find(r => r.id === id)?.name ?? id
 return <>
  {finance && <section className="card">
   <h2>Metric rules</h2>
   <p className="muted">Overspend must strictly exceed both the percentage and amount thresholds. A zero budget needs positive actual spend above the amount threshold. Runway triggers below its threshold. Tasks are tracked here in Easel.</p>
   <Action label="Check metric rules" run={async () => {
    const result: RefreshResult = await command('metric-refresh', {})
    setChecked(result); await reload()
   }} />
   {checked && <div role="status">
    <p>{checked.created.length} {checked.created.length === 1 ? 'task created' : 'tasks created'}.</p>
    {checked.blocked.length > 0 && <ul>{checked.blocked.map((b, i) => <li key={`${b.rule}-${i}`}><strong>{ruleName(b.rule)}</strong>: {b.reason}</li>)}</ul>}
   </div>}
   {list && (list.rules.length ? <Table caption="Metric rules" heads={['Rule', 'Threshold', 'Owner and due', 'Status', 'Last checked', '']}>
    {list.rules.map(rule => <tr key={rule.id}>
     <td className="wrap">{rule.name}<small style={{ display: 'block' }}>Revision {rule.revision}</small></td>
     <td className="wrap">{rule.kind === 'overspend' ? <>{departmentName(rule.department)} overspend above {decimalText(rule.percentBps)}% and {money(rule.amountCents, rule.currency)}</> : <>Runway below {decimalText(rule.runwayHundredths)} months</>}</td>
     <td className="wrap"><Person state={state} email={rule.owner} /><small style={{ display: 'block' }}>Due {rule.dueDays} UTC calendar {rule.dueDays === 1 ? 'day' : 'days'} after trigger</small></td>
     <td className="wrap"><span className="pill">{rule.enabled ? 'Enabled' : 'Disabled'}</span>{rule.blocked && <p className="error">{rule.blocked}</p>}</td>
     <td><span className="date-token">{rule.lastEvaluatedAt ? displayDate(rule.lastEvaluatedAt) : 'Not checked'}</span></td>
     <td><button type="button" className="quiet" onClick={() => setEditing(rule)}>Edit rule</button></td>
    </tr>)}
   </Table> : <p>No metric rules yet.</p>)}
   <h3>{editing ? `Edit ${editing.name}` : 'New metric rule'}</h3>
   {editing && <button type="button" className="quiet" onClick={() => { setEditing(null); setNewForm(n => n + 1) }}>Cancel editing</button>}
   <MetricRuleForm key={editing ? `${editing.id}-${editing.revision}` : `new-${newForm}`} state={state} rule={editing} saved={async () => { await reload(); setEditing(null); setNewForm(n => n + 1) }} />
  </section>}
  <section className="card">
   <h2>Metric tasks</h2>
   {error && <p role="alert" className="error">{error}</p>}
   {!list && !error && <p role="status">Loading metric tasks…</p>}
   {error && <Action label="Reload metric tasks" kind="quiet" run={reload} />}
   {list && (list.tasks.length ? <ul className="plain">{list.tasks.map(task => <li key={task.id}>
    <h3>{task.name} <span className="pill">{task.status}</span></h3>
    <p>{monthLabel(task.month)} · <Person state={state} email={task.owner} /> · Due <span className="date-token">{displayDate(task.due)}</span> (UTC)</p>
    <p className="muted">{state.scenarios.find((s: D) => s.id === task.scenario)?.name ?? task.scenario} · Rule revision {task.ruleRevision}</p>
    <p>{task.evidence.summary}</p>
    <details><summary>Evidence sources</summary><ul>{task.evidence.sources.map((source, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{source}</li>)}</ul></details>
    {task.status === 'done' && <p>Completed by <Person state={state} email={task.completedBy} />{task.completedAt && <> at <span className="date-token">{displayDate(task.completedAt)}</span></>}.</p>}
    {task.status === 'open' && (finance || task.owner === state.me.email) && <Action label="Mark complete" run={async () => { await command('metric-task-complete', { id: task.id, revision: task.revision }); await reload() }} />}
   </li>)}</ul> : <p>No metric tasks.</p>)}
  </section>
 </>
}

function MetricRuleForm({ state, rule, saved }: { state: D; rule: MetricRule | null; saved: () => Promise<void> }) {
 const [kind, setKind] = useState<'overspend' | 'runway'>(rule?.kind ?? 'overspend')
 const [department, setDepartment] = useState(rule?.department ?? '')
 const members: D[] = state.members.filter((m: D) => m.active)
 const owners = kind === 'runway'
  ? [state.me, ...members.filter(m => m.role === 'finance' && m.email !== state.me.email)]
  : members.filter(m => m.role === 'contributor' && m.departments.includes(department))
 const initialOwner = kind === 'runway'
  ? rule?.kind === 'runway' ? rule.owner : state.me.email
  : rule?.kind === 'overspend' && department === rule.department ? rule.owner : ''
 return <Form submit={rule ? 'Save metric rule' : 'Add metric rule'} onSubmit={async values => {
  if (!/^(0|[1-9]\d*)$/.test(values.dueDays) || !Number.isSafeInteger(Number(values.dueDays))) throw new Error('Due days must be a whole number of UTC calendar days, zero or more.')
  await command('metric-rule-save', {
   ...(rule ? { id: rule.id, revision: rule.revision } : {}),
   name: values.name, kind, ...(kind === 'overspend' ? { department, percent: values.percent, amount: values.amount } : { runway: values.runway }),
   owner: values.owner, dueDays: Number(values.dueDays), enabled: values.enabled,
  })
  await saved()
 }}>
  <Field label="Rule name" name="name" defaultValue={rule?.name} />
  <label>Metric<select aria-label="Metric" name="kind" value={kind} onChange={e => setKind(e.target.value as 'overspend' | 'runway')}>
   <option value="overspend">Department overspend</option><option value="runway">Cash runway</option>
  </select></label>
  {kind === 'overspend' ? <>
   <label>Department<select aria-label="Department" name="department" required value={department} onChange={e => setDepartment(e.target.value)}>
    <option value="">Choose…</option>{state.departments.map((d: D) => <option key={d.id} value={d.id}>{d.name}</option>)}
   </select></label>
   <Field label="Overspend percent" name="percent" defaultValue={decimalText(rule?.kind === 'overspend' ? rule.percentBps : undefined)} hint="Actual spend must exceed the budget by more than this percentage and the amount below." />
   <Field label={`Overspend amount (${state.workspace.currency})`} name="amount" defaultValue={decimalText(rule?.kind === 'overspend' ? rule.amountCents : undefined)} />
  </> : <Field label="Runway threshold (months)" name="runway" defaultValue={decimalText(rule?.kind === 'runway' ? rule.runwayHundredths : undefined)} hint="Create a task when calculated runway is below this many months." />}
  <Field key={`${kind}-${department}`} label="Task owner" name="owner" defaultValue={initialOwner} options={owners.map(m => ({ value: m.email, label: `${m.name} · ${m.email}` }))} hint={kind === 'runway' ? 'An active finance person.' : 'An active contributor assigned to this department.'} />
  {owners.length === 0 && <p className="muted">Add an active contributor for this department under Settings → People before saving this rule.</p>}
  <Field label="Due days after trigger" name="dueDays" defaultValue={rule?.dueDays ?? 0} hint="Whole UTC calendar days; zero means the trigger date." />
  <Field label="Enabled" name="enabled" type="checkbox" defaultValue={rule?.enabled ?? true} />
 </Form>
}
