import { useEffect, useState } from 'react'
import { api, Form, useDate, type D } from './shared'

const MODE: Record<string, string> = { email: 'Email each notification', digest: 'Daily email digest at 08:00', chat: 'Chat only (generic notice)' }
const CHANNEL: Record<string, string> = { slack: 'Slack', teams: 'Microsoft Teams', nook: 'Nook' }
const EVENT: Record<string, string> = { mention: 'Mention', returned: 'Submission returned', 'approval-pending': 'Ready for approval', 'metric-task': 'Task assigned' }

/** Each person's single notification preference and their recent notifications. */
export function Notifications({ state }: { state: D }) {
 const displayDate = useDate()
 const [view, setView] = useState<D | null>(null), [error, setError] = useState(''), [mode, setMode] = useState('email')
 const reload = async () => { try { const v = await api('notifications'); setView(v); setMode(v.preference.mode); setError('') } catch (e) { setError((e as Error).message) } }
 useEffect(() => { void reload() }, [state])
 return <section className="card" id="notifications">
  <h2>Notifications</h2>
  {error && <p role="alert" className="error">{error}</p>}
  {view && <>
   <p className="muted">Mentions, returned submissions, budgets ready for approval and assigned tasks notify you here. Chat channels are shared, so they get only a generic notice and a sign-in link; details stay in Easel and email. Digests go at 08:00 in {state.workspace.timeZone ?? 'America/New_York'}.</p>
   <Form submit="Save notification preference" onSubmit={async v => { await api('notifications/preference', { mode, channel: mode === 'chat' ? v.channel : null }); await reload() }}>
    <label>Notify me<select aria-label="Notify me" value={mode} onChange={e => setMode(e.target.value)}>{Object.entries(MODE).filter(([m]) => m !== 'chat' || view.channels.length).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {mode === 'chat' && <label>Chat channel<select aria-label="Chat channel" name="channel" defaultValue={view.preference.channel ?? view.channels[0]}>{view.channels.map((c: string) => <option key={c} value={c}>{CHANNEL[c]}</option>)}</select></label>}
   </Form>
   {view.notifications.length ? <ul className="plain">{view.notifications.map((n: D) => <li key={n.id}>
    <strong>{EVENT[n.event] ?? n.event}</strong>: <a href={`/app?tab=${encodeURIComponent(n.tab)}&record=${encodeURIComponent(n.record)}`} style={{ overflowWrap: 'anywhere' }}>{n.title}</a>
    <small style={{ display: 'block' }}><span className="date-token">{displayDate(n.createdAt)}</span> · {n.status === 'digest-queued' ? 'Waiting for the daily digest' : n.status === 'digested' ? 'Sent in the daily digest' : n.label ?? n.reason ?? n.status}</small>
   </li>)}</ul> : <p>No notifications yet.</p>}
  </>}
 </section>
}
