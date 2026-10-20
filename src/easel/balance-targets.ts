// Ledger balances remain separate from P&L planning lines. Amounts are stored
// debit-positive; only presentation converts credit-normal balances.
export const BALANCE_TARGETS = [
 { value: 'cash', label: 'Cash balance', sign: 1 },
 { value: 'bs:receivables', label: 'Receivables', sign: 1 },
 { value: 'bs:prepaid', label: 'Prepaid expenses', sign: 1 },
 { value: 'bs:fixed-assets', label: 'Net fixed assets', sign: 1 },
 { value: 'bs:payables', label: 'Payables', sign: -1 },
 { value: 'bs:accrued-liabilities', label: 'Accrued liabilities', sign: -1 },
 { value: 'bs:deferred-revenue', label: 'Deferred revenue', sign: -1 },
 { value: 'bs:debt', label: 'Debt', sign: -1 },
 { value: 'bs:equity', label: 'Equity', sign: -1 },
] as const
export const balanceTarget = (target: string) => BALANCE_TARGETS.find(t => t.value === target)
