import { CashAgreement, CashHealth } from './cash-health'
import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { revealHorizontally } from './scroll'
import { AssetSchedule } from './assets'
import { Statements } from './statements'
import { ClosingCashChart } from './chart'
import { api, kindLabel, money, monthLabel, ScenarioPicker, Person, Table, type D } from './shared'

export const defaultScenario = (scenarios: D[]) => (scenarios.find(s => s.kind === 'forecast') ?? scenarios.find(s => s.kind === 'budget') ?? scenarios[0])?.id ?? ''

/** The newest working scenario branched from `id`: the dashed line beside it on the Closing cash chart. */
const comparisonFor = (scenarios: D[], id: string) => scenarios.filter(s => s.kind === 'scenario' && s.status === 'working' && s.branchedFrom?.scenario === id).at(-1)

/** The plan as a profit and loss by month, with the arithmetic behind any cell one click away. */
export function Overview({ state, refresh }: Shared) {
 const plans = state.scenarios.filter((s: D) => s.kind !== 'proposal' || s.status === 'working')
 const [id, setId] = useState(defaultScenario(plans))
 const [view, setView] = useState<D | null>(null)
 const [other, setOther] = useState<D | null>(null)
 const [department, setDepartment] = useState('')
 const [trace, setTrace] = useState<D | null>(null)
 const [error, setError] = useState('')
 const comparison = comparisonFor(state.scenarios, id)
 useEffect(() => { if (!id) return; let live = true; setView(null); api(`scenario/${id}`).then(v => { if (live) setView(v) }, e => setError(e.message)); return () => { live = false } }, [id, state])
 useEffect(() => { let live = true; setOther(null); if (comparison) api(`scenario/${comparison.id}`).then(v => { if (live) setOther(v) }, e => setError(e.message)); return () => { live = false } }, [comparison?.id, state])
 if (!id) return <section className="card"><p>No scenario yet.</p></section>
 const currency = view?.workspace.currency ?? state.workspace.currency
 const lines = view?.lines ?? []
 const departments = view?.departments ?? []
 const calc = view?.calculation
 const sc = view?.scenario
 const cells = (calc?.cells ?? []).filter((c: D) => !department || c.department === department)
 const sum = (line: string, month: string) => cells.filter((c: D) => c.line === line && c.month === month).reduce((a: number, c: D) => a + c.amount, 0)
 const deptName = (d: string) => departments.find((x: D) => x.id === d)?.name ?? 'No department'
 const actual = (m: string) => m <= (calc?.actualsThrough ?? '')
 const closing = (c: D) => calc.months.map((m: string) => c.cash.find((x: D) => x.month === m)?.closing ?? 0)
 const series = calc ? [{ name: sc.name, values: closing(calc) }, ...(other?.calculation ? [{ name: other.scenario.name, values: closing(other.calculation) }] : [])] : []
 const last = series[0]?.values.at(-1)
 return <>
  <div className="row spread controls">
   <div className="row">
    <ScenarioPicker scenarios={plans} value={id} onChange={v => { setId(v); setTrace(null) }} />
    <label className="inline">Department<select aria-label="Department" value={department} onChange={e => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map((d: D) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <a href={`/api/easel/scenario/${id}/document.xlsx${department ? `?department=${encodeURIComponent(department)}` : ''}`} download>Download Excel</a>
    <a href={`/api/easel/scenario/${id}/document.csv`} download>Download CSV</a>
   </div>
   {sc && <p className="muted">Revision {sc.revision} · {sc.status === 'frozen' ? sc.kind === 'reforecast' ? <>frozen · saved by <Person state={state} email={sc.reforecast?.by} /> at <span className="date-token">{sc.reforecast?.at?.slice(0, 19).replace('T', ' ')}</span></> : <>approved by <Person state={state} email={sc.approval?.by} /> at <span className="date-token">{sc.approval?.at?.slice(0, 19).replace('T', ' ')}</span></> : sc.status}{sc.actualsThrough ? ` · actuals through ${monthLabel(sc.actualsThrough)}` : ''}{sc.branchedFrom ? ` · branched from ${sc.branchedFrom.name} at revision ${sc.branchedFrom.revision}` : ''}</p>}
  </div>
  {error && <p role="alert" className="error">{error}</p>}
  <div className={trace ? 'overview has-trace' : 'overview'}>
   <div className="overview-main">
    {!department && view?.cashHealth && <CashHealth health={view.cashHealth} currency={currency} />}
    {!department && <CashAgreement state={state} refresh={refresh} />}
    {calc && !department && <section className="card">
     <ClosingCashChart ticks months={calc.months} actualsThrough={calc.actualsThrough} currency={currency} series={series}
      label={`Closing cash by month, ${series.map(s => s.name).join(' and ')}${last === undefined ? '' : `; ${money(last, currency)} at ${monthLabel(calc.months.at(-1))}`}.`} />
    </section>}
    {calc && <section className="card">
     <h2>Profit and loss</h2>
     <p className="muted">Shaded months are actuals. Choose any amount to see how it was calculated.</p>
     <Table caption="Profit and loss by month" heads={['Line', ...calc.months.map((m: string) => <span className={actual(m) ? 'actual' : ''}>{monthLabel(m)}</span>), 'Total']}>
      {(['revenue', 'cost-of-sales', 'operating-expense'] as const).flatMap(type => [
       <tr key={type}><th scope="rowgroup">{kindLabel[type]}</th><td colSpan={calc.months.length + 1} /></tr>,
       ...lines.filter((l: D) => l.type === type).map((l: D) => <tr key={l.id}><td className="indent">{l.name}</td>{calc.months.map((m: string) => { const v = sum(l.id, m), chosen = trace?.line.id === l.id && trace?.month === m; return <td key={m} className={`num${actual(m) ? ' actual' : ''}`}>{v === 0 ? '—' : <button className="cell" type="button" aria-pressed={chosen} aria-label={`${l.name} ${monthLabel(m)}: how it was calculated`} onClick={e => { revealHorizontally(e.currentTarget, true); setTrace({ line: l, month: m }); requestAnimationFrame(() => { const selected = document.querySelector<HTMLElement>('.cell[aria-pressed=true]'); if (selected) revealHorizontally(selected, true) }) }}>{money(v, currency)}</button>}</td> })}<td className="num">{money(calc.months.reduce((a: number, m: string) => a + sum(l.id, m), 0), currency)}</td></tr>),
      ])}
      {!department && <tr className="total"><td>Profit</td>{calc.profit.map((p: D) => <td key={p.month} className={`num${actual(p.month) ? ' actual' : ''}`}>{money(p.profit, currency)}</td>)}<td className="num">{money(calc.profit.reduce((a: number, p: D) => a + p.profit, 0), currency)}</td></tr>}
     </Table>
    </section>}
    {calc && !department && <section className="card">
     <h2>Cash</h2>
     <Table caption="Monthly cash" heads={['', ...calc.months.map(monthLabel)]}>
      {(['opening', 'collections', 'payments', 'closing'] as const).map(k => <tr key={k} className={k === 'closing' ? 'total' : ''}><td>{k[0].toUpperCase() + k.slice(1)}</td>{calc.cash.map((m: D) => <td key={m.month} className="num">{money(m[k], currency)}</td>)}</tr>)}
     </Table>
     <p className="muted trace">{calc.cash[0]?.trace}</p>
     {calc.warnings.length > 0 && <><h3>Check these</h3><ul className="plain">{calc.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul></>}
    </section>}
    {calc && !department && <Statements calculation={calc} currency={currency} />}
    {calc && <AssetSchedule calculation={{ ...calc, assets: (calc.assets ?? []).filter((a: D) => !department || a.department === department) }} currency={currency} />}
   </div>
   {trace && <TracePanel heading={`${trace.line.name}, ${monthLabel(trace.month)}`} onClose={() => setTrace(null)}
    sources={cells.filter((c: D) => c.line === trace.line.id && c.month === trace.month).flatMap((c: D) => c.sources.map((s: D) => ({ ...s, department: deptName(c.department) })))} currency={currency} />}
  </div>
 </>
}

/** A chosen amount's arithmetic: a card beside the P&L on wide screens, a bottom sheet on phones. */
function TracePanel({ heading, sources, currency, onClose }: { heading: string; sources: D[]; currency: string; onClose: () => void }) {
 return <section className="card trace-panel" aria-live="polite" aria-label={heading}>
  <span className="grab" aria-hidden="true" />
  <h2>{heading}</h2>
  <ul>{sources.map((s, i) => { const at = s.trace.lastIndexOf(' = '); return <li key={i}>
   <p className="trace-from"><span>{s.department} · {s.label}</span><span>{money(s.amount, currency)}</span></p>
   <p className="trace-math">{at < 0 ? s.trace : <>{s.trace.slice(0, at + 3)}<strong>{s.trace.slice(at + 3)}</strong></>}</p>
  </li> })}</ul>
  <button type="button" className="quiet" onClick={onClose}>Close</button>
 </section>
}
