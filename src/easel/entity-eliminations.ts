import { entityLedgerEvidence,validateLedgerElimination } from './entity-ledger-evidence'
import type { Context } from './context'
import type { RateKind } from './currency-rates'
import { entityCalculation } from './entity-calculation'
import type { Calculation } from './engine'
import { month } from './months'
import { cents, mulDiv } from './units'
import { all, find, get, put, remove, requireThat, text, uid, type Data } from './types'

export function entityMove(c: Context, entity: Data, reporting: string, amount: number, period: string, kind: RateKind) {
 if (entity.currency === reporting) return amount
 const table = find(c.s, 'entity-fx', entity.id)
 const rate = table && table.local === entity.currency && table.reporting === reporting ? table.rates[period]?.[kind] : undefined
 requireThat(rate !== undefined, `${entity.name}: enter the ${kind} rate for ${period}`, 409)
 return mulDiv(amount, rate, 1_000_000)
}

const sourceAmount = (calc: Calculation, origin: string, period: string, line: string) => calc.cells.filter(c => c.month === period && c.line === line).flatMap(c => c.sources).filter(s => s.id === origin).reduce((sum, s) => sum + s.amount, 0)
const sourceCash = (calc: Calculation, origin: string, period: string, received: boolean) => (calc.cashDrivers ?? []).filter(d => d.source === origin && d.month === period && (received ? d.amount > 0 : d.amount < 0)).reduce((sum, d) => sum + (received ? d.amount : -d.amount), 0)

export async function validateElimination(c: Context, rule: Data, from: Data, to: Data, left: Calculation, right: Calculation, peers: Data[]) {
 const group = get(c.s, 'entity-group', rule.group)
 const expense = find(c.s, 'line', rule.expenseLine)
 requireThat(find(c.s, 'line', rule.revenueLine)?.type === 'revenue' && expense?.type === rule.expenseType && !expense?.payroll && !expense?.nonCash, 'The source line changed; review this elimination again', 409)
 requireThat(from.group === rule.group && to.group === rule.group && from.id !== to.id, 'Choose two different entities in this consolidation group')
 requireThat(left.months.includes(rule.month) && right.months.includes(rule.month), 'The elimination month must exist in both entity plans')
 const fromCharge = entityMove(c, from, group.reporting, rule.fromAmount, rule.month, 'average')
 const toCharge = entityMove(c, to, group.reporting, rule.toAmount, rule.month, 'average')
 const receivable = entityMove(c, from, group.reporting, rule.receivable, rule.month, 'monthEnd')
 const payable = entityMove(c, to, group.reporting, rule.payable, rule.month, 'monthEnd')
 const cashReceived = entityMove(c, from, group.reporting, rule.cashReceived, rule.month, 'average')
 const cashPaid = entityMove(c, to, group.reporting, rule.cashPaid, rule.month, 'average')
 requireThat(fromCharge === toCharge, 'The intercompany charge and expense must match in the reporting currency', 409)
 requireThat(receivable === payable, 'The intercompany receivable and payable must match in the reporting currency', 409)
 requireThat(cashReceived === cashPaid, 'Intercompany cash received and paid must match in the reporting currency', 409)
 const rules = [...peers.filter(r => r.id !== rule.id && r.month === rule.month), rule]
 if(rule.ledgerEvidence)await validateLedgerElimination(c,rule,from,to,peers)
 else {
 const used = (entity: Data, origin: string, field: string, sender: boolean) => rules.filter(r => (sender ? r.fromEntity : r.toEntity) === entity.id && (sender ? r.fromOrigin : r.toOrigin) === origin).reduce((sum, r) => sum + r[field], 0)
 requireThat(used(from, rule.fromOrigin, 'fromAmount', true) <= sourceAmount(left, rule.fromOrigin, rule.month, rule.revenueLine), 'Eliminated revenue exceeds the selected source charge', 409)
 requireThat(used(to, rule.toOrigin, 'toAmount', false) <= sourceAmount(right, rule.toOrigin, rule.month, rule.expenseLine), 'Eliminated expense exceeds the selected source charge', 409)
 requireThat(used(from, rule.fromOrigin, 'cashReceived', true) <= sourceCash(left, rule.fromOrigin, rule.month, true), 'Eliminated cash received exceeds the selected source receipts', 409)
 requireThat(used(to, rule.toOrigin, 'cashPaid', false) <= sourceCash(right, rule.toOrigin, rule.month, false), 'Eliminated cash paid exceeds the selected source payments', 409)
 const outstanding = (calc: Calculation, origin: string, received: boolean, line: string) => calc.months.filter(m => m <= rule.month).reduce((sum, m) => sum + sourceAmount(calc, origin, m, line) - sourceCash(calc, origin, m, received), 0)
 requireThat(used(from, rule.fromOrigin, 'receivable', true) <= outstanding(left, rule.fromOrigin, true, rule.revenueLine), 'Eliminated receivable exceeds the selected source outstanding balance', 409)
 requireThat(used(to, rule.toOrigin, 'payable', false) <= outstanding(right, rule.toOrigin, false, rule.expenseLine), 'Eliminated payable exceeds the selected source outstanding balance', 409)

 }
 const leftBalance = left.balanceSheet?.find(b => b.month === rule.month), rightBalance = right.balanceSheet?.find(b => b.month === rule.month)
 requireThat(leftBalance && rightBalance, 'Both entity balance sheets must be available', 409)
 requireThat(!leftBalance.incompleteReasons?.length && !rightBalance.incompleteReasons?.length && !leftBalance.balanceDifference && !rightBalance.balanceDifference, 'Review entity statement differences before eliminating balances', 409)
 const fromBalances = rules.filter(r => r.fromEntity === from.id).reduce((sum, r) => sum + r.receivable, 0)
 const toBalances = rules.filter(r => r.toEntity === to.id).reduce((sum, r) => sum + r.payable, 0)
 requireThat(fromBalances <= leftBalance.receivables && toBalances <= rightBalance.payables, 'Eliminated balances exceed the entity receivables or payables', 409)
 return { charge: fromCharge, receivable, payable, cashReceived, cashPaid }
}

