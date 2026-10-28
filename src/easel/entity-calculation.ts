import { entityLedger } from './entity-ledger'
import { requireMember } from './access'
import { hasFullScope } from './access-grants'
import { workingCalculation } from './calculation'
import type { Context } from './context'
import type { RateTable } from './currency-rates'
import { entityAllowed } from './entity-access'
import type { Calculation } from './engine'
import { model } from './model'
import { addMonths } from './months'
import { frozenModel } from './reforecasts'
import { scenarioAccess } from './scenario-access'
import { translate } from './translation'
import { mulDiv } from './units'
import { find, requireThat, type Data } from './types'

export async function entityCalculation(c: Context, entity: Data) {
 requireMember(c.x)
 requireThat(entityAllowed(c.s, c.x, entity), 'Entity not found', 404)
 requireThat(hasFullScope(c.s, c.x, { [entity.dimension]: entity.member }), 'Whole-entity statements require every department and dimension in this entity', 403)
 const scenario = scenarioAccess(c.s, c.x, entity.forecast??entity.scenario)
 const m = scenario.status === 'frozen' ? await frozenModel(c, scenario) : model(c.s, scenario.id)
 requireThat(m.workspace.currency === entity.currency, 'The source plan currency does not match this entity; review the entity plan currency', 409)
 const calculation = scenario.status === 'frozen' ? (m as Awaited<ReturnType<typeof frozenModel>>).calculation : await workingCalculation(c, scenario.id)
 const ledger=await entityLedger(c,entity.id)
 return { model: m, calculation:{...calculation,entityLedger:ledger} }
}

export function entityTranslated(c: Context, entity: Data, calc: Calculation, reporting: string) {
 const table = find(c.s, 'entity-fx', entity.id) as RateTable | undefined
 if (entity.currency === reporting) return { status: 'identity', planCurrency: entity.currency, reportingCurrency: reporting, months: calc.months.map((month, i) => ({ month, profit: calc.profit[i], balanceSheet: calc.balanceSheet?.[i] ? { ...calc.balanceSheet[i], translationAdjustment: 0, translationAdjustmentMovement: 0, unreconciled: calc.balanceSheet[i].balanceDifference } : null, cash: { ...calc.cash[i], translationEffect: 0 }, unavailable: [] as string[] })) }
 const translated = translate(calc, table?.reporting === reporting ? table : undefined, entity.currency)
 const valid = !!table && table.local === entity.currency && table.reporting === reporting
 const move = (amount: number, rate: number) => mulDiv(amount, rate, 1_000_000)
 return { ...translated, months: translated.months.map((row, i) => {
  const rates = valid ? table!.rates[row.month] : undefined
  const previous = valid ? table!.rates[addMonths(row.month, -1)]?.monthEnd : undefined
  const missing = [...(row.unavailable ?? [])]
  let cash: Data | null = null
  if (rates?.average !== undefined && rates.monthEnd !== undefined && previous !== undefined) {
   const local = calc.cash[i]
   const opening = move(local.opening, previous), collections = move(local.collections, rates.average), payments = move(local.payments, rates.average), closing = move(local.closing, rates.monthEnd)
   cash = { month: row.month, opening, collections, payments, closing, translationEffect: closing - opening - collections + payments }
  } else if (previous === undefined) missing.push(`month-end rate for ${addMonths(row.month, -1)} (opening cash)`)
  return { ...row, cash, unavailable: [...new Set(missing)] }
 }) }
}

/** Summary statements contain no input identities or individual compensation. */
export function entityLocal(calc: Calculation) {
 return { currency: calc.currency, months: calc.months, profit: calc.profit, balanceSheet: calc.balanceSheet, cash: calc.cash, cashFlow: calc.cashFlow, lineTotals: calc.lineTotals }
}
