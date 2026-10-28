import { useEffect, useState } from 'react'
import { BALANCE_TARGETS } from '../easel/balance-targets'
import { Action, api, Field, Form, money, Table, type D } from './shared'

export function NetsuiteConnection(){
 const [status,setStatus]=useState<D|null>(null),[error,setError]=useState('')
 const load=async()=>{try{setStatus(await api('connections/netsuite'));setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[])
 return <section className="card"><h2>NetSuite connection</h2>
  {error&&<p role="alert" className="error">{error}</p>}
  {status&&<>
   <Table caption="NetSuite connection" heads={['Setting','Value']}>
    <tr><td>Status</td><td>{status.connected?`Connected · ending ${status.suffix}`:'Disconnected'}</td></tr>
    <tr><td>Account / role</td><td>{status.realmId??'—'} / {status.roleId??'—'}</td></tr>
    <tr><td>Scope</td><td>{status.scope}</td></tr><tr><td>Operations</td><td>{status.operations}</td></tr>
    <tr><td>Owner</td><td>{status.owner??'—'}</td></tr><tr><td>Schedule</td><td>{status.schedule}</td></tr>
    <tr><td>Last accepted pull</td><td>{status.lastRefresh??'—'}</td></tr><tr><td>Rows</td><td>{status.rowCount??0}</td></tr><tr><td>Rate limit</td><td>{status.rateLimit??'No limit reported'}</td></tr>
   </Table>
   {status.error&&<p role="alert" className="error">{status.error}</p>}
   {!status.connected?<details><summary>Connect a read-only NetSuite role</summary>
    <p>Create an integration and access token for a role with SuiteAnalytics Workbook and REST Web Services access and View permissions for the selected ledger and subsidiary records. Easel sends only fixed SuiteQL SELECT queries. It cannot verify the role’s other permissions; confirm those in NetSuite before connecting.</p>
    <Form submit="Connect NetSuite" onSubmit={async(v,form)=>{await api('connections/netsuite/connect',v);form.reset();await load()}}>
     <Field label="NetSuite account ID" name="realmId" hint="For example 1234567_SB1 for a sandbox. No URL."/>
     <Field label="Read-only role ID" name="roleId"/>
     <Field label="Consumer key" name="consumerKey" type="password"/><Field label="Consumer secret" name="consumerSecret" type="password"/>
     <Field label="Token ID" name="tokenId" type="password"/><Field label="Token secret" name="tokenSecret" type="password"/>
     <Field label="I confirm this token uses a read-only NetSuite role" name="readOnlyRole" type="checkbox"/>
     <Field label="I approve read-only NetSuite accounting access" name="consent" type="checkbox"/>
    </Form>
   </details>:<>
    <Action label="Check NetSuite access" kind="quiet" run={async()=>{await api('connections/netsuite/check',{});await load()}}/>
    <Action label="Disconnect NetSuite" kind="danger" confirm="Delete local NetSuite credentials? Revoke the token in NetSuite Access Tokens afterward. Accepted history remains." run={async()=>{await api('connections/netsuite/disconnect',{});await load()}}/>
    <h3>Subsidiaries and entities</h3><p>Each subsidiary needs a separate entity and matching local currency. Create entities in Settings first. Accepted subsidiaries cannot be moved to another entity.</p>
    <Table caption="NetSuite subsidiary mappings" heads={['Subsidiary','Currency','Entity']}>
     {status.inventory.subsidiaries.map((s:D)=><tr key={s.id}><td>{s.name} ({s.id})</td><td>{s.currency}</td><td>{status.entities.find((e:D)=>e.id===status.subsidiaryEntities?.[s.id])?.name??'Not mapped'}</td></tr>)}
    </Table>
    <Form submit="Map NetSuite subsidiary" onSubmit={async v=>{await api('connections/netsuite/map',v);await load()}}>
     <Field label="Subsidiary" name="subsidiaryId" options={status.inventory.subsidiaries.map((s:D)=>({value:s.id,label:s.name}))}/>
     <Field label="Entity" name="entity" options={status.entities.map((e:D)=>({value:e.id,label:e.name}))}/>
    </Form>
   </>}
   {status.providerRevocation&&<p role="status">Provider revocation: {status.providerRevocation.status}. Local credentials deleted.</p>}
   {status.months.length>0&&<details><summary>Accepted NetSuite source months</summary><Table caption="NetSuite accepted source months" heads={['Subsidiary','Month','Through','Rows','Status','Trial balance']}>
    {status.months.map((m:D)=><tr key={m.id}><td>{m.subsidiaryId}</td><td>{m.month}</td><td>{m.through}</td><td>{m.ledgerRows}</td><td>{m.status}</td><td>{m.trialBalance.balanced?'Reconciled':'Difference'}</td></tr>)}
   </Table></details>}
  </>}
 </section>
}

export function NetsuiteImport({refresh,state}:{refresh:()=>Promise<void>;state:D}) {
 const currency=state.workspace.currency
 const [connection,setConnection]=useState<D|null>(null)
 useEffect(()=>{void api('connections/netsuite').then(setConnection).catch(()=>{})},[])
 const subsidiary=<Field label="NetSuite subsidiary" name="subsidiaryId" options={(connection?.inventory?.subsidiaries??[]).map((s:D)=>({value:s.id,label:`${s.name} (${s.id})`}))}/>
 const [draft,setDraft]=useState<D|null>(null),[preview,setPreview]=useState<D|null>(null),[queue,setQueue]=useState<string[]>([]),[acknowledged,setAcknowledged]=useState(false)
 const pull=async(input:D)=>{const p=await api(['import','netsuite','preview'].join('/'),input);setDraft(input);setPreview(p);setAcknowledged(false)}
 return <section className="card"><h2>NetSuite actuals</h2>
  <details><summary>Backfill reviewed history</summary><p>Each month has its own preview, acceptance and trial balance. Review months in order. The first month includes the preceding source trial balance once.</p>
   <Form submit="Review NetSuite history" onSubmit={async v=>{
    const count=Number(v.historyMonths),last=String(v.lastMonth)
    if(!Number.isInteger(count)||count<12||count>36)throw Error('Choose 12 to 36 closed months')
    const end=new Date(`${last}-01T00:00:00Z`)
    if(!Number.isFinite(end.getTime())||last>=new Date().toISOString().slice(0,7))throw Error('Choose a completed month')
    const months=Array.from({length:count},(_,i)=>{const d=new Date(end);d.setUTCMonth(d.getUTCMonth()-count+1+i);return d.toISOString().slice(0,7)})
    setQueue(months.slice(1));await pull({month:months[0],includeOpening:v.includeOpening,subsidiaryId:v.subsidiaryId})
   }}>{subsidiary}<Field label="History months" name="historyMonths" type="number" defaultValue="24"/><Field label="Last closed month" name="lastMonth" type="month"/><Field label="Include the initial source opening balance" name="includeOpening" type="checkbox" defaultValue={true}/></Form>
  </details>
  <details><summary>Check for source changes</summary><p>Read and retain a source observation without importing it. Changed or failed observations hold dependent working conclusions until the reviewed month is accepted. Published captures stay unchanged.</p><Form submit="Check NetSuite source" onSubmit={async v=>{const p=await api('import/netsuite/observe',v);if(p.error)throw Error(p.error);setQueue([]);setDraft(v);setPreview(p)}}>{subsidiary}<Field label="Source month" name="month" type="month"/><Field label="Include the initial source opening balance" name="includeOpening" type="checkbox"/></Form></details>
  <details><summary>Pull a ledger month</summary><Form submit="Preview NetSuite month" onSubmit={async v=>{setQueue([]);await pull(v)}}>{subsidiary}<Field label="NetSuite month" name="month" type="month"/><Field label="This is the first imported NetSuite month" name="includeOpening" type="checkbox"/></Form></details>
  {preview&&draft&&<>
   <h3>Review {preview.source.month} · {preview.source.subsidiary.name}</h3><p>Entity: {preview.source.entity.name}</p><p>{preview.changedTransactions} changed transactions · {preview.changedRows} posting groups · {queue.length} history months after this review.</p>
   {preview.source.changes?.accounts.length>0&&<Table caption="New or changed NetSuite accounts" heads={['Account','Source type','Change']}>
    {preview.source.changes.accounts.map((a:D)=><tr key={a.id}><td>{a.code} · {a.name}</td><td>{a.type}</td><td>{a.change}</td></tr>)}
   </Table>}
   {['departments','classes','locations','subsidiaries'].map(kind=>preview.source.changes?.[kind]?.length>0&&<Table key={kind} caption={`New or changed NetSuite ${kind}`} heads={['Name','Source ID','Change']}>{preview.source.changes[kind].map((r:D)=><tr key={r.id}><td>{r.name}</td><td>{r.id}</td><td>{r.change}</td></tr>)}</Table>)}
   {preview.source.dimensions.categories?.map((category:D,index:number)=><p key={category.id}>{category.name} ({category.id}) maps through {index===0?'source class':'source tracking option'} rules in Settings → Dimensions. Missing options require an explicit mapping.</p>)}
   <p>Department, class and location metadata remain available to reusable rules in Settings → Dimensions. Subsidiary mappings are managed in the NetSuite connection.</p><p>{preview.source.trialBalance.basis}</p>{preview.issues?.length>0&&<Table caption="NetSuite source review issues" heads={['Source issue','Suggested mapping for finance review']}>{preview.issues.map((r:D)=><tr key={r.id}><td>{r.account??r.kind}: {r.reason}</td><td>{r.proposals?.map((p:D)=>`${p.name}: ${p.reason}`).join(' · ')||'Resolve this source in Settings before acceptance'}</td></tr>)}</Table>}{preview.impacts&&<details><summary>Affected working conclusions and captures</summary>{Object.entries(preview.impacts).map(([kind,rows])=><Table key={kind} caption={kind} heads={['Name','Status']}>{(rows as D[]).map(r=><tr key={r.id}><td>{r.name}</td><td>{r.status}</td></tr>)}</Table>)}</details>}
   {preview.source.unsupportedTransactions.length>0&&<p role="alert" className="error">A source transaction type has no supported NetSuite destination. No rows can be accepted: {preview.source.unsupportedTransactions.map((r:D)=>`${r.type} (${r.transactionId})`).join(', ')}.</p>}
   {preview.source.nonPostingRows.length>0&&<>
    <Table caption="Nonposting source observations" heads={['Date','Transaction type','Source transaction','Reason']}>
     {preview.source.nonPostingRows.map((r:D)=><tr key={`${r.transactionId}:${r.date}`}><td>{r.date}</td><td>{r.transactionType}</td><td>{r.transactionId}</td><td>{r.reason}</td></tr>)}
    </Table>
    <label className="check"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/> I reviewed these nonposting observations and confirm they stay out of ledger amounts</label>
   </>}
   <Table caption="NetSuite source trial balance" heads={['Account','Opening','Posted movement','Closing','Difference']}>
    {preview.source.chart.map((a:D)=><tr key={a.id}><td>{a.code} · {a.name}</td><td className="num">{money(preview.source.trialBalance.opening[a.id]??0,currency)}</td><td className="num">{money(preview.source.trialBalance.movement?.[a.id]??0,currency)}</td><td className="num">{money(preview.source.trialBalance.closing[a.id]??0,currency)}</td><td className="num">{money((preview.source.trialBalance.opening[a.id]??0)+(preview.source.trialBalance.movement?.[a.id]??0)+(preview.source.trialBalance.automaticClose?.[a.id]??0)-(preview.source.trialBalance.closing[a.id]??0),currency)}</td></tr>)}
   </Table>
   {!preview.source.trialBalance.balanced&&<p role="alert" className="error">The source ledger and trial balance differ. Review the account differences; no rows can be accepted.</p>}
   {(preview.unmappedAccounts?.length>0||preview.unmappedDepartments?.length>0||preview.dimensionExceptions?.length>0)&&<p role="alert" className="error">Resolve the source mappings in Settings before accepting this month.</p>}
   {preview.unchanged?<><p role="status">No changed posted amounts.</p>{preview.source.trialBalance.balanced&&!preview.source.unsupportedTransactions.length&&!(preview.unmappedAccounts?.length||preview.unmappedDepartments?.length||preview.dimensionExceptions?.length)&&(!preview.source.nonPostingRows.length||acknowledged)&&<Action label="Accept reviewed NetSuite month" run={async()=>{await api(['import','netsuite','commit'].join('/'),{...draft,sourceFingerprint:preview.sourceFingerprint,acknowledgeNonPosting:preview.source.nonPostingRows.length});setPreview(null);await refresh()}}/>}</>:<>
    <Table caption="NetSuite mapping review" heads={['Account','Rows','Target']}>
     {(preview.accounts??[]).map((a:D)=><tr key={a.account}><td>{a.account}</td><td>{a.rows}</td><td>{state.lines.find((line:D)=>line.id===a.target)?.name??BALANCE_TARGETS.find(target=>target.value===a.target)?.label??(a.target==='excluded'?'Excluded':a.target?'Unavailable target':'Map this account in Settings')}</td></tr>)}
    </Table>
    {preview.source.trialBalance.balanced&&!preview.source.unsupportedTransactions.length&&!(preview.unmappedAccounts?.length||preview.unmappedDepartments?.length||preview.dimensionExceptions?.length)&&(!preview.source.nonPostingRows.length||acknowledged)&&<Action label="Accept reviewed NetSuite month" run={async()=>{let result=await api(['import','netsuite','commit'].join('/'),{...draft,fingerprint:preview.fingerprint,sourceFingerprint:preview.sourceFingerprint,acknowledgeNonPosting:preview.source.nonPostingRows.length});while(result.batch?.status==='importing')result=await api('import/actuals/resume',{id:result.batch.id});setPreview(null);await refresh()}}/>}
   </>}
   {!!queue.length&&<Action label="Review next history month" run={async()=>{const [next,...remaining]=queue;setQueue(remaining);await pull({month:next,includeOpening:false,subsidiaryId:draft?.subsidiaryId})}}/>}
  </>}
  {!preview&&queue.length>0&&<Action label="Review next history month" run={async()=>{const [next,...remaining]=queue;setQueue(remaining);await pull({month:next,includeOpening:false,subsidiaryId:draft?.subsidiaryId})}}/>}
 </section>
}