export async function entityEliminations(c: Context, op: string, b: Data) {
 if (op === 'entity-elimination-delete') {
  const rule = get(c.s, 'entity-elimination', b.id)
  remove(c.s, 'entity-elimination', rule.id)
  c.activity.push({ action: op, record: rule.id, scenario: rule.group, detail: { before: rule } })
  return { removed: rule.id }
 }
 const prior = b.id ? get(c.s, 'entity-elimination', b.id) : undefined
 requireThat(b.reviewed === true, 'Review both source charges, balances and settlements before saving this rule')
 const from = get(c.s, 'entity', b.fromEntity), to = get(c.s, 'entity', b.toEntity)
 const [{ model: leftModel, calculation: left }, { model: rightModel, calculation: right }] = await Promise.all([entityCalculation(c, from), entityCalculation(c, to)])
 const ledger=b.evidence==='ledger'
 requireThat(!ledger||left.actualsThrough&&left.actualsThrough>=b.month&&right.actualsThrough&&right.actualsThrough>=b.month,'Ledger eliminations require both entity months closed',409)
 const fromInput = Object.values(leftModel.inputs).flat().find(i => i.originId === b.fromOrigin)
 const toInput = Object.values(rightModel.inputs).flat().find(i => i.originId === b.toOrigin)
 requireThat(ledger||fromInput?.line && toInput?.line, 'Choose the two source input origins')
 const revenueLine = leftModel.lines.find(l => l.id === (ledger?b.revenueLine:fromInput!.line)), expenseLine = rightModel.lines.find(l => l.id === (ledger?b.expenseLine:toInput!.line))
 requireThat(revenueLine?.type === 'revenue' && expenseLine && ['cost-of-sales', 'operating-expense'].includes(expenseLine.type) && !expenseLine.payroll && !expenseLine.nonCash, 'Eliminations need a revenue source and a cash, non-payroll expense source')
 const rule = { id: prior?.id ?? uid(), name: text(b.name, 'Elimination name'), group: text(b.group ?? from.group, 'Consolidation scenario'), month: month(b.month), fromEntity: from.id, toEntity: to.id, fromOrigin: ledger?'ledger':fromInput!.originId, toOrigin: ledger?'ledger':toInput!.originId, revenueLine: revenueLine.id, expenseLine: expenseLine.id, expenseType: expenseLine.type,
  fromAmount: cents(b.fromAmount, 'Local revenue to eliminate'), toAmount: cents(b.toAmount, 'Local expense to eliminate'), receivable: cents(b.receivable, 'Local intercompany receivable'), payable: cents(b.payable, 'Local intercompany payable'), cashReceived: cents(b.cashReceived, 'Local intercompany cash received'), cashPaid: cents(b.cashPaid, 'Local intercompany cash paid'), by: c.x.actor.email, at: c.now }
 requireThat([rule.fromAmount, rule.toAmount, rule.receivable, rule.payable, rule.cashReceived, rule.cashPaid].some(amount => amount > 0), 'Enter a charge, outstanding balance or cash settlement to eliminate')
 if(ledger){const [l,r]=await Promise.all([entityLedgerEvidence(c,from,rule.month),entityLedgerEvidence(c,to,rule.month)]);Object.assign(rule,{ledgerEvidence:{fromFingerprint:l.fingerprint,toFingerprint:r.fingerprint,...Object.fromEntries(['fromAmount','toAmount','receivable','payable','cashReceived','cashPaid'].map(field=>[field,b.ledgerEvidence?.[field]??[]]))}})}
 await validateElimination(c, rule, from, to, left, right, all(c.s, 'entity-elimination'))
 put(c.s, 'entity-elimination', rule.id, rule)
 c.activity.push({ action: op, record: rule.id, scenario: rule.group, detail: { before: prior ?? null, after: rule } })
 return rule
}
