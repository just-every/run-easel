import { ledgerScope } from '../ledger-scope'
// A recalculation of the official forecast with replaced inputs, used by the
// constraint watch and the response search. It reads the same accepted
// actuals and ledger context as the working calculation and writes nothing.
import { actualCells } from '../actuals-read'
import type { Context } from '../context'
import { calculate, type Calculation } from '../engine'
import { ledgerContext } from '../ledger-context'
import { model } from '../model'
import { cashHealth } from '../cash-health'
import { workspace } from '../model'
import { requireThat, type Data } from '../types'

export async function evaluator(c: Context, forecast: Data) {
 const m = model(c.s, forecast.id)
 requireThat(!m.inputs.formula?.length, 'Native-formula forecasts are not searched', 409)
 const through = forecast.actualsThrough ?? undefined
 const actuals = await actualCells(c.db, c.s, through,ledgerScope(c.s,forecast))
 const ledger = through ? await ledgerContext(c, through, m.scenario.ledgerAllocations ?? [], m.scenario.balanceLedger === true,ledgerScope(c.s,forecast)) : undefined
 return { model: m, run: (inputs: Data): Calculation => calculate({ ...m, inputs: { ...m.inputs, ...inputs } }, actuals, ledger) }
}

export type Constraints = { agreed: boolean; floorBreach: Data | null; runwayBreach: Data | null; lowest: Data | null; minRunwayHundredths: number | null }

/** The finance-agreed cash floor and runway minimum, checked on the forecast months only. */
export function constraints(c: Context, calc: Calculation, forecast: Data): Constraints {
 const agreement = workspace(c.s).cashAgreement
 if (!agreement || agreement.currency !== calc.currency) return { agreed: false, floorBreach: null, runwayBreach: null, lowest: null, minRunwayHundredths: null }
 const health = cashHealth(calc.cash, forecast.actualsThrough ?? null, calc.currency, agreement)
 const future = health.months.filter(m => !forecast.actualsThrough || m.month > forecast.actualsThrough)
 const floor = future.find(m => m.floorBreached), runway = future.find(m => m.runwayBreached)
 const lowest = future.reduce<Data | null>((best, m) => !best || m.closing < best.closing ? m : best, null)
 const runways = future.map(m => m.runwayHundredths).filter((v): v is number => v !== null)
 return {
  agreed: true,
  floorBreach: floor ? { month: floor.month, closingCents: floor.closing, floorCents: agreement.floorCents, lowestMonth: lowest!.month, lowestCents: lowest!.closing, gapCents: agreement.floorCents - lowest!.closing } : null,
  runwayBreach: runway ? { month: runway.month, closingCents: runway.closing, runwayHundredths: runway.runwayHundredths, minimumHundredths: agreement.runwayMinimumHundredths } : null,
  lowest: lowest ? { month: lowest.month, closingCents: lowest.closing } : null,
  minRunwayHundredths: runways.length ? Math.min(...runways) : null,
 }
}
export const restored = (k: Constraints) => k.agreed && !k.floorBreach && !k.runwayBreach
