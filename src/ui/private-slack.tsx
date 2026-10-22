import { useEffect, useState } from 'react'
import { Action, api, Field, Form, type D } from './shared'

/** Explicit bot custody, finance mapping and the mapped person's own consent. */
export function PrivateSlack({ state, refresh }: { state: D; refresh: () => Promise<unknown> }) {
 const [view, setView] = useState<D | null>(null), [error, setError] = useState('')
 const load = async () => { const result = await api('slack-private'); setView(result); setError('') }
 useEffect(() => { let live = true; api('slack-private').then(v => { if (live) { setView(v); setError('') } }, e => { if (live) setError(e.message) }); return () => { live = false } }, [state])
 const run = async (op: string, body: D) => { await api(`slack-private/${op}`, body); await load(); await refresh() }
 const mine = view?.bindings.find((b: D) => b.email === state.me.email)
 return <section className="card" aria-label="Private Slack delivery">
  <h2>Private Slack delivery</h2>
  <p className="muted">Choose private messages for owner questions and cash alerts you may read. Finance maps an exact Slack identity; that person signs in here to consent. Other notifications keep their existing preference. Stopping private delivery blocks those messages until you consent again.</p>
  {error && <p className="error" role="alert">{error}</p>}
  {!view && !error && <p role="status">Reading private Slack settings…</p>}
  {view && <>
   <p>{view.connection.connected ? `Connected to Slack team ${view.connection.team} with bot ${view.connection.bot}.` : 'Private Slack is disconnected.'}</p>
   {view.connection.error && <p role="status">{view.connection.error}</p>}
   {view.connection.revocation && <p role="status">{view.connection.revocation}</p>}
   {view.finance && <>
    {!view.connection.connected && <details><summary>Connect workspace bot</summary>
     <p className="muted">Use a workspace bot with users:read, users:read.email, im:read, im:write and chat:write permissions. Its key is sealed, excluded from archives and never shown again.</p>
     <Form submit="Connect private Slack" onSubmit={async (v, form) => { await run('connection/connect', { ...v, revision: view.connection.revision }); form.reset() }}>
      <Field label="Slack bot key" name="key" type="password" />
      <Field label="I consent to sealed storage of this bot key for private messages" name="consent" type="checkbox" />
     </Form>
    </details>}
    {view.connection.connected && <details><summary>Disconnect workspace bot</summary>
     <Form submit="Disconnect private Slack" onSubmit={v => run('connection/disconnect', { consent: v.consent, revision: view.connection.revision })}>
      <Field label="Revoke this bot key in Slack and remove local custody" name="consent" type="checkbox" />
     </Form>
    </details>}
    {view.connection.connected && <details><summary>Map a native member</summary>
     <Form submit="Verify Slack identity" onSubmit={v => run('bind', { ...v, revision: view.bindings.find((b: D) => b.email === v.email)?.revision ?? '', connectionRevision: view.connection.revision })}>
      <Field label="Native account" name="email" options={view.members.map((m: D) => ({ value: m.email, label: `${m.name || m.email} (${m.email})` }))} />
      <Field label="Slack user ID" name="user" hint="An active human in this team whose profile email exactly matches the native account." />
     </Form>
    </details>}
    {view.bindings.length > 0 && <ul className="plain">{view.bindings.map((b: D) => <li key={b.email}>
     <p style={{ overflowWrap: 'anywhere' }}>{b.email}: {b.user} in {b.team}. {b.status}</p>
     {b.active && <Action label={`Unbind ${b.email}`} kind="quiet" run={() => run('unbind', { email: b.email, revision: b.revision })} />}
    </li>)}</ul>}
   </>}
   {mine?.active && <div className="pack">
    <h3>My private Slack identity</h3>
    <p style={{ overflowWrap: 'anywhere' }}>{mine.email} → {mine.user} in team {mine.team}. {mine.status}</p>
    {mine.enabled ? <Action label="Stop my private Slack messages" run={() => run('revoke', { email: mine.email, revision: mine.revision })} /> : view.connection.connected && mine.connectionRevision === view.connection.revision ? <Form key={mine.revision + view.connection.revision} submit="Consent to my private Slack messages" onSubmit={v => run('consent', { email: mine.email, revision: mine.revision, connectionRevision: view.connection.revision, team: mine.team, user: mine.user, consent: v.consent })}>
     <Field label={`I consent to owner questions and cash alerts sent privately to ${mine.user} in ${mine.team}`} name="consent" type="checkbox" />
    </Form> : <p className="muted">Finance must verify your mapping again after the connection changes.</p>}
   </div>}
   {!mine?.active && <p className="muted">Finance must map your native account before you can consent to private Slack delivery.</p>}
   <p className="muted">Slack acceptance does not confirm delivery or reading. An unknown outcome is never retried. Disconnect removes local custody even if Slack cannot confirm revocation.</p>
  </>}
 </section>
}
