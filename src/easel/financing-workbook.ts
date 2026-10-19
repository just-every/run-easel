import type { FinancingCalculation } from './financing'
import type { Cell, Sheet } from './xlsx-write'
const formula = (expression: string, value: number): Cell => ({ formula: expression, value })

/** Same filtered, captured funding model as the app, with live movement totals. */
export function financingSheets(value: FinancingCalculation, currency: string, prefix = ''): Sheet[] {
 const totals: Cell[][] = [[`${currency} minor units; debt/equity are planning assumptions, never executed payments.`],
  ['Month','Opening debt','Draws','Principal repayments','Closing debt','Scheduled interest','Equity raised','Cumulative equity','Financing cash','Trace']]
 for (const row of value.totals) {
  const r = totals.length + 1
  totals.push([row.month,row.openingDebt,row.draws,row.repayments,formula(`B${r}+C${r}-D${r}`,row.closingDebt),row.interest,row.equityRaised,formula(r === 3 ? `G${r}` : `H${r-1}+G${r}`,row.cumulativeEquity),formula(`C${r}-D${r}+G${r}`,row.financingCash),row.trace])
 }
 const sheets: Sheet[] = [{ name: `${prefix}Financing`, rows: totals }]
 if (value.rows.length) {
  const rows: Cell[][] = [[`${currency} minor units; annual interest in basis points; finance-only instrument terms.`], ['Month','Instrument','Opening principal','Draw','Interest','Principal repayment','Closing principal','Annual rate BPS','Trace']]
  for (const row of value.rows) { const r=rows.length+1; rows.push([row.month,row.name,row.opening,row.draw,row.interest,row.repayment,formula(`C${r}+D${r}-F${r}`,row.closing),row.annualRateBps,row.trace]) }
  sheets.push({ name: `${prefix}Debt schedule`, rows })
 }
 if (value.equityRows.length) sheets.push({ name: `${prefix}Equity events`, rows: [[`${currency} minor units`],['Month','Event','Amount','Trace'],...value.equityRows.map(row=>[row.month,row.name,row.amount,row.trace])] })
 sheets.push({ name: `${prefix}Covenants`, rows: [['Exact bounds: minimums include equality; maximum debt/EBITDA uses annualized monthly EBITDA and exact cross multiplication.'],['Month','Test','Numerator','Denominator','Threshold','Threshold units','Result','First breach','Trace'],...value.covenants.map(row=>[row.month,row.kind,row.numerator,row.denominator,row.threshold,row.thresholdUnits,row.status,row.firstBreachMonth??'',row.trace])] })
 return sheets
}
