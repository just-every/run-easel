import type { Data } from './types'
import type { Sheet } from './xlsx-write'

/** Amounts remain cents; runway remains hundredths of a month, labelled. */
export function cashHealthSheet(health: Data, cash: Data[], currency: string, prefix: string): Sheet {
 const rows: Sheet['rows'] = [[`${currency} minor units; runway in hundredths of months; current agreement checked against saved cash`],
  ['Month', 'Payments', 'Collections', 'Closing cash', 'Gross burn', 'Net burn', 'Trailing net burn', 'Trailing months', 'Runway hundredths', 'Cash floor below', 'Runway minimum below', 'Completeness']]
 health.months.forEach((m: Data, i: number) => {
  const r = i + 3
  rows.push([m.month, cash[i].payments, cash[i].collections, m.closing, { formula: `B${r}`, value: m.grossBurnCents }, { formula: `B${r}-C${r}`, value: m.netBurnCents }, { formula: `SUM(F${Math.max(3, r - 2)}:F${r})`, value: m.trailingNetBurnCents }, m.trailingMonths, m.runwayHundredths ?? (m.runwayBasis === 'cash-exhausted' ? 'Cash exhausted' : 'Not burning'), m.floorBreached === null ? 'Not assessed' : String(m.floorBreached), m.runwayBreached === null ? 'Not assessed' : String(m.runwayBreached), m.incompleteReasons?.join('\n') ?? 'Complete planning schedule'])
 })
 rows.push(['Lowest cash month', health.lowestCash?.month ?? '', health.lowestCash?.closing ?? null], ['Cash-zero forecast month', health.cashZeroMonth ?? 'None'], ['Agreement currency', health.agreement?.currency ?? 'Not agreed'], ['Cash floor', health.agreement?.floorCents ?? null], ['Minimum runway hundredths', health.agreement?.runwayMinimumHundredths ?? null], ['First floor breach', health.incompleteReasons?.length ? 'Not assessed: incomplete cash' : health.firstFloorBreach ?? 'None'], ['First runway breach', health.incompleteReasons?.length ? 'Not assessed: incomplete cash' : health.firstRunwayBreach ?? 'None'])
 return { name: `${prefix}Cash health`, rows }
}
