import { useEffect,useState } from 'react'
import { BALANCE_TARGETS } from '../easel/balance-targets'
import { Action,api,command,Field,Form,money,Table,type D } from './shared'
const base='connections/netsuite'
export function NetSuiteConnection(){
 const [status,setStatus]=useState<D|null>(null),[error,setError]=useState('')
 const load=async()=>{try{setStatus(await api(base));setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[])
 const act=(op:string)=>async(v:D,form:HTMLFormElement)=>{await api(base+'/'+op,v);form.reset();await load()}
 return <section className="card" aria-label="NetSuite connection"><h2>NetSuite connection</h2>
  {error&&<p role="alert" className="error">{error}</p>}
  {status&&<>
   <Table caption="NetSuite connection status" heads={['Setting','Value']}>
    <tr><td>Status</td><td>{status.connected?`Connected · ending ${status.suffix}`:'Disconnected'}</td></tr><tr><td>Account</td><td>{status.account??'—'}</td></tr>
    <tr><td>Declared role</td><td>{status.role??'—'}</td></tr><tr><td>Requested operations</td><td className="wrap">{status.operations}</td></tr><tr><td>Schedule</td><td>{status.schedule}</td></tr>
    <tr><td>Connected by</td><td>{status.owner??'—'}</td></tr><tr><td>Last check</td><td>{status.lastCheck??'—'}</td></tr><tr><td>Last accepted pull</td><td>{status.lastRefresh??'—'}</td></tr><tr><td>Source rows in last pull</td><td>{status.rowCount??0}</td></tr><tr><td>Rate limit</td><td>{status.rateLimit??'No limit reported'}</td></tr>
   </Table>
   <p>Use a token for a role restricted to read-only accounting access. The declared role and balanced source reads describe the evidence; they cannot certify that NetSuite permissions expose every posting.</p>
   {status.error&&<p role="alert" className="error">{status.error}</p>}
   {!status.connected?<details><summary>Connect a NetSuite token</summary><Form submit="Connect NetSuite" onSubmit={act('connect')}>
    <Field label="NetSuite account realm" name="realm" hint="Account ID, including a suffix such as _SB1 for a sandbox."/><Field label="Declared read-only role" name="role"/>
    {[['consumerKey','Consumer key'],['consumerSecret','Consumer secret'],['tokenId','Token ID'],['tokenSecret','Token secret']].map(([name,label])=><Field key={name} name={name} label={label} type="password"/>)}
    <Field label="I approve read-only NetSuite accounting access" name="consent" type="checkbox"/>
   </Form></details>:<>
    <Action label="Check NetSuite access" kind="quiet" run={async()=>{await api(base+'/check',{});await load()}}/>
    <Action label="Disconnect NetSuite" kind="danger" confirm="Attempt token revocation and delete local credentials? Accepted entity actuals remain available." run={async()=>{await api(base+'/disconnect',{});await load()}}/>
    <details><summary>Map a subsidiary to an entity</summary><p>The subsidiary, selected accounting book and entity form a permanent source binding. Their currencies must agree.</p><Form submit="Save NetSuite subsidiary mapping" onSubmit={act('map-subsidiary')}>
     <Field label="NetSuite subsidiary" name="subsidiary" options={(status.inventory?.subsidiaries??[]).map((s:D)=>({value:s.id,label:`${s.name} · ${s.currency}`}))}/>
     <Field label="NetSuite accounting book" name="book" options={(status.inventory?.books??[]).map((b:D)=>({value:b.id,label:b.name}))}/>
     <Field label="Easel entity" name="entity" options={(status.entities??[]).map((e:D)=>({value:e.id,label:`${e.name} · ${e.currency}`}))}/>
    </Form></details>
    <details><summary>Map source accounting periods</summary><p>Map every preceding leaf period and each adjustment period explicitly. Parent quarters and years are excluded. Transaction dates remain source evidence; posting periods determine actuals months.</p><Form submit="Save NetSuite period mapping" onSubmit={act('map-period')}>
     <Field label="Period accounting book" name="book" options={(status.inventory?.books??[]).map((b:D)=>({value:b.id,label:b.name}))}/>
     <Field label="Source accounting period" name="period" options={(status.inventory?.periods??[]).filter((p:D)=>p.isyear==='F'&&p.isquarter==='F').map((p:D)=>({value:p.id,label:`${p.name}${p.isadjust==='T'?' · adjustment':''}`}))}/><Field label="Easel actuals month" name="month" type="month"/>
    </Form></details>
   </>}
   <Table caption="NetSuite subsidiary bindings" heads={['Subsidiary','Book','Entity','Currency']}>{(status.bindings??[]).map((b:D)=><tr key={b.id}><td>{b.name} ({b.subsidiary})</td><td>{b.book}</td><td>{status.entities.find((e:D)=>e.id===b.entity)?.name}</td><td>{b.currency}</td></tr>)}</Table>
   {status.providerRevocation&&<p role="status">Provider revocation: {status.providerRevocation.status} · HTTP {status.providerRevocation.httpStatus??'unavailable'} · {status.providerRevocation.at}. Local credentials deleted.</p>}
   {!!status.months?.length&&<details><summary>Accepted NetSuite source periods</summary><Table caption="NetSuite accepted source periods" heads={['Entity / subsidiary','Book','Month','Rows','Status','Trial']}>{status.months.map((m:D)=><tr key={m.id}><td>{status.entities.find((e:D)=>e.id===m.entity)?.name} / {m.subsidiary}</td><td>{m.book}</td><td>{m.month}</td><td>{m.ledgerRows}</td><td>{m.status}</td><td>{m.trialBalance.balanced?'Reconciled':'Difference'}</td></tr>)}</Table></details>}
  </>}
 </section>
}
export function NetSuiteImport({state,refresh}:{state:D;refresh:()=>Promise<void>}){
 const [status,setStatus]=useState<D|null>(null),[preview,setPreview]=useState<D|null>(null),[draft,setDraft]=useState<D|null>(null),[queue,setQueue]=useState<D[]>([]),[guard,setGuard]=useState<D|null>(null)
 useEffect(()=>{api(base).then(setStatus,()=>setStatus(null))},[state])
 const pull=async(input:D)=>{const p=await api('import/netsuite/preview',input);setDraft(input);setPreview(p);setGuard(null)}
 if(!status?.connected)return null
 const bindings=status.bindings.map((b:D)=>({value:b.id,label:`${b.name} → ${status.entities.find((e:D)=>e.id===b.entity)?.name} · ${b.currency} · book ${b.book}`}))
 const next=async()=>{const [head,...rest]=queue;setQueue(rest);await pull(head)}
 return <section className="card" aria-label="NetSuite actuals"><h2>NetSuite actuals</h2>
  <details><summary>Backfill NetSuite history</summary><p>Review one subsidiary/book/month batch at a time, grouped in month order. The default covers 24 closed months for every mapped subsidiary. Opening balances enter once per binding.</p><Form submit="Review NetSuite history" onSubmit={async v=>{
   const count=Number(v.historyMonths),end=new Date(v.lastMonth+'-01T00:00:00Z');if(!Number.isInteger(count)||count<12||count>36||!Number.isFinite(end.getTime()))throw Error('Choose 12 to 36 closed months')
   const inputs=Array.from({length:count},(_,i)=>{const d=new Date(end);d.setUTCMonth(d.getUTCMonth()-count+1+i);return status.bindings.map((b:D)=>({binding:b.id,month:d.toISOString().slice(0,7),includeOpening:i===0&&v.includeOpening}))}).flat();if(!inputs.length)throw Error('Map a subsidiary first');setQueue(inputs.slice(1));await pull(inputs[0])
  }}><Field label="NetSuite history months" name="historyMonths" type="number" defaultValue="24"/><Field label="NetSuite last closed month" name="lastMonth" type="month"/><Field label="Include source openings for this backfill" name="includeOpening" type="checkbox" defaultValue={true}/></Form></details>
  <details><summary>Pull a NetSuite month</summary><Form submit="Preview NetSuite month" onSubmit={async v=>{setQueue([]);await pull(v)}}><Field label="Subsidiary entity and book" name="binding" options={bindings}/><Field label="NetSuite month" name="month" type="month"/><Field label="First imported subsidiary month" name="includeOpening" type="checkbox"/></Form></details>
  {preview&&draft&&<><h3>Review {preview.source.month} · {status.entities.find((e:D)=>e.id===preview.source.entity)?.name}</h3>
   <p>Subsidiary {preview.source.subsidiary} · book {preview.source.book} · {preview.source.currency} · source periods {preview.source.periods.join(', ')}. {preview.changedTransactions} changed transactions, {preview.changedRows} signed posting deltas. {queue.length} batches remain.</p>
   <p>{preview.source.trialBalance.basis}</p>
   {Object.entries(preview.source.changes??{}).map(([kind,rows])=>(rows as D[]).length>0&&<Table key={kind} caption={`New or changed NetSuite ${kind}`} heads={['ID','Name','Source type','Change']}>{(rows as D[]).map(r=><tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.type??'—'}</td><td>{r.change}</td></tr>)}</Table>)}
   <Table caption="NetSuite source trial reconciliation" heads={['Account','Opening','Movement','Closing','Difference']}>{preview.source.chart.map((a:D)=>{const t=preview.source.trialBalance;return <tr key={a.id}><td>{a.code} · {a.name}</td>{[t.opening[a.id]??0,t.movement[a.id]??0,t.closing[a.id]??0,(t.opening[a.id]??0)+(t.movement[a.id]??0)-(t.closing[a.id]??0)].map((n,i)=><td className="num" key={i}>{money(n,preview.source.currency)}</td>)}</tr>})}</Table>
   {!preview.source.trialBalance.balanced&&<p role="alert" className="error">The source trial does not reconcile. Acceptance is unavailable.</p>}
   {!!preview.source.unsupportedTransactions.length&&<p role="alert" className="error">A transaction has no supported NetSuite destination. Acceptance is unavailable.</p>}
   <Table caption="NetSuite mapping review" heads={['Account / source type','Rows','Target']}>{(preview.accounts??[]).map((a:D)=><tr key={a.account}><td>{a.account} · {a.accountTypes.join(', ')}</td><td>{a.rows}</td><td>{state.lines.find((l:D)=>l.id===a.target)?.name??BALANCE_TARGETS.find(t=>t.value===a.target)?.label??a.target??'Unmapped: resolve in Settings'}</td></tr>)}</Table>
   <p>Departments, classes and locations retain independent IDs and names. Use Settings → Dimensions to resolve source members.</p>
   {preview.unchanged&&<p role="status">No changed posted amounts. Accepting records the reviewed source coverage without adding ledger rows.</p>}
   <Action label="Refresh NetSuite preview" kind="quiet" run={()=>pull(draft)}/>
   <Action label="Stage NetSuite source review" run={async()=>{const result=await api('import/netsuite/stage',{...draft,sourceFingerprint:preview.sourceFingerprint});setGuard(result.guard);await refresh()}}/>
   {guard&&<p role="status">{guard.unresolved.length?`${guard.unresolved.length} source findings require a reasoned finance decision in Source refresh reviews above.`:'Source staged. Review the mapping and trial before acceptance.'}</p>}
   {guard&&!guard.unresolved.length&&preview.source.trialBalance.balanced&&!preview.source.unsupportedTransactions.length&&<Action label="Accept reviewed NetSuite month" run={async()=>{let result=await api('import/netsuite/commit',{...draft,fingerprint:preview.fingerprint,sourceFingerprint:preview.sourceFingerprint});while(result.batch?.status==='importing')result=await api('import/actuals/resume',{id:result.batch.id});setPreview(null);setGuard(null);await refresh()}}/>}
  </>}
  {!preview&&queue.length>0&&<Action label="Review next NetSuite batch" run={next}/>}
 </section>
}
