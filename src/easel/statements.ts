// Linked statements use integer minor units and the same captured calculation
// as profit/cash. No balancing plug is added when inputs disagree.
import { calculateAssets } from './assets'
import type { Calculation, Model } from './engine'
import { addMonths } from './months'
import { formatMoney } from './units'

export type BalanceMonth = {
 month: string; cash: number; receivables: number; capitalPrepayments: number; fixedAssets: number; assets: number
 payables: number; capitalPayables: number; nonCashReserve: number; liabilities: number
 openingEquity: number; retainedEarnings: number; equity: number; balanceDifference: number; cashDifference: number
 trace: string; causes: string[]
}
export type CashFlowMonth = {
 month: string; opening: number; netIncome: number; nonCashExpense: number; receivablesChange: number; payablesChange: number
 operating: number; capex: number; disposalProceeds: number; investing: number; financing: number; change: number; closing: number; difference: number; trace: string
}

export function statements(model: Model, calc: Calculation): { balanceSheet: BalanceMonth[]; cashFlow: CashFlowMonth[] } {
 const { scenario, inputs, lines } = model
 const assets = inputs.asset ?? [], categories = inputs['asset-category'] ?? []
 const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
 const money = (n: number) => formatMoney(n, calc.currency)
 const first = calc.months[0], before = addMonths(first, -1)
 const priorAssets = calculateAssets(assets.filter(a => a.kind === 'purchase'), categories, [before], null, calc.currency)
 const openingFixed = sum(priorAssets.filter(a => a.month === before).map(a => a.closingBookValue)) + sum(assets.filter(a => a.kind === 'existing').map(a => a.costCents - a.openingAccumulatedCents))
 const capital = (m: string) => ({
  prepayments: sum(assets.filter(a => a.kind === 'purchase' && (a.paymentMonth || a.start) <= m && m < a.start).map(a => a.costCents)),
  payables: sum(assets.filter(a => a.kind === 'purchase' && a.start <= m && m < (a.paymentMonth || a.start)).map(a => a.costCents)),
 })
 const openingCapital = capital(before)
 let receivables = scenario.cash?.receivablesCents ?? 0, payables = scenario.cash?.payablesCents ?? 0
 const openingEquity = (scenario.cash?.openingCents ?? 0) + receivables + openingFixed + openingCapital.prepayments - payables - openingCapital.payables
 let retainedEarnings = 0, nonCashReserve = 0
 const balanceSheet: BalanceMonth[] = [], cashFlow: CashFlowMonth[] = []
 for (const [i, month] of calc.months.entries()) {
  const profit = calc.profit[i], cash = calc.cash[i]
  const assetRows = (calc.assets ?? []).filter(a => a.month === month)
  const capex = sum(assetRows.map(a => a.capex)), disposalProceeds = sum(assetRows.map(a => a.disposalProceeds))
  const nonCashLines = lines.filter(l => l.nonCash)
  const nonCashExpense = sum(nonCashLines.map(l => calc.lineTotals[l.id]?.[month] ?? 0))
  const closed = month <= (calc.actualsThrough ?? '')
  // Generic noncash expenses accumulate a separately labelled reserve. Asset
  // expenses reduce book value instead; a closed-month mismatch stays visible.
  const reserveExpense = sum(nonCashLines.map(l => {
   const total = calc.lineTotals[l.id]?.[month] ?? 0
   const scheduled = assetRows.filter(a => a.line === l.id)
   return closed && scheduled.length ? 0 : total - sum(scheduled.map(a => a.expense))
  }))
  nonCashReserve += reserveExpense
  const priorReceivables = receivables, priorPayables = payables
  receivables += profit.revenue - (cash.collections - disposalProceeds)
  payables += profit.costOfSales + profit.operatingExpenses - nonCashExpense - (cash.payments - capex)
  retainedEarnings += profit.profit
  const cap = capital(month), fixedAssets = sum(assetRows.map(a => a.closingBookValue))
  const totalAssets = cash.closing + receivables + cap.prepayments + fixedAssets
  const liabilities = payables + cap.payables + nonCashReserve, equity = openingEquity + retainedEarnings
  const balanceDifference = totalAssets - liabilities - equity
  const receivablesChange = priorReceivables - receivables, payablesChange = payables - priorPayables
  const operating = profit.profit + nonCashExpense + receivablesChange + payablesChange
  const investing = -capex + disposalProceeds, financing = 0
  const change = operating + investing + financing, closing = cash.opening + change
  const difference = closing - cash.closing
  const causes: string[] = []
  if (balanceDifference !== 0) {
   causes.push(`Assets minus liabilities and equity = ${money(balanceDifference)}; no balancing adjustment was made.`)
   if (closed && assetRows.length) {
    for (const line of nonCashLines) {
     const scheduled = sum(assetRows.filter(a => a.line === line.id).map(a => a.expense))
     const recorded = calc.lineTotals[line.id]?.[month] ?? 0
     if (assetRows.some(a => a.line === line.id) && recorded !== scheduled) causes.push(`${month}, line ${line.id} (${line.name}): accepted noncash expense ${money(recorded)} versus asset-schedule expense ${money(scheduled)}. Balance-sheet actuals are not yet available (CONNECT-007).`)
    }
   }
   for (const row of assetRows) causes.push(`Asset schedule: opening ${money(row.openingBookValue)}, depreciation ${money(row.depreciation)}, disposal book value ${money(row.disposalBookValue)}, closing ${money(row.closingBookValue)}.`)
  }
  if (difference !== 0) causes.push(`Indirect closing cash differs from the direct cash schedule by ${money(difference)}.`)
  const trace = `Cash ${money(cash.closing)} + receivables ${money(receivables)} + capital prepayments ${money(cap.prepayments)} + fixed assets ${money(fixedAssets)} = assets ${money(totalAssets)}; payables ${money(payables)} + capital payables ${money(cap.payables)} + other noncash reserve ${money(nonCashReserve)} = liabilities ${money(liabilities)}; opening equity estimate ${money(openingEquity)} + cumulative net income ${money(retainedEarnings)} = equity ${money(equity)}. Opening equity is opening cash + receivables + net fixed assets + capital prepayments − payables − capital payables, not an imported equity balance.`
  balanceSheet.push({ month, cash: cash.closing, receivables, capitalPrepayments: cap.prepayments, fixedAssets, assets: totalAssets, payables, capitalPayables: cap.payables, nonCashReserve, liabilities, openingEquity, retainedEarnings, equity, balanceDifference, cashDifference: difference, trace, causes })
  cashFlow.push({ month, opening: cash.opening, netIncome: profit.profit, nonCashExpense, receivablesChange, payablesChange, operating, capex: -capex, disposalProceeds, investing, financing, change, closing, difference,
   trace: `Net income ${money(profit.profit)} + noncash expenses ${money(nonCashExpense)} − increase in receivables ${money(-receivablesChange)} + increase in operating payables ${money(payablesChange)} = operating cash ${money(operating)}; capex ${money(-capex)} + disposal proceeds ${money(disposalProceeds)} = investing cash ${money(investing)}; financing ${money(financing)} (no financing capability yet); opening ${money(cash.opening)} + net change ${money(change)} = closing ${money(closing)}. Capital prepayments and capital payables reconcile purchase/payment timing on the balance sheet.` })
 }
 return { balanceSheet, cashFlow }
}
