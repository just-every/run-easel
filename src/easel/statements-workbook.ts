import type { BalanceMonth, CashFlowMonth } from './statements'
import type { Cell, Sheet } from './xlsx-write'

const formula = (formula: string, value: number): Cell => ({ formula, value })

/** Captured aggregate statements; subtotals and reconciliation stay editable. */
export function statementSheets(balance: BalanceMonth[], cashFlow: CashFlowMonth[], directCash: { month: string; closing: number }[], currency: string, prefix: string): Sheet[] {
 const balanceRows: Cell[][] = [[`${currency} minor units (100 = 1 currency unit). Opening equity is an estimate from opening net assets, not an imported equity balance.`],
  ['Month', 'Cash', 'Receivables', 'Capital prepayments', 'Net fixed assets', 'Total assets', 'Operating payables', 'Capital payables', 'Other noncash reserve', 'Total liabilities', 'Opening equity estimate', 'Net income', 'Cumulative net income / retained earnings', 'Total equity', 'Assets less liabilities and equity', 'Trace', 'Reconciliation causes', 'Debt', 'Contributed equity', 'Inventory estimate', 'Deferred revenue', 'Unbilled revenue', 'Completeness', 'Prepaid expenses', 'Accrued liabilities', 'Sales tax payable']]
 for (const b of balance) {
  const r = balanceRows.length + 1
  const income = cashFlow.find(c => c.month === b.month)!.netIncome
  balanceRows.push([b.month, b.cash, b.receivables, b.capitalPrepayments, b.fixedAssets,
   formula(`SUM(B${r}:E${r})+T${r}+V${r}+X${r}`, b.assets), b.payables, b.capitalPayables, b.nonCashReserve,
   formula(`SUM(G${r}:I${r})+R${r}+U${r}+Y${r}+Z${r}`, b.liabilities), b.openingEquity, income,
   formula(`SUM(L3:L${r})`, b.retainedEarnings), formula(`K${r}+M${r}+S${r}`, b.equity),
   formula(`F${r}-J${r}-N${r}`, b.balanceDifference), b.trace, b.causes.join('\n'), b.debt ?? 0, b.contributedEquity ?? 0, b.inventory ?? null, b.deferredRevenue ?? null, b.unbilledRevenue ?? null, b.incompleteReasons?.join('\n') ?? 'Complete planning schedule', b.prepaid ?? null, b.accruedLiabilities ?? null, b.salesTaxPayable ?? 0])
 }
 const cashRows: Cell[][] = [[`${currency} minor units (100 = 1 currency unit). Financing contains captured planned borrowing, principal repayments and equity raises; older snapshots retain their original figures. Differences remain visible; no balancing adjustment is made.`],
  ['Month', 'Opening cash', 'Net income', 'Noncash expense', 'Receivables adjustment', 'Operating payables adjustment', 'Operating cash flow', 'Capex cash outflow', 'Disposal proceeds', 'Investing cash flow', 'Financing cash flow', 'Net cash change', 'Indirect closing cash', 'Direct closing cash', 'Indirect less direct closing cash', 'Trace', 'Inventory adjustment', 'Deferred revenue adjustment', 'Unbilled revenue adjustment', 'Completeness', 'Prepaid expense adjustment', 'Accrued liability adjustment', 'Sales tax payable adjustment']]
 for (const c of cashFlow) {
  const r = cashRows.length + 1
  cashRows.push([c.month, c.opening, c.netIncome, c.nonCashExpense, c.receivablesChange, c.payablesChange,
   formula(`SUM(C${r}:F${r})+SUM(Q${r}:S${r})+U${r}+V${r}+W${r}`, c.operating), c.capex, c.disposalProceeds,
   formula(`H${r}+I${r}`, c.investing), c.financing, formula(`G${r}+J${r}+K${r}`, c.change),
   formula(`B${r}+L${r}`, c.closing), directCash.find(d => d.month === c.month)!.closing,
   formula(`M${r}-N${r}`, c.difference), c.trace, c.inventoryChange ?? null, c.deferredRevenueChange ?? null, c.unbilledRevenueChange ?? null, c.incompleteReasons?.join('\n') ?? 'Complete planning schedule', c.prepaidChange ?? null, c.accruedLiabilitiesChange ?? null, c.salesTaxPayableChange ?? 0])
 }
 return [{ name: `${prefix}Balance sheet`, rows: balanceRows }, { name: `${prefix}Indirect cash flow`, rows: cashRows }]
}
