// Linked statements use integer minor units and the same captured calculation
// as profit/cash. No balancing plug is added when inputs disagree.
import { calculateAssets } from './assets'
import type { Calculation, Model } from './engine'
import { addMonths } from './months'
import { formatMoney } from './units'

export type BalanceMonth = {
 month: string; cash: number; receivables: number; inventory: number; capitalPrepayments: number; fixedAssets: number; assets: number
 salesTaxPayable?: number; prepaid?: number; accruedLiabilities?: number; deferredRevenue?: number; unbilledRevenue?: number; payables: number; capitalPayables: number; nonCashReserve: number; debt: number; liabilities: number
 openingEquity: number; retainedEarnings: number; contributedEquity: number; equity: number; balanceDifference: number; cashDifference: number
 incompleteReasons?: string[]; trace: string; causes: string[]
}
export type CashFlowMonth = {
 month: string; opening: number; netIncome: number; nonCashExpense: number; receivablesChange: number; payablesChange: number
 salesTaxPayableChange?: number; prepaidChange?: number; accruedLiabilitiesChange?: number; deferredRevenueChange?: number; unbilledRevenueChange?: number; inventoryChange: number; operating: number; capex: number; disposalProceeds: number; investing: number; financing: number; change: number; closing: number; difference: number; incompleteReasons?: string[]; trace: string
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
 const openingWorking = calc.workingCapital?.opening
 const openingContracts = calc.contracts?.opening
 let receivables = (openingContracts?.receivables ?? 0) + (scenario.cash?.receivablesCents ?? 0), payables = scenario.cash?.payablesCents ?? 0
 const openingEquity = (scenario.cash?.openingCents ?? 0) + receivables + openingFixed + openingCapital.prepayments + (openingContracts?.unbilledRevenue ?? 0) - (openingContracts?.deferredRevenue ?? 0) - payables - openingCapital.payables - (calc.financing?.totals[0]?.openingDebt ?? 0) + (openingWorking?.prepaid ?? 0) - (openingWorking?.accruedLiabilities ?? 0) - (calc.taxes?.openingSalesTaxPayableCents??0)
 let retainedEarnings = 0, nonCashReserve = 0, deferredRevenue = openingContracts?.deferredRevenue ?? 0, unbilledRevenue = openingContracts?.unbilledRevenue ?? 0
 const balanceSheet: BalanceMonth[] = [], cashFlow: CashFlowMonth[] = []
 for (const [i, month] of calc.months.entries()) {
  const profit = calc.profit[i], cash = calc.cash[i]
  const salesTax=calc.taxes?.sales[i],salesTaxPayable=salesTax?.payableCents??0
  const salesTaxPayableChange=salesTaxPayable-(i?calc.taxes?.sales[i-1].payableCents??0:calc.taxes?.openingSalesTaxPayableCents??0)
  const working = calc.workingCapital?.months[i], priorWorking = i ? calc.workingCapital?.months[i - 1] : openingWorking
  const prepaid = working?.prepaid ?? 0, accruedLiabilities = working?.accruedLiabilities ?? 0
  const prepaidChange = (priorWorking?.prepaid ?? 0) - prepaid, accruedLiabilitiesChange = accruedLiabilities - (priorWorking?.accruedLiabilities ?? 0)
  const funding = calc.financing?.totals[i]
  const debt = funding?.closingDebt ?? 0, contributedEquity = funding?.cumulativeEquity ?? 0
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
  const inventory = calc.inventory?.[i]?.closing ?? 0, priorInventory = calc.inventory?.[i]?.opening ?? 0
  const inventoryChange = priorInventory - inventory
  const priorReceivables = receivables, priorPayables = payables
  const contract = calc.contracts?.months[i]
  const deferredRevenueChange = (contract?.deferredRevenue ?? 0) - deferredRevenue
  const unbilledRevenueChange = unbilledRevenue - (contract?.unbilledRevenue ?? 0)
  deferredRevenue = contract?.deferredRevenue ?? 0; unbilledRevenue = contract?.unbilledRevenue ?? 0
  // A closed aggregate revenue cell cannot supply invoice actuals. Keep known
  // invoice AR; P&L disagreements remain statement differences, never AR plugs.
  const contractKeys = new Set((calc.contracts?.rows ?? []).filter(r => r.month === month && (r.revenue || r.billings || r.receivables || r.deferredRevenue)).map(r => `${r.line}|${r.department}`))
  const contractRecognition = closed ? sum(calc.cells.filter(c => c.month === month && c.basis === 'actual' && contractKeys.has(`${c.line}|${c.department}`)).map(c => c.amount)) : contract?.revenue ?? 0
  receivables += profit.revenue + (contract?.billings ?? 0) - contractRecognition - (cash.collections - disposalProceeds - (funding?.draws ?? 0) - (funding?.equityRaised ?? 0) - (salesTax?.collectedCents??0))
  const workingKeys = new Set((calc.workingCapital?.rows ?? []).filter(r => r.month === month).map(r => `${r.line}|${r.department}`))
  const attributedExpense = closed ? sum(calc.cells.filter(c => c.month === month && workingKeys.has(`${c.line}|${c.department}`)).map(c => c.amount)) : (working?.prepaidExpense ?? 0) + (working?.accruedExpense ?? 0)
  payables += profit.costOfSales + profit.operatingExpenses - nonCashExpense - attributedExpense + inventory - priorInventory - (cash.payments - capex - (funding?.repayments ?? 0) - (working?.prepaidPayments ?? 0) - (working?.accruedPayments ?? 0) - (salesTax?.remittedCents??0))
  retainedEarnings += profit.profit
  const cap = capital(month), fixedAssets = sum(assetRows.map(a => a.closingBookValue))
  const totalAssets = cash.closing + receivables + unbilledRevenue + inventory + cap.prepayments + fixedAssets + prepaid
  const liabilities = payables + deferredRevenue + cap.payables + nonCashReserve + debt + accruedLiabilities + salesTaxPayable, equity = openingEquity + retainedEarnings + contributedEquity
  const balanceDifference = totalAssets - liabilities - equity
  const receivablesChange = priorReceivables - receivables, payablesChange = payables - priorPayables
  const operating = profit.profit + nonCashExpense + receivablesChange + payablesChange + inventoryChange + deferredRevenueChange + unbilledRevenueChange + prepaidChange + accruedLiabilitiesChange + salesTaxPayableChange
  const investing = -capex + disposalProceeds, financing = funding?.financingCash ?? 0
  const change = operating + investing + financing, closing = cash.opening + change
  const difference = closing - cash.closing
  const causes: string[] = [...(cash.incompleteReasons ?? [])]
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
  const trace = `${cash.incompleteReasons?.length ? "INCOMPLETE: known invoice/cash schedule; unresolved actual receipt allocation. " : ""}Cash ${money(cash.closing)} + receivables ${money(receivables)} + unbilled contract revenue ${money(unbilledRevenue)} + inventory estimate ${money(inventory)} + prepaid expenses ${money(prepaid)} + capital prepayments ${money(cap.prepayments)} + fixed assets ${money(fixedAssets)} = assets ${money(totalAssets)}; accrued payroll/bonuses ${money(accruedLiabilities)} + deferred revenue ${money(deferredRevenue)} + payables ${money(payables)} + capital payables ${money(cap.payables)} + other noncash reserve ${money(nonCashReserve)} + debt ${money(debt)} + sales tax payable ${money(salesTaxPayable)} = liabilities ${money(liabilities)}; opening equity estimate ${money(openingEquity)} + cumulative net income ${money(retainedEarnings)} + contributed equity ${money(contributedEquity)} = equity ${money(equity)}. Opening equity is opening cash + receivables + unbilled revenue + net fixed assets + capital prepayments − deferred revenue − payables − capital payables − opening debt + prepaid expenses − accrued liabilities, not an imported equity balance. Working-capital opening balances are estimates from entered payment/service schedules (CONNECT-007 owns imported balance-sheet openings).`
  balanceSheet.push({ ...(cash.incompleteReasons ? { incompleteReasons: cash.incompleteReasons } : {}), salesTaxPayable, debt, contributedEquity, month, cash: cash.closing, receivables, prepaid, accruedLiabilities, deferredRevenue, unbilledRevenue, inventory, capitalPrepayments: cap.prepayments, fixedAssets, assets: totalAssets, payables, capitalPayables: cap.payables, nonCashReserve, liabilities, openingEquity, retainedEarnings, equity, balanceDifference, cashDifference: difference, trace, causes })
  cashFlow.push({ ...(cash.incompleteReasons ? { incompleteReasons: cash.incompleteReasons } : {}), salesTaxPayableChange, month, opening: cash.opening, netIncome: profit.profit, nonCashExpense, receivablesChange, payablesChange, prepaidChange, accruedLiabilitiesChange, deferredRevenueChange, unbilledRevenueChange, inventoryChange, operating, capex: -capex, disposalProceeds, investing, financing, change, closing, difference,
   trace: `${cash.incompleteReasons?.length ? "INCOMPLETE: known invoice/cash schedule; unresolved actual receipt allocation. " : ""}Net income ${money(profit.profit)} + noncash expenses ${money(nonCashExpense)} − increase in receivables ${money(-receivablesChange)} + increase in operating payables ${money(payablesChange)} − increase in inventory ${money(-inventoryChange)} + increase in deferred revenue ${money(deferredRevenueChange)} − increase in unbilled revenue ${money(-unbilledRevenueChange)} − increase in prepaid expenses ${money(-prepaidChange)} + increase in accrued payroll/bonuses ${money(accruedLiabilitiesChange)} + increase in sales tax payable ${money(salesTaxPayableChange)} = operating cash ${money(operating)}; capex ${money(-capex)} + disposal proceeds ${money(disposalProceeds)} = investing cash ${money(investing)}; financing ${money(financing)} from planned draws − principal repayments + equity raises; opening ${money(cash.opening)} + net change ${money(change)} = closing ${money(closing)}. Capital prepayments and capital payables reconcile purchase/payment timing on the balance sheet.` })
 }
 return { balanceSheet, cashFlow }
}
