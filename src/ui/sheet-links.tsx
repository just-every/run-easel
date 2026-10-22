import { useEffect, useRef, useState } from 'react'
import type { Shared } from './app'
import { SheetLinkForm } from './sheet-link-form'
import { Action, api, Field, Form, money, monthLabel, Table, type D } from './shared'

type Props = Pick<Shared, 'state' | 'refresh'>
type Connection = {
 connected: boolean; scope: string; scopeDescription: string; owner: string | null; connectedAt: string | null
 lastRefresh: string | null; error: string | null; rateLimit: string | null
 providerRevocation: { status: string; at: string } | null
}

/** Credential administration and scheduled links share native finance and Pay custody. */
export function SheetLinks(props: Props) {
 if (props.state.me.role !== 'finance') return null
 if (!props.state.me.payDetail) return <section className="card"><h2>Google Sheets</h2><p className="muted">Finance with a Pay-detail grant can connect Google Sheets and manage linked ranges. Ask the owner for that grant.</p></section>
 return <SheetLinksContent {...props} />
}

function SheetLinksContent({ state, refresh }: Props) {
 const [connection, setConnection] = useState<Connection | null>(null)
 const [links, setLinks] = useState<D[] | null>(null)
 const [error, setError] = useState('')
 const [notice, setNotice] = useState('')
 const request = useRef(0)
 const load = async () => {
  const mine = ++request.current
  setError('')
  try {
   const [status, list] = await Promise.all([api('connections/sheets'), api('sheet-links')])
   if (mine === request.current) { setConnection(status); setLinks(list.links) }
  } catch (e) { if (mine === request.current) { setConnection(null); setLinks(null); setError((e as Error).message) } }
 }
 useEffect(() => { void load(); return () => { request.current++ } }, [state])
 const changed = async () => { await load(); await refresh() }
 return <section className="card" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
  <h2>Google Sheets</h2>
  <p className="muted">Read linked numeric ranges on an explicitly saved hourly or daily schedule. Changed source cells become a separate finance proposal; finance decides whether to promote that exact proposal revision.</p>
  <p className="notice">Missing cells, lost access and changes to the source shape are errors. Blank or missing values are never imported as zero.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {!connection && !error && <p role="status">Loading Google Sheets connection…</p>}
  <Action label="Refresh Google Sheets status" kind="quiet" run={load} />
  {notice && <p role="status">{notice}</p>}
  {connection && <>
   <Table caption="Google Sheets connection" heads={['Setting', 'Value']}>
    <tr><td>Status</td><td>{connection.connected ? 'Connected' : 'Disconnected'}</td></tr>
    <tr><td>Read scope</td><td>{connection.scope}</td></tr>
    <tr><td>Scope coverage</td><td>{connection.scopeDescription}</td></tr>
    {connection.owner && <tr><td>Connection owner</td><td>{connection.owner}</td></tr>}
    {connection.connectedAt && <tr><td>Connected at</td><td>{connection.connectedAt}</td></tr>}
    <tr><td>Last successful source read</td><td>{connection.lastRefresh ?? 'No successful source read yet'}</td></tr>
    {connection.providerRevocation && <tr><td>Disconnect revocation</td><td>{connection.providerRevocation.status === 'confirmed' ? 'Google confirmed revocation' : 'Google did not confirm revocation'} · {connection.providerRevocation.at}</td></tr>}
   </Table>
   {connection.error && <p role="alert" className="error">{connection.error}</p>}
   {connection.rateLimit && <p role="alert" className="error">{connection.rateLimit}</p>}
   <p className="muted">Use an offline OAuth grant with the Google spreadsheets.readonly scope. Google grants read access to spreadsheets accessible to the connected account; the grant is broader than the linked range.</p>
   <Form submit={connection.connected ? 'Replace Google Sheets connection' : 'Connect Google Sheets'} onSubmit={async (v, form) => {
    await api('connections/sheets/connect', { clientId: v.clientId, clientSecret: v.clientSecret, refreshToken: v.refreshToken })
    form.reset(); setNotice('Google Sheets connected. Review and save a linked range to enable scheduled pulls.'); await changed()
   }}>
    <Field label="OAuth client ID" name="clientId" type="password" />
    <Field label="OAuth client secret" name="clientSecret" type="password" />
    <Field label="Offline refresh token" name="refreshToken" type="password" hint="The OAuth bundle is sealed on the server. Saved credentials are never returned to this form." />
   </Form>
   {connection.connected && <Action label="Disconnect Google Sheets" kind="danger" run={async () => {
    await api('connections/sheets/disconnect', {}); setNotice('The stored OAuth bundle was removed and all range schedules were disabled. Saved baselines and proposals remain.'); await changed()
   }} />}
   <p className="muted">Disconnect disables all range schedules, asks Google to revoke the grant and removes the local OAuth bundle even when revocation cannot be confirmed. Google revocation can affect other grants for this OAuth project. If Google does not confirm revocation, remove this app in your Google Account → Security → Third-party connections.</p>
   {connection.connected && <SheetLinkForm state={state} saved={changed} />}
  </>}
  {links && <>
   <h3>Saved linked ranges</h3>
   {!links.length && <p>No linked ranges have been saved.</p>}
   {links.map(link => <SavedSheetLink key={link.id} link={link} state={state} connected={!!connection?.connected} changed={changed} announce={setNotice} />)}
  </>}
 </section>
}

