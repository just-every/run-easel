import { ClosingCashChart } from './chart'
import { money, monthLabel, Table, type D } from './shared'

/** Align by month: a frozen version can end before the current forecast. */
export function ScenarioComparison({ comparison: cmp }: { comparison: D }) {
 const [left, right] = [cmp.left, cmp.right]
 const leftCurrency = left.workspace.currency, rightCurrency = right.workspace.currency
 const profits = [left, right].map(side => new Map<string, D>(side.profit.map((p: D) => [p.month, p])))
 const cash = [left, right].map(side => new Map<string, D>(side.cash.map((c: D) => [c.month, c])))
 const months = [...new Set([...profits.flatMap(m => [...m.keys()]), ...cash.flatMap(m => [...m.keys()])])].sort()
 const sharedMonths = months.filter(m => cash.every(c => c.has(m)))
 const last = sharedMonths.at(-1)
 const difference = (a?: number, b?: number) => cmp.currencyComparable && a != null && b != null ? b - a : null
 return <>
  {cmp.currencyComparable && sharedMonths.length > 0 && <>
   <ClosingCashChart ticks months={sharedMonths} actualsThrough={left.scenario.actualsThrough} currency={leftCurrency}
    series={[left, right].map((side, i) => ({ name: side.scenario.name, values: sharedMonths.map(m => cash[i].get(m)!.closing) }))}
    label={`Closing cash by month, ${left.scenario.name} and ${right.scenario.name}; ${money(cash[0].get(last!)?.closing, leftCurrency)} and ${money(cash[1].get(last!)?.closing, rightCurrency)} at ${monthLabel(last)}.`} />
   {sharedMonths.length !== months.length && <p className="muted">The chart shows shared months. The table includes all months; — means outside that version's horizon.</p>}
  </>}
  <Table caption={`Profit and closing cash: ${left.scenario.name} → ${right.scenario.name}`} heads={['Month', `Profit ${left.scenario.name}`, `Profit ${right.scenario.name}`, 'Difference', `Cash ${left.scenario.name}`, `Cash ${right.scenario.name}`, 'Difference']}>
   {months.map(month => {
    const p = profits[0].get(month)?.profit, q = profits[1].get(month)?.profit
    const c = cash[0].get(month)?.closing, d = cash[1].get(month)?.closing
    return <tr key={month}><td>{monthLabel(month)}</td><td className="num">{money(p, leftCurrency)}</td><td className="num">{money(q, rightCurrency)}</td><td className="num">{money(difference(p, q), leftCurrency)}</td><td className="num">{money(c, leftCurrency)}</td><td className="num">{money(d, rightCurrency)}</td><td className="num">{money(difference(c, d), leftCurrency)}</td></tr>
   })}
  </Table>
 </>
}

type Version = { id: string; name: string; kind: string; revision: number; currency: string }
type VersionRow = { key: string; lineName: string; departmentName: string; actual: number; comparisons: { id: string; amount: number | null; variance: number | null }[] }

/** Server-provided amounts and deltas preserve each version's saved horizon. */
export function ReforecastComparison({ versions, rows, currency }: { versions: Version[]; rows: VersionRow[]; currency: string }) {
 return <section className="card">
  <h2>Actual against every version</h2>
  <p className="muted">Each column shows the version amount and Δ (actual minus that version). An amount of — means the month is outside that version's horizon. Δ is also — when currencies differ.</p>
  <Table caption="Actual, budget, reforecasts and current forecast" heads={['Line', 'Department', `Actual (${currency})`, ...versions.map(version => <><span>{version.name}</span><div className="muted">{version.kind === 'forecast' ? 'Current forecast' : version.kind === 'reforecast' ? 'Frozen reforecast' : 'Approved budget'} · revision {version.revision} · {version.currency}</div></>)]}>
   {rows.map(row => {
    const comparisons = new Map(row.comparisons.map(c => [c.id, c]))
    return <tr key={row.key}><td>{row.lineName}</td><td>{row.departmentName}</td><td className="num">{money(row.actual, currency)}</td>{versions.map(version => {
     const value = comparisons.get(version.id)
     return <td className="num" key={version.id}>{money(value?.amount, version.currency)}<div className="muted">Δ {money(value?.variance, currency)}</div></td>
    })}</tr>
   })}
  </Table>
 </section>
}
