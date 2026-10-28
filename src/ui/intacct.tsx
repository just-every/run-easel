import { useEffect,useState } from 'react'
import { BALANCE_TARGETS } from '../easel/balance-targets'
import { Action,api,command,Field,Form,money,Table,type D } from './shared'

/** Use Easel's existing finance forms, tables and responsive scroll frames. */
export function IntacctConnection(){
 const [status,setStatus]=useState<D|null>(null),[entities,setEntities]=useState<D[]>([]),[error,setError]=useState('')
 const load=async()=>{try{setStatus(await api('connections/intacct'));setEntities((await api('entities')).entities);setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[])
 return <section className="card" aria-label="Sage Intacct connection"><h2>Sage Intacct connection</h2>
  <p>Read-only Web Services access through a dedicated user. Each legal entity keeps its own source plan and local currency.</p>
  {error&&<p role="alert" className="error">{error}</p>}
  {status&&<>
   <Table caption="Intacct connection status" heads={['Setting','Value']}>
    <tr><td>Status</td><td>{status.connected?`Connected · user credential ending ${status.suffix}`:'Disconnected'}</td></tr>
    <tr><td>Company</td><td>{status.company??'—'}</td></tr><tr><td>Dedicated Web Services user</td><td>{status.user??'—'}</td></tr><tr><td>Authorized sender ID</td><td>{status.sender??'—'}</td></tr><tr><td>Sender credential</td><td>{status.senderSuffix?`Ending ${status.senderSuffix}`:'—'}</td></tr>
    <tr><td>Owner</td><td>{status.owner??'—'}</td></tr><tr><td>Permitted reads</td><td>{status.operations?.join(', ')}</td></tr><tr><td>Cadence</td><td>{status.schedule}</td></tr>
    <tr><td>Last accepted pull</td><td>{status.lastRefresh??'—'}</td></tr><tr><td>Last check</td><td>{status.lastCheck??'—'}</td></tr><tr><td>Rows</td><td>{status.rowCount??0}</td></tr><tr><td>Rate limit</td><td>{status.rateLimit??'None reported'}</td></tr>
   </Table>
   {status.error&&<p role="alert" className="error">{status.error}</p>}
   {!status.connected?<Form submit="Connect Sage Intacct" onSubmit={async(v,form)=>{try{await api('connections/intacct/connect',v);await load()}finally{form.reset()}}}>
    <Field label="Intacct company ID" name="companyId"/><Field label="Web Services sender ID" name="senderId"/><Field label="Sender password" name="senderPassword" type="password"/>
    <Field label="Dedicated read-only Web Services user" name="userId"/><Field label="Web Services user password" name="userPassword" type="password"/>
    <Field label="I approve read-only Intacct access" name="consent" type="checkbox"/>
   </Form>:<>
    <Action label="Check Intacct access" kind="quiet" run={async()=>{await api('connections/intacct/check',{});await load()}}/>
    <Action label="Disconnect Intacct" kind="danger" confirm="Delete the local credentials? Deactivate the dedicated user and remove the sender authorization in Intacct. Accepted history remains." run={async()=>{await api('connections/intacct/disconnect',{});await load()}}/>
    <h3>Legal entity bindings</h3>
    <Form submit="Bind Intacct entity" onSubmit={async v=>{await api('connections/intacct/bind',v);await load()}}>
     <Field label="Intacct legal entity" name="sourceEntity" options={(status.entities??[]).map((e:D)=>({value:e.id,label:`${e.name} · ${e.id} · ${e.currency}`}))}/>
     <Field label="Easel entity source plan" name="entity" options={entities.map(e=>({value:e.id,label:`${e.name} · ${e.currency}`}))}/>
    </Form>
   </>}
   <Table caption="Intacct entity bindings" heads={['Source entity','Easel entity','Currency','Book']}>{status.bindings.map((b:D)=><tr key={b.id}><td>{b.name} · {b.sourceEntity}</td><td>{entities.find(e=>e.id===b.entity)?.name??b.entity}</td><td>{b.currency}</td><td>{b.book}</td></tr>)}</Table>
   {status.providerRevocation&&<p role="status">Provider revocation: {status.providerRevocation.status}. Dedicated user: {status.user}; sender: {status.sender}. {status.providerRevocation.ownerStep}</p>}
  </>}
 </section>
}

export function IntacctImport({state,refresh}:{state:D;refresh:()=>Promise<void>}){
 const [status,setStatus]=useState<D|null>(null),[sourceEntity,setEntity]=useState(''),[preview,setPreview]=useState<D|null>(null),[draft,setDraft]=useState<D|null>(null),[queue,setQueue]=useState<string[]>([]),[guard,setGuard]=useState<D|null>(null)
 useEffect(()=>{api('connections/intacct').then(s=>{setStatus(s);setEntity(id=>s.bindings.some((b:D)=>b.sourceEntity===id)?id:s.bindings[0]?.sourceEntity??'')},()=>setStatus(null))},[state])
 const pull=async(input:D)=>{setPreview(await api('import/intacct/preview',input));setDraft(input);setGuard(null)}
 if(!status?.bindings.length)return null
 const binding=status.bindings.find((b:D)=>b.sourceEntity===sourceEntity),currency=preview?.source.currency??binding?.currency??state.workspace.currency
 return <section className="card" aria-label="Sage Intacct actuals"><h2>Sage Intacct actuals</h2>
  <label>Legal entity<select aria-label="Intacct review entity" value={sourceEntity} onChange={e=>{setEntity(e.target.value);setPreview(null);setQueue([])}}>{status.bindings.map((b:D)=><option key={b.id} value={b.sourceEntity}>{b.name} · {b.currency}</option>)}</select></label>
  <p>{binding?.name} · {currency} · ACCRUAL. Read limits: 5,000 rows and 2 MB per reviewed journal; larger or incomplete sources are refused.</p>
  <details><summary>Backfill Intacct history</summary><Form submit="Review Intacct history" onSubmit={async v=>{
   const count=Number(v.historyMonths),end=new Date(v.lastMonth+'-01T00:00:00Z')
   if(!Number.isInteger(count)||count<12||count>36||!Number.isFinite(end.getTime())||String(v.lastMonth)>=new Date().toISOString().slice(0,7))throw Error('Choose 12–36 completed months')
   const months=Array.from({length:count},(_,i)=>{const d=new Date(end);d.setUTCMonth(d.getUTCMonth()-count+1+i);return d.toISOString().slice(0,7)})
   setQueue(months.slice(1));await pull({sourceEntity,month:months[0],includeOpening:v.includeOpening})
  }}><Field label="Intacct history months" name="historyMonths" type="number" defaultValue="24"/><Field label="Intacct last closed month" name="lastMonth" type="month"/><Field label="Include Intacct initial source opening" name="includeOpening" type="checkbox" defaultValue={true}/></Form></details>
  <Form submit="Preview Intacct month" onSubmit={async v=>{setQueue([]);await pull({...v,sourceEntity})}}><Field label="Intacct month" name="month" type="month"/><Field label="Intacct first imported month" name="includeOpening" type="checkbox"/></Form>
  {preview&&draft&&<>
   <h3>Review {preview.source.entity.name} · {preview.source.month} · {currency}</h3><p>{preview.changedTransactions} changed transactions · {preview.changedRows} journal deltas · {queue.length} history months remain.</p>
   <p>{preview.source.trialBalance.basis}</p>
   <Table caption="Intacct source trial balance" heads={['Account','Type','Opening','Posted movement','Report transfer','Closing','Difference']}>{preview.source.chart.map((a:D)=>{const tb=preview.source.trialBalance;return <tr key={a.id}><td>{a.code} · {a.name}</td><td>{a.type} · {a.normalBalance}</td><td className="num">{money(tb.opening[a.id]??0,currency)}</td><td className="num">{money(tb.movement[a.id]??0,currency)}</td><td className="num">{money(tb.reportTransfers[a.id]??0,currency)}</td><td className="num">{money(tb.closing[a.id]??0,currency)}</td><td className="num">{money((tb.opening[a.id]??0)+(tb.movement[a.id]??0)+(tb.reportTransfers[a.id]??0)-(tb.closing[a.id]??0),currency)}</td></tr>})}</Table>
   {!preview.source.trialBalance.balanced&&<p role="alert">Independent trial balance differs; acceptance is blocked.</p>}
   <Table caption="New or changed Intacct accounts" heads={['Account','Type','Change']}>{preview.source.changes.accounts.map((a:D)=><tr key={a.id}><td>{a.code} · {a.name}</td><td>{a.type}</td><td>{a.change}</td></tr>)}</Table>
   <details><summary>Source dimensions and stable IDs</summary>{Object.entries(preview.source.dimensions).filter(([k])=>k!=='udd').map(([kind,items])=><Table key={kind} caption={`Intacct ${kind}`} heads={['ID','Label']}>{(items as D[]).map(r=><tr key={r.id}><td>{r.id}</td><td>{r.name}</td></tr>)}</Table>)}{preview.source.dimensions.udd.map((u:D)=><p key={u.kind}>{u.name}: use {u.kind} source rules; {u.members.map((m:D)=>`${m.id} (${m.name})`).join(', ')}</p>)}</details>
   {(preview.accounts??[]).length>0&&<Table caption="Intacct account mapping review" heads={['Source account','Mapping','Resolution']}>{preview.accounts.map((a:D)=><tr key={a.account}><td>{a.account} · {a.name}</td><td>{a.mappingStatus}</td><td><select aria-label={`Intacct map account ${a.account}`} value={a.target??''} onChange={async e=>{await command('account-map',{account:a.account,target:e.target.value,name:a.name});await pull(draft);await refresh()}}><option value="">Choose target</option>{state.lines.map((l:D)=><option key={l.id} value={l.id}>{l.name}</option>)}{BALANCE_TARGETS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}<option value="excluded">Exclude</option></select></td></tr>)}</Table>}
   {(preview.unmappedDepartments??[]).map((source:string)=><Form key={source} submit={`Map Intacct department ${source}`} onSubmit={async v=>{await command('department-map',{source,department:v.department});await pull(draft);await refresh()}}><Field label={`Easel department for ${source}`} name="department" options={state.departments.map((d:D)=>({value:d.id,label:d.name}))}/></Form>)}
   {preview.dimensionExceptions?.length>0&&<p role="alert">Resolve source dimension rules in Settings → Dimensions, then preview this month again.</p>}
   <Form submit="Stage Intacct source review" onSubmit={async v=>{const guards=await api('source-guard'),prior=guards.guards.find((g:D)=>g.provider==='intacct'&&g.entity===binding.entity&&g.month===draft.month);setGuard(await api('import/intacct/stage',{...draft,revision:prior?.revision,observedAt:new Date().toISOString(),nextExpectedAt:new Date(v.nextExpectedAt).toISOString(),expectedPayroll:String(v.expectedPayroll??'').split('\n').filter(Boolean).map((line:string)=>{const[provider,payDate,rows]=line.split(',');return{provider,payDate,rows:Number(rows)}})}));await refresh()}}><Field label="Next Intacct update expected at (UTC)" name="nextExpectedAt" type="datetime-local"/><Field label="Expected Intacct payroll dependencies" name="expectedPayroll" type="textarea" required={false} hint="provider,YYYY-MM-DD,rows per line; empty means no payroll dependency"/></Form>
   {guard&&<p role="status">Source staged: {guard.unresolved.length} issues. Review exact staged decisions in Source change guard before acceptance.</p>}
   <Action label="Preview Intacct again" kind="quiet" run={()=>pull(draft)}/>
   {preview.source.trialBalance.balanced&&!(preview.unmappedAccounts?.length||preview.unmappedDepartments?.length||preview.dimensionExceptions?.length)&&<Action label="Accept reviewed Intacct month" run={async()=>{let r=await api('import/intacct/commit',{...draft,fingerprint:preview.fingerprint,sourceFingerprint:preview.sourceFingerprint});if(r.batch?.status==='importing')throw Error('Import started; use Continue import in the native journal. Inspect its status before retrying.');setPreview(null);await refresh()}}/>}
  </>}
  {!preview&&queue.length>0&&<Action label="Review next Intacct history month" run={async()=>{const[next,...rest]=queue;setQueue(rest);await pull({sourceEntity,month:next,includeOpening:false})}}/>}
  <Table caption="Intacct reviewed months" heads={['Entity','Currency','Month','Rows','Status','Trial balance']}>{status.months.filter((m:D)=>m.sourceEntity===sourceEntity).map((m:D)=><tr key={m.id}><td>{binding?.name}</td><td>{m.currency}</td><td>{m.month}</td><td>{m.ledgerRows}</td><td>{m.status}</td><td>{m.trialBalance.balanced?'Reconciled':'Difference'}</td></tr>)}</Table>
 </section>
}