function SavedSheetLink({ link, state, connected, changed, announce }: { link: D; state: D; connected: boolean; changed: () => Promise<void>; announce: (text: string) => void }) {
 const proposal = link.lastProposal
 const compare = proposal ? `/app?tab=scenarios&compareFrom=${encodeURIComponent(link.scenario)}&compareTo=${encodeURIComponent(proposal.id)}` : ''
 return <article style={{ minWidth: 0 }}>
  <h4>{link.name}</h4>
  <Table caption={`Linked range · ${link.name}`} heads={['Setting', 'Value']}>
   <tr><td>Spreadsheet</td><td>{link.shape.spreadsheetId}</td></tr>
   <tr><td>Range</td><td>{link.shape.range}</td></tr>
   <tr><td>Working target</td><td>{state.scenarios.find((s: D) => s.id === link.scenario)?.name ?? link.scenario}</td></tr>
   <tr><td>Schedule</td><td>{link.enabled ? link.cadence === 'daily' ? `Daily at ${String(link.hour).padStart(2, '0')}:00 (${state.workspace.timeZone})` : 'Hourly' : 'Disabled'}</td></tr>
   <tr><td>Schedule owner</td><td>{link.owner}</td></tr>
   <tr><td>Last check</td><td>{link.lastChecked ?? 'No pull since baseline review'}</td></tr>
   <tr><td>Last successful source read</td><td>{link.lastRefresh ?? 'None'}</td></tr>
   <tr><td>Health</td><td>{link.error ? 'Needs attention' : !link.enabled ? 'Disabled' : !connected ? 'Disconnected; reconnect to pull' : 'No recorded errors'}</td></tr>
   {proposal && <tr><td>Latest proposal</td><td><a href={compare}>Review changed cells and proposal</a> · revision {proposal.revision} · {proposal.createdAt}</td></tr>}
  </Table>
  {link.error && <p role="alert" className="error">{link.error}</p>}
  {link.enabled && connected && <Action label={`Pull now · ${link.name}`} run={async () => {
   const result = await api('sheet-links/pull', { id: link.id, revision: link.revision })
   await changed()
   if (result.error) throw new Error(result.error)
   announce(result.unchanged ? `${link.name}: source unchanged; no proposal created.` : `${link.name}: ${result.cells.length} changed cells submitted as a separate finance proposal.`)
  }} />}
  {link.enabled && <Action label={`Disable schedule · ${link.name}`} kind="quiet" run={async () => {
   await api('sheet-links/disable', { id: link.id, revision: link.revision }); announce(`${link.name}: schedule disabled.`); await changed()
  }} />}
  {proposal && <details>
   <summary>Latest source changes ({proposal.cells.length})</summary>
   <p>The working target stays unchanged until finance promotes the proposal. <a href={compare}>Open native proposal comparison</a>.</p>
   <Table caption={`Changed source cells · ${link.name}`} heads={['Source', 'Target', 'Prior source', 'New source', 'Native at pull']}>
    {proposal.cells.map((cell: D) => <tr key={cell.source}><td>{cell.source}</td><td>{cell.scheduleName} · {monthLabel(cell.month)}</td><td className="num">{money(cell.sourceBeforeCents, state.workspace.currency)}</td><td className="num">{money(cell.afterCents, state.workspace.currency)}</td><td className="num">{money(cell.beforeCents, state.workspace.currency)}</td></tr>)}
   </Table>
  </details>}
 </article>
}
