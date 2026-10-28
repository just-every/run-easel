import { ledgerEntity } from './ledger-scope'
import { actualCells, reconciliation } from './actuals-read'
import type { Context } from './context'
import type { ActualCell, Model } from './engine'
import { referenceMonths } from './history-schedules'
import { range } from './months'
import { all, requireThat, type Data } from './types'

export function historySourceMonths(m: Model): string[] {
 const months = range(m.workspace.planStart, m.workspace.horizon).filter(month => !m.scenario.actualsThrough || month > m.scenario.actualsThrough)
 return [...new Set(m.inputs.schedule.filter(schedule => schedule.history)
  .flatMap(schedule => months.flatMap(month => referenceMonths(schedule.history, month))))].sort()
}

async function sourceStatus(c: Context, requested: string[],scenario?:string) {
 const months = [...new Set(requested)].sort()
 const report = await reconciliation(c.db, c.s,ledgerEntity(c.s,scenario))
 const reconciled = new Map<string, Data>(report.months.map((month: Data) => [month.period, month]))
 const incomplete = all(c.s, 'batch').filter(batch => ['importing', 'undoing', 'failed'].includes(batch.status)&&batch.entity===ledgerEntity(c.s,scenario))
 const blockedMonths = months.filter(month => reconciled.get(month)?.blocked ||
  incomplete.some(batch => batch.periods?.includes(month)))
 const blocked = new Set(blockedMonths)
 const missingMonths = months.filter(month => !blocked.has(month) && !reconciled.has(month))
 return { months, blockedMonths, missingMonths }
}

/** Reconcile consumed historical periods too, rather than only plan months. */
export async function assertHistorySources(c: Context, months: string[],scenario?:string): Promise<void> {
 if (!months.length) return
 const status = await sourceStatus(c, months,scenario)
 requireThat(!status.blockedMonths.length, `Actuals history reconciliation blocked for ${status.blockedMonths.join(', ')}; finish the import or resolve its account and department mappings`, 409)
 requireThat(!status.missingMonths.length, `Missing accepted actuals for ${status.missingMonths.join(', ')}`, 409)
}

/** Overlay carries aggregate cells and availability, never raw ledger details. */
export async function historyOverlay(c: Context, months: string[],scenario?:string): Promise<{ cells: ActualCell[]; months: string[]; blockedMonths: string[]; missingMonths: string[] }> {
 if (!months.length) return { cells: [], months: [], blockedMonths: [], missingMonths: [] }
 const [status, cells] = await Promise.all([sourceStatus(c, months,scenario), actualCells(c.db, c.s,undefined,ledgerEntity(c.s,scenario))])
 const available = new Set(status.months.filter(month => !status.blockedMonths.includes(month) && !status.missingMonths.includes(month)))
 return { ...status, cells: cells.filter(cell => available.has(cell.month)) }
}
