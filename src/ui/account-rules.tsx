import { BALANCE_TARGETS } from '../easel/balance-targets'
import { useState } from 'react'
import { Action, command, Field, Form, Table, type D } from './shared'

/** Existing settings controls, with matching semantics visible before saving. */
export function AccountRules({ state, refresh }: { state: D; refresh: () => Promise<void> }) {
 const [match, setMatch] = useState('range')
 const targets = [...state.lines.map((l: D) => ({ value: l.id, label: l.name })), { value: 'excluded', label: 'Exclude (not planned)' }, ...BALANCE_TARGETS]
 const target = (id: string) => targets.find(t => t.value === id)?.label ?? id
 return <section className="card">
  <h2>Reusable account rules</h2>
  <p className="muted">New source accounts inherit matching rules. Single-account mappings take priority. Rules that disagree leave the account blocked until you resolve them.</p>
  <Table caption="Reusable account rules" heads={['Match', 'Source', 'Maps to', '']}>
   {state.accountRules.map((r: D) => <tr key={r.id}><td>{r.match === 'range' ? 'Number range' : r.match === 'prefix' ? 'Prefix' : 'Account type'}</td><td>{r.from}{r.match === 'range' ? ` through ${r.to}` : ''}</td><td>{target(r.target)}</td><td><Action label="Delete rule" kind="danger" confirm="Delete this rule? Any accepted actuals that lose their mapping will block the affected periods until mapped again." run={async () => { await command('account-rule-delete', { id: r.id }); await refresh() }} /></td></tr>)}
  </Table>
  <Form submit="Add account rule" onSubmit={async (body, form) => { await command('account-rule', body); form.reset(); await refresh() }}>
   <label>Match method<select aria-label="Match method" name="match" value={match} onChange={e => setMatch(e.target.value)}><option value="range">Account-number range</option><option value="prefix">Account prefix</option><option value="type">Source account type</option></select></label>
   <Field key={match} label={match === 'range' ? 'First account' : match === 'prefix' ? 'Account prefix' : 'Source account type'} name="from" />
   {match === 'range' && <Field label="Last account" name="to" />}
   <Field label="Rule maps to" name="target" options={targets} />
  </Form>
  <p className="muted">Ranges include both ends and compare whole-number account codes numerically, including leading zeros. Prefix and account-type matches are case sensitive. Surrounding spaces are trimmed. Choose an Account type column in an actuals CSV to use type rules.</p>
 </section>
}
