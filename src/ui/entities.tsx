import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { Action, api, command, Field, Form, money, monthLabel, options, Table, type D } from './shared'

const statements = [
 ['profit', 'Profit and loss', [['revenue', 'Revenue'], ['costOfSales', 'Cost of sales'], ['operatingExpenses', 'Operating expenses'], ['profit', 'Profit']]],
 ['balanceSheet', 'Balance sheet', [['receivables', 'Receivables'], ['payables', 'Payables'], ['assets', 'Assets'], ['liabilities', 'Liabilities'], ['equity', 'Equity'], ['translationAdjustment', 'Translation adjustment'], ['unreconciled', 'Source balance difference']]],
 ['cash', 'Cash bridge', [['opening', 'Opening cash'], ['collections', 'Collections'], ['payments', 'Payments'], ['translationEffect', 'Cash translation effect'], ['closing', 'Closing cash']]],
] as const

/** Entity administration is exposed only to the native owner/administrator. */
export function Entities({ state, refresh }: Pick<Shared, 'state' | 'refresh'>) {
 const [settings, setSettings] = useState<D | null>(null), [error, setError] = useState(''), [group, setGroup] = useState('')
 useEffect(() => { let live = true; api('entities').then(v => { if (live) { setSettings(v); setError(''); setGroup(g => v.groups.some((row: D) => row.id === g) ? g : v.groups[0]?.id ?? '') } }, e => { if (live) setError(e.message) }); return () => { live = false } }, [state])
 if (!settings) return error ? <p role="alert" className="error">{error}</p> : null
 const run = (op: string) => async (v: D) => { await command(op, v); await refresh() }
 const sourceOptions = (type: string) => settings.origins.filter((o: D) => type === 'revenue' ? o.type === type : o.type !== 'revenue').map((o: D) => ({ value: `${o.entity}:${o.origin}`, label: `${settings.entities.find((e: D) => e.id === o.entity)?.name}: ${o.name} (${o.line})` }))
 return <>
  <section className="card" aria-label="Entities">
   <h2>Entities</h2>
   <p>Each entity has a separate source plan and local currency. Consolidation translates each entity before applying the rules finance reviews.</p>
   <Table caption="Entity source plans" heads={['Entity', 'Local currency', 'Source plan', 'Reporting currency']}>{settings.entities.map((e: D) => <tr key={e.id}><td>{e.name}</td><td>{e.currency}</td><td>{state.scenarios.find((s: D) => s.id === e.scenario)?.name}</td><td>{settings.groups.find((g: D) => g.id === e.group)?.reporting}</td></tr>)}</Table>
   {settings.finance && <>
    <Form submit="Add entity" onSubmit={run('entity-save')}>
     <Field label="Entity name" name="name" />
     <Field label="Source plan" name="scenario" options={options(state.scenarios.filter((s: D) => s.status === 'working' && !s.sandbox && s.kind !== 'proposal' && !settings.entities.some((e: D) => e.scenario === s.id)))} />
     <Field label="Local currency" name="currency" defaultValue={state.workspace.currency} />
     <Field label="Consolidation group plan" name="group" options={options(state.scenarios.filter((s: D) => !s.sandbox && s.kind !== 'proposal'))} />
     <Field label="Group reporting currency" name="reporting" defaultValue="USD" />
    </Form>
    <h3>Entity rates</h3>
    <p className="muted">Reporting currency per one local currency unit. Enter the month before the plan for opening equity and cash. A missing rate leaves the affected statement unavailable.</p>
    <Table caption="Entity exchange rates" heads={['Entity', 'Month', 'Budget', 'Average', 'Month-end']}>{settings.entities.flatMap((e: D) => Object.entries(settings.rates[e.id]?.rates ?? {}).map(([month, value]) => { const r = value as D; return <tr key={`${e.id}:${month}`}><td>{e.name}</td><td>{monthLabel(month)}</td>{['budget', 'average', 'monthEnd'].map(k => <td key={k}>{r[k] === undefined ? '—' : (r[k] / 1_000_000).toFixed(6)}</td>)}</tr> }))}</Table>
    <Form submit="Save entity rates" onSubmit={async v => { for (const k of ['budget', 'average', 'monthEnd']) if (v[k] === '') delete v[k]; await run('entity-rate')(v) }}>
     <Field label="Entity" name="entity" options={options(settings.entities.filter((e: D) => e.currency !== settings.groups.find((g: D) => g.id === e.group)?.reporting))} />
     <Field label="Rate month" name="month" type="month" />
     {['budget', 'average', 'monthEnd'].map(k => <Field key={k} label={`${k === 'monthEnd' ? 'Month-end' : k === 'average' ? 'Average' : 'Budget'} rate`} name={k} required={false} />)}
    </Form>
    <h3>Reviewed eliminations</h3>
    <p className="muted">Amounts are in each source entity’s local currency. The two sides must agree after translation and must be backed by the selected source drivers. Rules apply only in the month entered.</p>
    <Table caption="Elimination rules" heads={['Name', 'Month', 'Revenue / expense', 'Receivable / payable', 'Received / paid', '']}>{settings.rules.map((r: D) => <tr key={r.id}><td>{r.name}</td><td>{monthLabel(r.month)}</td><td>{money(r.fromAmount, settings.entities.find((e: D) => e.id === r.fromEntity)?.currency)} / {money(r.toAmount, settings.entities.find((e: D) => e.id === r.toEntity)?.currency)}</td><td>{r.receivable} / {r.payable} cents</td><td>{r.cashReceived} / {r.cashPaid} cents</td><td><Action label="Remove elimination" kind="danger" run={async () => { await command('entity-elimination-delete', { id: r.id }); await refresh() }} /></td></tr>)}</Table>
    <Form submit="Save reviewed elimination" onSubmit={async v => { const [fromEntity, fromOrigin] = v.fromSource.split(':'), [toEntity, toOrigin] = v.toSource.split(':'); await run('entity-elimination-save')({ ...v, fromEntity, fromOrigin, toEntity, toOrigin }) }}>
     <Field label="Elimination name" name="name" />
     <Field label="Elimination month" name="month" type="month" />
     <Field label="Revenue source" name="fromSource" options={sourceOptions('revenue')} />
     <Field label="Expense source" name="toSource" options={sourceOptions('expense')} />
     {([['fromAmount', 'Local revenue charge'], ['toAmount', 'Local expense charge'], ['receivable', 'Local receivable balance'], ['payable', 'Local payable balance'], ['cashReceived', 'Local cash received'], ['cashPaid', 'Local cash paid']] as const).map(([name, label]) => <Field key={name} label={label} name={name} defaultValue="0" />)}
     <Field label="I reviewed both source charges, balances and settlements" name="reviewed" type="checkbox" />
    </Form>
   </>}
  </section>
  {settings.groups.length > 0 && <section className="card"><label>Consolidation group<select aria-label="Consolidation group" value={group} onChange={e => setGroup(e.target.value)}>{settings.groups.map((g: D) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label></section>}
  {group && <Consolidation state={state} scenario={group} />}
 </>
}

export function Consolidation({ state, scenario }: Pick<Shared, 'state'> & { scenario: string }) {
 const [view, setView] = useState<D | null>(null), [error, setError] = useState('')
 useEffect(() => { let live = true; setView(null); setError(''); api(`consolidation/${scenario}`).then(v => { if (live) setView(v) }, e => { if (live) setError(e.message) }); return () => { live = false } }, [scenario, state])
 if (!view) return error ? <p role="alert" className="error">{error}</p> : null
 return <section className="card" aria-label="Management consolidation">
  <h2>Management consolidation · {view.currency}</h2>
  <p>{view.cashBasis}</p>
  <p><a href={`/api/easel/consolidation/${encodeURIComponent(scenario)}/workbook`} download>Download consolidation Excel</a></p>
  {view.scope !== 'complete' && <p>Full consolidation requires access to every entity.</p>}
  {statements.map(([key, label, fields]) => <Table key={key} caption={`${label} in ${view.currency}`} heads={['Month', 'Line', ...view.entities.map((e: D) => e.name), 'Sum', 'Eliminations', 'Consolidated']}>{view.consolidated.flatMap((m: D) => m[key] ? fields.map(([field, name]) => <tr key={`${m.month}:${field}`}><td>{monthLabel(m.month)}</td><td>{name}</td>{view.entities.map((e: D) => <td className="num" key={e.id}>{money(e.translated.months.find((row: D) => row.month === m.month)?.[key]?.[field], view.currency)}</td>)}<td className="num">{money(m.before[key][field], view.currency)}</td><td className="num">{money(m.before[key][field] - m[key][field], view.currency)}</td><td className="num">{money(m[key][field], view.currency)}</td></tr>) : [<tr key={m.month}><td>{monthLabel(m.month)}</td><td className="wrap" colSpan={view.entities.length + 4}>{m.unavailable.join('; ')}</td></tr>])}</Table>)}
  {view.entities.map((e: D) => <details key={e.id}><summary>{e.name}: local statements in {e.currency}</summary>{statements.map(([key, label, fields]) => <Table key={key} caption={`${e.name} ${label}`} heads={['Month', ...fields.map(([, name]) => name)]}>{e.local.months.map((month: string, i: number) => <tr key={month}><td>{monthLabel(month)}</td>{fields.map(([field]) => <td className="num" key={field}>{money(e.local[key]?.[i]?.[field], e.currency)}</td>)}</tr>)}</Table>)}</details>)}
 </section>
}
