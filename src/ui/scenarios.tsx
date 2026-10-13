import { useEffect, useState } from 'react'
import { assumptionText } from './assumptions'
import type { Shared } from './app'
import { ClosingCashChart } from './chart'
import { Action, api, command, Field, Form, money, monthLabel, ScenarioPicker, Person, Table, type D } from './shared'

/** Branches, proposals and side-by-side comparison. */
export function Scenarios({ state, refresh }: Shared) {
 const me = state.me
 const plans = state.scenarios.filter((s: D) => s.kind !== 'proposal')
 const working = state.scenarios.filter((s: D) => s.status === 'working' && s.kind !== 'proposal')
 const [a, setA] = useState(plans.find((s: D) => s.kind === 'forecast')?.id ?? plans[0]?.id ?? '')
 const [b, setB] = useState(plans.find((s: D) => s.kind === 'scenario')?.id ?? plans[1]?.id ?? '')
 const [cmp, setCmp] = useState<D | null>(null)
 const [error, setError] = useState('')
 const leftCurrency = cmp?.left.workspace.currency ?? state.workspace.currency
 const rightCurrency = cmp?.right.workspace.currency ?? state.workspace.currency
 useEffect(() => { let live = true; setCmp(null); if (a && b && a !== b) api(`compare?a=${a}&b=${b}`).then(v => { if (live) setCmp(v) }, e => setError(e.message)); return () => { live = false } }, [a, b, state])
 const name = (id: string) => state.scenarios.find((s: D) => s.id === id)?.name ?? '—'
 const comparedName = (kind: 'lines' | 'departments', id: string, missing: string) => {
  const left = cmp?.left[kind].find((item: D) => item.id === id)?.name ?? missing
  const right = cmp?.right[kind].find((item: D) => item.id === id)?.name ?? missing
  return left === right ? left : `${left} → ${right}`
 }
 const proposals = state.scenarios.filter((s: D) => s.kind === 'proposal')
 return <>
  <section className="card">
   <h2>Scenarios</h2>
   <Table caption="Scenarios" heads={['Name', 'Kind', 'Status', 'Revision', 'Made from', '']}>
    {plans.map((s: D) => <tr key={s.id}><td>{s.name}</td><td>{s.kind}</td><td>{s.status === 'frozen' ? 'approved' : s.status}</td><td className="num">{s.revision}</td><td>{s.branchedFrom ? `${s.branchedFrom.name} r${s.branchedFrom.revision}` : s.imported ? `${s.imported.file} (${s.imported.sheet})` : '—'}</td><td>
     {me.role === 'finance' && s.kind === 'scenario' && working.filter((w: D) => w.id !== s.id && w.kind !== 'scenario').map((w: D) => <Action key={w.id} kind="quiet" label={`Use as ${w.name}`} confirm={`Replace every assumption in ${w.name} (revision ${w.revision}) with ${s.name}?`} run={async () => { await command('scenario-adopt', { from: s.id, into: w.id, revision: w.revision }); await refresh() }} />)}
     {me.role === 'finance' && s.kind === 'scenario' && <Action kind="danger" label="Delete" confirm={`Delete ${s.name}?`} run={async () => { await command('scenario-delete', { id: s.id }); await refresh() }} />}
    </td></tr>)}
   </Table>
   {me.role === 'finance' && <Form submit="Branch scenario" onSubmit={async v => { await command('branch', v); await refresh() }}>
    <Field label="Branch from" name="from" options={plans.map((s: D) => ({ value: s.id, label: s.name }))} />
    <Field label="Scenario name" name="name" defaultValue="Downside" />
   </Form>}
  </section>

  <section className="card">
   <h2>Compare</h2>
   <div className="row"><ScenarioPicker label="From" scenarios={state.scenarios} value={a} onChange={setA} /><ScenarioPicker label="To" scenarios={state.scenarios} value={b} onChange={setB} /></div>
   {error && <p role="alert" className="error">{error}</p>}
   {cmp && <>
    {cmp.currencyComparable && <ClosingCashChart ticks months={cmp.left.cash.map((c: D) => c.month)} actualsThrough={cmp.left.scenario.actualsThrough} currency={leftCurrency}
     series={[cmp.left, cmp.right].map((side: D) => ({ name: side.scenario.name, values: side.cash.map((c: D) => c.closing) }))}
     label={`Closing cash by month, ${cmp.left.scenario.name} and ${cmp.right.scenario.name}; ${money(cmp.left.cash.at(-1)?.closing, leftCurrency)} and ${money(cmp.right.cash.at(-1)?.closing, rightCurrency)} at ${monthLabel(cmp.left.cash.at(-1)?.month)}.`} />}
    <Table caption={`Profit and closing cash: ${name(a)} → ${name(b)}`} heads={['Month', `Profit ${cmp.left.scenario.name}`, `Profit ${cmp.right.scenario.name}`, 'Difference', `Cash ${cmp.left.scenario.name}`, `Cash ${cmp.right.scenario.name}`, 'Difference']}>
     {cmp.left.profit.map((p: D, i: number) => { const q = cmp.right.profit[i], c = cmp.left.cash[i], d = cmp.right.cash[i]; return <tr key={p.month}><td>{monthLabel(p.month)}</td><td className="num">{money(p.profit, leftCurrency)}</td><td className="num">{money(q.profit, rightCurrency)}</td><td className="num">{money(cmp.currencyComparable ? q.profit - p.profit : null, leftCurrency)}</td><td className="num">{money(c.closing, leftCurrency)}</td><td className="num">{money(d.closing, rightCurrency)}</td><td className="num">{money(cmp.currencyComparable ? d.closing - c.closing : null, leftCurrency)}</td></tr> })}
    </Table>
    <h3>Changed assumptions ({cmp.changedInputs.length})</h3>
    <ul className="plain">{cmp.changedInputs.map((c: D, i: number) => <li key={i}>{assumptionText(c, cmp)}</li>)}</ul>
    <h3>Changed cells ({cmp.changedCells.length})</h3>
    <Table caption="Changed cells" heads={['Month', 'Line', 'Department', 'Before', 'After', 'Difference']}>{cmp.changedCells.slice(0, 200).map((c: D) => <tr key={`${c.line}|${c.department}|${c.month}`}><td>{monthLabel(c.month)}</td><td>{comparedName('lines', c.line, 'Deleted planning line')}</td><td>{comparedName('departments', c.department, 'No department')}</td><td className="num">{money(c.before, leftCurrency)}</td><td className="num">{money(c.after, rightCurrency)}</td><td className="num">{money(c.difference, leftCurrency)}</td></tr>)}</Table>
   </>}
  </section>

  <section className="card">
   <h2>Proposals</h2>
   <p className="muted">A proposal is a copy of a working plan bound to that plan's exact revision. You (or an agent working for you) change it; finance reviews the changed cells and promotes that exact revision, or nothing changes.</p>
   <Table caption="Proposals" heads={['Proposal', 'Request', 'For', 'By', 'Status', 'Revision', '']}>
    {proposals.map((p: D) => <tr key={p.id}><td>{p.name}</td><td className="wrap">{p.request}</td><td>{p.branchedFrom.name} r{p.branchedFrom.revision}</td><td><Person state={state} email={p.createdBy} /></td><td>{p.proposalStatus}</td><td className="num">{p.revision}</td><td>
     {p.proposalStatus === 'draft' && p.createdBy === me.email && <Action label="Submit for approval" run={async () => { await command('proposal-submit', { id: p.id }); await refresh() }} />}
     {p.proposalStatus === 'submitted' && me.role === 'finance' && <>
      <Action label={`Compare`} kind="quiet" run={async () => { setA(p.branchedFrom.scenario); setB(p.id) }} />
      <Action label={`Promote revision ${p.revision}`} confirm={`Apply this proposal at revision ${p.revision} to ${p.branchedFrom.name}?`} run={async () => { await command('proposal-promote', { id: p.id, revision: p.revision }); await refresh() }} />
      <Form className="row" submit="Decline" onSubmit={async v => { await command('proposal-decline', { id: p.id, reason: v.reason }); await refresh() }}><Field label="Reason to decline" name="reason" /></Form>
     </>}
    </td></tr>)}
   </Table>
   {me.role !== 'viewer' && working.length > 0 && <Form submit="Start a proposal" onSubmit={async v => { await command('proposal-create', v); await refresh() }}>
    <Field label="Change which plan" name="from" options={working.map((s: D) => ({ value: s.id, label: `${s.name} (revision ${s.revision})` }))} />
    <Field label="Proposal name" name="name" />
    <Field label="What should change" name="request" type="textarea" />
   </Form>}
  </section>
 </>
}
