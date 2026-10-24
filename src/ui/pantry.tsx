import { useEffect, useState } from 'react'
import { Action, api, Field, Form, money, Table, type D } from './shared'

const connectionPath=['connections','pantry'].join('/')
const importPath=['import','pantry'].join('/')

export function PantryConnection() {
 const [connection,setConnection]=useState<D|null>(null),[error,setError]=useState('')
 const load=async()=>{setError('');try{setConnection(await api(connectionPath))}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[])
 return <section className="card">
  <h2>Pantry connection</h2>
  {error && <p role="alert" className="error">{error}</p>}
  {connection && <>
   <Table caption="Pantry connection" heads={['Setting','Value']}>
    <tr><td>Status</td><td>{connection.connected?'Connected':'Disconnected'}</td></tr>
    <tr><td>Origin</td><td>{connection.origin??'Not configured'}</td></tr>
    <tr><td>Read scopes</td><td>{connection.scopes.join(', ')}</td></tr>
    <tr><td>Schedule</td><td>{connection.schedule}</td></tr>
    {connection.owner && <tr><td>Owner</td><td>{connection.owner}</td></tr>}
    {connection.suffix && <tr><td>Last credential suffix</td><td>••••{connection.suffix}</td></tr>}
   </Table>
   {connection.error && <p role="alert" className="error">{connection.error}</p>}
   {!connection.configured && <p>Ask the installation owner to configure PANTRY_ORIGIN before connecting.</p>}
   {connection.configured && !connection.connected && <Form submit="Connect Pantry" onSubmit={async(v,form)=>{await api(`${connectionPath}/connect`,v);form.reset();await load()}}>
    <Field label="Pantry read credential" name="key" type="password" />
    <Field label="Allow read-only Pantry accounts, periods, posted journals and financial reports" name="consent" type="checkbox" />
   </Form>}
   {connection.connected && <Action label="Disconnect Pantry" kind="danger" run={async()=>{await api(`${connectionPath}/disconnect`,{});await load()}} />}
   <p className="muted">{connection.ownerStep}</p>
  </>}
 </section>
}

export function PantryImport({state,refresh}:{state:D;refresh:()=>Promise<void>}) {
 const [connection,setConnection]=useState<D|null>(null),[preview,setPreview]=useState<D|null>(null),[range,setRange]=useState<D|null>(null)
 useEffect(()=>{api(connectionPath).then(setConnection,()=>setConnection(null))},[state])
 if(!connection?.connected)return null
 return <section className="card">
  <h2>Pull Pantry actuals</h2>
  <p className="muted">Choose a posted-date range to backfill or refresh. Preview reconciles the ledger with both boundary trial balances. Unchanged amounts are never imported twice. Map new accounts in Settings, then preview again.</p>
  <Form submit="Preview Pantry actuals" onSubmit={async v=>{setPreview(null);setRange(v);setPreview(await api(`${importPath}/preview`,v))}}>
   <Field label="Pantry from date" name="from" type="date" defaultValue={`${state.workspace.planStart}-01`} />
   <Field label="Pantry through date" name="to" type="date" defaultValue={new Date().toISOString().slice(0,10)} />
  </Form>
  {preview && <>
   <p role="status">{preview.unchanged?'Pantry is unchanged; no rows to accept.':`${preview.changedRows} changed rows. Boundary trial balances agree.`}</p>
   <Table caption="Pantry source periods" heads={['From','Through','Status']}>{preview.source.periods.map((p:D)=><tr key={p.id}><td>{p.start}</td><td>{p.end}</td><td>{p.status}</td></tr>)}</Table>
   {!preview.unchanged && <>
    <Table caption="Pantry account review" heads={['Account','Name','Mapping','Net']}>
     {preview.accounts.map((a:D)=><tr key={a.account}><td>{a.account}</td><td>{a.name}</td><td>{a.mappingStatus==='ambiguous'?'Conflicting rules':a.target?(a.ruleIds.length?'Automatic rule':'Single account'):'Not mapped'}</td><td>{money(a.net,state.workspace.currency)}</td></tr>)}
    </Table>
    {(preview.unmappedAccounts.length>0||preview.unmappedDepartments.length>0) && <p role="alert">Map every account and department in Settings, then preview again.</p>}
    {!preview.unmappedAccounts.length && !preview.unmappedDepartments.length && <Action label="Accept reviewed Pantry rows" run={async()=>{
     await api(`${importPath}/commit`,{...range,fingerprint:preview.fingerprint,sourceFingerprint:preview.sourceFingerprint})
     setPreview(null);await refresh()
    }} />}
   </>}
  </>}
 </section>
}
