import type { Shared } from './app'
import { monthLabel, Table, type D } from './shared'

/** Remove old figures from the affected view while the accepted save runs. */
export function CalculationState({ state, job, reload, continueImport }: Pick<Shared, 'state'> & { job: D; reload: () => Promise<void>; continueImport: () => void }) {
 const running = job.status === 'running'
 const scenarios = job.scenarios.map((id: string) => state.scenarios.find((s: D) => s.id === id) ?? { id, name: 'Imported plan' })
 return <section className="card" aria-label="Background calculation" aria-busy={running}>
  <h2>{running ? 'Recalculating affected cells' : job.status === 'awaiting-continuation' ? 'Finish the source import' : 'Check the operation outcome'}</h2>
  <p role={running ? 'status' : 'alert'}>{running ? 'The accepted change is running in the background. Affected figures stay unavailable until it completes.' : job.error}</p>
  {running ? <Table caption="Recalculating cells" heads={['Plan', 'Period', 'Amount']}>
   {scenarios.flatMap((s: D) => Array.from({ length: s.horizon ?? state.workspace.horizon }, (_, i) => {
    const date = new Date(`${state.workspace.planStart}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + i)
    return <tr key={`${s.id}:${i}`}><th scope="row">{s.name}</th><td>{monthLabel(date.toISOString().slice(0, 7))}</td><td aria-busy="true">Recalculating…</td></tr>
   }))}
  </Table> : job.status === 'awaiting-continuation' && state.me.role === 'finance' ? <button type="button" onClick={continueImport}>Continue workbook import</button> : <button type="button" onClick={() => void reload()}>Reload current plan</button>}
 </section>
}
