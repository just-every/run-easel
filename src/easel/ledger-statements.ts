// Anchor statements at accepted actual balances, retaining every unexplained
// movement as a visible difference. No cash receipt, asset or equity plug.
import type { Calculation, Model } from './engine'
import type { LedgerContext } from './ledger-context'
import type { BalanceMonth } from './statements'
import { requireThat, type Data } from './types'

const targets = { cash: 'cash', receivables: 'bs:receivables', prepaid: 'bs:prepaid', fixedAssets: 'bs:fixed-assets', payables: 'bs:payables', accruedLiabilities: 'bs:accrued-liabilities', deferredRevenue: 'bs:deferred-revenue', debt: 'bs:debt', openingEquity: 'bs:equity' } as const
const amount = (trial: Data, target: string): number => trial.balances.find((b: Data) => b.target === target)?.amount ?? 0
export function ledgerStatements(model: Model, calc: Calculation, ledger: LedgerContext): Calculation {
 const through = calc.actualsThrough
 if (!through || !calc.balanceSheet || !calc.cashFlow) return calc
 const anchorIndex = calc.months.indexOf(through)
 if (anchorIndex < 0) return calc
 const base = calc.balanceSheet.map(b => ({ ...b })), baseCash = calc.cash.map(c => ({ ...c }))
 const anchor = ledger.trials.find(t => t.period === through)
 requireThat(anchor?.balanced, `Closed balance-sheet trial balance for ${through} is no longer zero; import a correcting journal`, 409)
 const lineIds = new Set(model.lines.map(l => l.id))
 const income = (t: Data) => -t.accounts.filter((a: Data) => lineIds.has(a.target)).reduce((n: number, a: Data) => n + a.amount, 0)
 const actual = (b: BalanceMonth, t: Data) => {
  for (const [field, target] of Object.entries(targets)) (b as Data)[field] = amount(t, target)
  b.retainedEarnings = income(t); b.contributedEquity = 0; b.equity = b.openingEquity + b.retainedEarnings
 }
 const actualAnchor = { ...base[anchorIndex] }; actual(actualAnchor, anchor)
 let previous: BalanceMonth | undefined
 for (const [i, month] of calc.months.entries()) {
  const b = calc.balanceSheet[i], direct = calc.cash[i], flow = calc.cashFlow[i]
  const closed = month <= through, trial = ledger.trials.find(t => t.period === month)
  const priorTrial = ledger.trials.filter(t => t.period < month).at(-1)
  if (closed) {
   requireThat(trial?.balanced, `Closed trial balance for ${month} is unavailable or unbalanced`, 409)
   actual(b, trial)
   direct.opening = priorTrial ? amount(priorTrial, 'cash') : baseCash[i].opening
   direct.collections = trial.cashReceived; direct.payments = trial.cashPaid; direct.closing = b.cash
   direct.trace = `Accepted cash journals at ${month}: opening ${direct.opening} + debit cash movements ${direct.collections} − credit cash movements ${direct.payments} = ${direct.closing} minor units. Imported balances replace estimates; source trial difference ${trial.difference}.`
  } else {
   for (const field of Object.keys(targets)) (b as Data)[field] = ((base[i] as Data)[field] ?? 0) + ((actualAnchor as Data)[field] ?? 0) - ((base[anchorIndex] as Data)[field] ?? 0)
   b.retainedEarnings = base[i].retainedEarnings + actualAnchor.retainedEarnings - base[anchorIndex].retainedEarnings
   b.contributedEquity = base[i].contributedEquity - base[anchorIndex].contributedEquity
   direct.opening = calc.cash[i - 1].closing
   direct.closing = direct.opening + direct.collections - direct.payments
   b.cash = direct.closing
   direct.trace = `Opening cash from accepted ${through} balance, then entered future receipt/payment schedules. ${direct.opening} + ${direct.collections} − ${direct.payments} = ${direct.closing} minor units. ${direct.trace}`
  }
  b.assets = b.cash + b.receivables + (b.prepaid ?? 0) + b.fixedAssets + b.inventory + b.capitalPrepayments + (b.unbilledRevenue ?? 0)
  b.liabilities = b.payables + (b.accruedLiabilities ?? 0) + (b.deferredRevenue ?? 0) + b.debt + b.capitalPayables + b.nonCashReserve + (b.salesTaxPayable ?? 0)
  b.equity = b.openingEquity + b.retainedEarnings + b.contributedEquity
  b.balanceDifference = b.assets - b.liabilities - b.equity
  const prior = previous ?? (priorTrial ? (() => { const p = { ...b }; actual(p, priorTrial); return p })() : undefined)
  flow.opening = direct.opening
  if (prior) {
   flow.receivablesChange = prior.receivables - b.receivables
   flow.payablesChange = b.payables - prior.payables
   flow.prepaidChange = (prior.prepaid ?? 0) - (b.prepaid ?? 0)
   flow.accruedLiabilitiesChange = (b.accruedLiabilities ?? 0) - (prior.accruedLiabilities ?? 0)
   flow.deferredRevenueChange = (b.deferredRevenue ?? 0) - (prior.deferredRevenue ?? 0)
  }
  if (closed && prior) flow.financing = b.debt - prior.debt + b.equity - prior.equity - flow.netIncome
  flow.operating = flow.netIncome + flow.nonCashExpense + flow.receivablesChange + flow.payablesChange + (flow.prepaidChange ?? 0) + (flow.accruedLiabilitiesChange ?? 0) + (flow.deferredRevenueChange ?? 0) + (flow.unbilledRevenueChange ?? 0) + flow.inventoryChange + (flow.salesTaxPayableChange ?? 0)
  flow.change = flow.operating + flow.investing + flow.financing
  flow.closing = flow.opening + flow.change
  flow.difference = flow.closing - direct.closing
  b.cashDifference = flow.difference
  const issues: string[] = []
  for (const [target, total] of [['bs:prepaid', b.prepaid], ['bs:accrued-liabilities', b.accruedLiabilities], ['bs:deferred-revenue', b.deferredRevenue], ['bs:fixed-assets', b.fixedAssets]] as const) {
   if (!closed && amount(anchor, target) !== 0 && !ledger.allocations.some(a => a.month === through && a.target === target)) issues.push(`${target}: imported opening ${amount(anchor, target)} minor units has no reviewed schedule attribution. Balance ${total}; future service, settlement or depreciation remains unresolved.`)
  }
  if (b.balanceDifference) issues.push(`Assets minus liabilities and equity ${b.balanceDifference} minor units; accepted balances and entered schedules disagree. No balancing adjustment was made.`)
  if (flow.difference) issues.push(`Indirect closing cash differs from accepted/direct cash by ${flow.difference} minor units; source timing or classification remains unresolved.`)
  b.causes = issues
  const source = closed ? month : through
  b.trace = `Imported balance-sheet opening from accepted cumulative ${source} trial balance (${anchor.accounts.reduce((n: number, a: Data) => n + a.rows, 0)} source rows). Opening equity is the imported equity account, with unclosed P&L shown separately as retained earnings. Forecast movements follow entered schedules; allocations replace their corresponding estimated openings. Assets ${b.assets} − liabilities ${b.liabilities} − equity ${b.equity} = ${b.balanceDifference} minor units. ${issues.join(' ')}`.trim()
  flow.trace = `Accepted ${source} balances replace opening estimates; net income ${flow.netIncome}, noncash ${flow.nonCashExpense}, receivables change ${flow.receivablesChange}, payables change ${flow.payablesChange}, prepaid change ${flow.prepaidChange}, accrual change ${flow.accruedLiabilitiesChange}, deferred change ${flow.deferredRevenueChange}; operating ${flow.operating}, investing ${flow.investing}, financing ${flow.financing}. Opening ${flow.opening} + change ${flow.change} = indirect closing ${flow.closing}; direct ${direct.closing}; difference ${flow.difference}. ${closed ? 'Financing is the observed net debt change plus equity change excluding net income; equity/P&L closing transfers therefore cancel.' : 'Future financing follows entered schedules.'} No inferred receipt or settlement.`
  const reasons = [...new Set(issues)]
  delete b.incompleteReasons; delete direct.incompleteReasons; delete flow.incompleteReasons
  if (reasons.length) { b.incompleteReasons = reasons; direct.incompleteReasons = reasons; flow.incompleteReasons = reasons }
  previous = b
 }
 return calc
}
