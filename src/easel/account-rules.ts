import { balanceTarget } from './balance-targets'
// Reusable source-account decisions. Exact picks override reusable rules;
// conflicting rule targets stay unresolved rather than choosing by accident.
import { all, find, get, put, remove, choice, requireThat, text, uid, type Data, type State } from './types'
import { requireFinance } from './access'
import type { Context } from './context'

const numeric = (v: string) => /^\d+$/.test(v)
export function resolveAccount(s: State, account: string, accountType = '') {
 const exact = find(s, 'account-map', account)
 if (exact) return { target: exact.target as string, ruleIds: [] as string[], mappingStatus: 'mapped', mapping: exact, rules: [] as Data[] }
 const rules = all(s, 'account-rule').filter(r => r.match === 'prefix' ? account.startsWith(r.from) : r.match === 'type' ? !!accountType && accountType === r.from : numeric(account) && BigInt(account) >= BigInt(r.from) && BigInt(account) <= BigInt(r.to)).sort((a, b) => a.id.localeCompare(b.id))
 const targets = [...new Set<string>(rules.map(r => r.target))]
 return { target: targets.length === 1 ? targets[0] : null, ruleIds: rules.map(r => r.id as string), mappingStatus: targets.length === 1 ? 'mapped' : targets.length ? 'ambiguous' : 'unmapped', mapping: null, rules }
}

export function accountRules(c: Context, op: string, b: Data): Data | undefined {
 if (op !== 'account-rule' && op !== 'account-rule-delete') return undefined
 requireFinance(c.x)
 if (op === 'account-rule-delete') {
  const rule = get(c.s, 'account-rule', b.id)
  remove(c.s, 'account-rule', rule.id)
  c.activity.push({ action: op, record: rule.id, detail: { rule } })
  return { removed: rule.id }
 }
 const id = b.id ? get(c.s, 'account-rule', b.id).id : uid()
 const match = choice(b.match, ['range', 'prefix', 'type'] as const, 'a rule match')
 const from = text(b.from, match === 'range' ? 'First account' : match === 'prefix' ? 'Account prefix' : 'Source account type', 100)
 const to = match === 'range' ? text(b.to, 'Last account', 100) : ''
 if (match === 'range') requireThat(numeric(from) && numeric(to) && BigInt(from) <= BigInt(to), 'Account ranges need whole-number codes with the first no greater than the last')
 const target = b.target === 'excluded' || balanceTarget(b.target) ? b.target : get(c.s, 'line', b.target, 'planning line').id
 put(c.s, 'account-rule', id, { match, from, to, target })
 c.activity.push({ action: op, record: id, detail: { match, from, to, target } })
 return get(c.s, 'account-rule', id)
}
