import { requireMember } from './access'
import { scopedDepartment, scopedReader } from './group-projections'
import type { Context } from './context'
import { entityAllowed } from './entity-access'
import { entityCalculation, entityLocal, entityTranslated } from './entity-calculation'
import { validateElimination } from './entity-eliminations'
import { all, Fault, get, requireThat, type Data } from './types'

const sum = (rows: Data[], key: string) => rows.reduce((total, row) => total + (row[key] ?? 0), 0)
const fields = (rows: Data[], keys: string[]) => Object.fromEntries(keys.map(key => [key, sum(rows, key)]))
export const ENTITY_PROFIT = ['revenue', 'costOfSales', 'operatingExpenses', 'grossMargin', 'profit']
export const ENTITY_BALANCE = ['cash', 'receivables', 'unbilledRevenue', 'inventory', 'prepaid', 'capitalPrepayments', 'fixedAssets', 'assets', 'payables', 'capitalPayables', 'nonCashReserve', 'deferredRevenue', 'salesTaxPayable', 'accruedLiabilities', 'debt', 'liabilities', 'openingEquity', 'retainedEarnings', 'contributedEquity', 'equity', 'unreconciled', 'translationAdjustment', 'translationAdjustmentMovement']
export const ENTITY_CASH = ['opening', 'collections', 'payments', 'closing', 'translationEffect']

export async function consolidationView(c: Context, groupId: string) {
 requireMember(c.x)
 requireThat(!scopedReader(c.x) || all(c.s, 'department').every(d => scopedDepartment(c.x, d.id)), 'Whole-entity statements require access to every department in the entity; use the scoped Plan view', 403)
 const group = get(c.s, 'entity-group', groupId)
 const allEntities = all(c.s, 'entity').filter(e => e.group === groupId)
 const visible = allEntities.filter(entity => entityAllowed(c.s, c.x, entity))
 requireThat(visible.length > 0, 'Consolidation not found', 404)
 const loaded = await Promise.all(visible.map(async entity => {
  const loaded = await entityCalculation(c, entity)
  return { entity, ...loaded, translated: entityTranslated(c, entity, loaded.calculation, group.reporting) }
 }))
 const months = [...new Set(loaded.flatMap(e => e.calculation.months))].sort()
 const rules = all(c.s, 'entity-elimination').filter(r => r.group === groupId)
 const accessible = visible.length === allEntities.length && allEntities.length > 0
 const eliminations: Data[] = []
 const consolidated = months.map(month => {
  const selected = loaded.map(e => ({ ...e, translatedMonth: e.translated.months.find(m => m.month === month) }))
  const unavailable: string[] = accessible ? [] : ['Full consolidation requires access to every entity']
  for (const entity of selected) {
   const m = entity.translatedMonth
   if (!m || !m.profit || !m.balanceSheet || !m.cash) unavailable.push(`${entity.entity.name}: ${m?.unavailable?.join('; ') || 'statement month unavailable'}`)
   const balance = entity.calculation.balanceSheet?.find(b => b.month === month)
   if (balance?.incompleteReasons?.length) unavailable.push(`${entity.entity.name}: ${balance.incompleteReasons.join('; ')}`)
  }
  const applied: Data[] = []
  for (const rule of rules.filter(r => r.month === month)) {
   const from = loaded.find(e => e.entity.id === rule.fromEntity), to = loaded.find(e => e.entity.id === rule.toEntity)
   if (!from || !to) continue
   try {
    const values = validateElimination(c, rule, from.entity, to.entity, from.calculation, to.calculation, rules)
    const effect = { ...rule, reportingCurrency: group.reporting, ...values }
    applied.push(effect)
    eliminations.push(c.x.role === 'finance' ? effect : { id: rule.id, name: rule.name, month, charge: values.charge, receivable: values.receivable, payable: values.payable, cashReceived: values.cashReceived, cashPaid: values.cashPaid })
   } catch (error) {
    if (!(error instanceof Fault)) throw error
    unavailable.push(`${rule.name}: ${error.message}`)
   }
  }
  if (unavailable.length) return { month, profit: null, balanceSheet: null, cash: null, unavailable }
  const profit = fields(selected.map(e => e.translatedMonth!.profit!), ENTITY_PROFIT)
  const balanceSheet = fields(selected.map(e => e.translatedMonth!.balanceSheet!), ENTITY_BALANCE)
  const cash = fields(selected.map(e => e.translatedMonth!.cash!), ENTITY_CASH)
  const before = { profit: { ...profit }, balanceSheet: { ...balanceSheet }, cash: { ...cash } }
  for (const rule of applied) {
   profit.revenue -= rule.charge
   profit[rule.expenseType === 'cost-of-sales' ? 'costOfSales' : 'operatingExpenses'] -= rule.charge
   balanceSheet.receivables -= rule.receivable; balanceSheet.payables -= rule.payable
   balanceSheet.assets -= rule.receivable; balanceSheet.liabilities -= rule.payable
   cash.collections -= rule.cashReceived; cash.payments -= rule.cashPaid
  }
  profit.grossMargin = profit.revenue - profit.costOfSales
  profit.profit = profit.grossMargin - profit.operatingExpenses
  const balanceDifference = balanceSheet.assets - balanceSheet.liabilities - balanceSheet.equity - balanceSheet.translationAdjustment
  const cashDifference = cash.opening + cash.collections - cash.payments + cash.translationEffect - cash.closing
  return { month, before, profit, balanceSheet: { ...balanceSheet, balanceDifference }, cash: { ...cash, difference: cashDifference }, eliminations: applied.map(r => r.id), unavailable: [] }
 })
 return { group, currency: group.reporting, months, entities: loaded.map(e => ({ ...e.entity, local: entityLocal(e.calculation), translated: e.translated })), eliminations, consolidated, scope: accessible ? 'complete' : 'restricted', cashBasis: 'Local cash-flow statements remain in each local currency. The consolidated cash bridge translates opening cash at the prior month-end rate, receipts and payments at the average rate, and closing cash at the month-end rate; the cash translation effect is shown separately.' }
}
