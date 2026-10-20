import { balanceTarget } from '../easel/balance-targets'
import { money, Table, type D } from './shared'

export function BalanceActuals({ trials, currency, lines, batches }: { trials: D[]; currency: string; lines: D[]; batches: D[] }) {
 if (!trials.length) return null
 return <section className="card">
  <h2>Balance-sheet actuals and trial balance</h2>
  <p className="muted">Cumulative accepted journal movements through each month, including an opening journal. Do not upload repeated month-end snapshots. Debits and credits include every account, including P&amp;L and excluded accounts. A zero difference checks the imported ledger; it does not certify that the source is complete.</p>
  <p className="muted">Closed ledger balances open forecast statements. Reviewed source allocations replace prepaid, accrued, deferred and asset schedule estimates; unresolved attribution and statement differences stay visible.</p>
  {trials.map(t => <details key={t.period}>
   <summary>{t.period} · {t.blocked ? 'Blocked: unresolved mappings' : t.balanced ? 'Trial balance reconciled' : `Trial balance difference ${money(t.difference, currency)}`}</summary>
   <Table caption={`Trial balance ${t.period}`} heads={['Account', 'Source type', 'Source department', 'Target', 'Debit', 'Credit', 'Rows', 'Source imports']}>
    {t.accounts.map((a: D, i: number) => <tr key={i}><td>{a.account}</td><td>{a.accountType || '—'}</td><td>{a.department}</td><td>{a.blocked ? 'Unresolved mapping' : balanceTarget(a.target)?.label ?? (a.target === 'excluded' ? 'Excluded' : lines.find(l => l.id === a.target)?.name ?? 'Planning line')}</td><td className="num">{money(Math.max(a.amount, 0), currency)}</td><td className="num">{money(Math.max(-a.amount, 0), currency)}</td><td>{a.rows}</td><td>{a.batches.map((id: string) => batches.find(b => b.destination === id)?.file ?? 'Source import').join(', ')}</td></tr>)}
    <tr><th colSpan={4}>Total</th><td className="num">{money(t.debit, currency)}</td><td className="num">{money(t.credit, currency)}</td><td colSpan={2}>Difference {money(t.difference, currency)}</td></tr>
   </Table>
   <Table caption={`Balance-sheet balances ${t.period}`} heads={['Balance', 'Amount', 'Source rows']}>
    {t.balances.map((b: D) => <tr key={b.target}><td>{b.label}</td><td className="num">{b.amount === null ? 'Unavailable: unresolved mappings' : money(b.amount, currency)}</td><td>{b.rows}</td></tr>)}
   </Table>
  </details>)}
 </section>
}
