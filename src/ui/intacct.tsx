import { useEffect, useState } from 'react'
import { BALANCE_TARGETS } from '../easel/balance-targets'
import { Action, api, Field, Form, money, Table, type D } from './shared'

export function IntacctImport({refresh,state}:{refresh:()=>Promise<void>;state:D}) {
 const [status,setStatus]=useState<D|null>(null)
 useEffect(()=>{api('connections/intacct').then(setStatus,()=>setStatus(null))},[state])
 const sourceOptions=(status?.entities??[]).filter((e:D)=>status?.bindings?.some((b:D)=>b.source===e.id)).map((e:D)=>({value:e.id,label:e.name+' · '+e.currency}))
 const [draft,setDraft]=useState<D|null>(null),[preview,setPreview]=useState<D|null>(null),[queue,setQueue]=useState<string[]>([]),[acknowledged,setAcknowledged]=useState(false)
 const currency=preview?.source.currency??state.workspace.currency
 const entityField=<Field label="Intacct entity" name="sourceEntity" options={sourceOptions}/>
 const pull=async(input:D)=>{const p=await api(['import','intacct','preview'].join('/'),input);setDraft(input);setPreview(p);setAcknowledged(false)}
 return <section className="card"><h2>Intacct actuals</h2>
  <details><summary>Backfill reviewed history</summary><p>Each month has its own preview, acceptance and trial balance. Review months in order. The first month includes the preceding source trial balance once.</p>
   <Form submit="Review Intacct history" onSubmit={async v=>{
    const count=Number(v.historyMonths),last=String(v.lastMonth)
    if(!Number.isInteger(count)||count<12||count>36)throw Error('Choose 12 to 36 closed months')
    const end=new Date(`${last}-01T00:00:00Z`)
    if(!Number.isFinite(end.getTime())||last>=new Date().toISOString().slice(0,7))throw Error('Choose a completed month')
    const months=Array.from({length:count},(_,i)=>{const d=new Date(end);d.setUTCMonth(d.getUTCMonth()-count+1+i);return d.toISOString().slice(0,7)})
    setQueue(months.slice(1));await pull({sourceEntity:v.sourceEntity,month:months[0],includeOpening:v.includeOpening})
   }}>{entityField}<Field label="History months" name="historyMonths" type="number" defaultValue="24"/><Field label="Last closed month" name="lastMonth" type="month"/><Field label="Include the initial source opening balance" name="includeOpening" type="checkbox" defaultValue={true}/></Form>
  </details>
  <details><summary>Pull a ledger month</summary><Form submit="Preview Intacct month" onSubmit={async v=>{setQueue([]);await pull(v)}}>{entityField}<Field label="Intacct month" name="month" type="month"/><Field label="This is the first imported Intacct month" name="includeOpening" type="checkbox"/></Form></details>
  {preview&&draft&&<>
   <h3>Review {preview.source.sourceEntity} · {preview.source.month} · {currency}</h3><p>{preview.changedTransactions} changed transactions · {preview.changedRows} posting groups · {queue.length} history months after this review.</p>
   {preview.source.changes?.accounts.length>0&&<Table caption="New or changed Intacct accounts" heads={['Account','Source type','Change']}>
    {preview.source.changes.accounts.map((a:D)=><tr key={a.id}><td>{a.code} · {a.name}</td><td>{a.type}</td><td>{a.change}</td></tr>)}
   </Table>}
   {['classes','locations'].map(kind=>preview.source.changes?.[kind]?.length>0&&<Table key={kind} caption={`New or changed Intacct ${kind}`} heads={['Name','Source ID','Change']}>{preview.source.changes[kind].map((r:D)=><tr key={r.id}><td>{r.name}</td><td>{r.id}</td><td>{r.change}</td></tr>)}</Table>)}
   {preview.source.changes.records?.length>0&&<Table caption="Changed Intacct record identities" heads={['Record','Before','After']}>{preview.source.changes.records.map((r:D)=><tr key={r.record}><td>{r.record}</td><td>{r.before.account} · {r.before.date} · {Object.entries(r.before.dimensions).map(([k,v])=>k+': '+v).join(', ')}</td><td>{r.after.account} · {r.after.date} · {Object.entries(r.after.dimensions).map(([k,v])=>k+': '+v).join(', ')}</td></tr>)}</Table>}
   <p>{preview.source.trialBalance.basis}</p>
   <p>Source departments use department dimension rules; source locations use tracking-option rules. Entity identity follows the fixed source binding.</p>
   {!draft.includeOpening&&<details><summary>Stage source changes for finance review</summary>
    <p>Stage this observation before accepting a changed source or declaring expected payroll. Resolve findings in Source refresh review above, then preview this month again.</p>
    <Form submit="Stage Intacct source review" onSubmit={async v=>{await api('import/intacct/stage',{...draft,...v,nextExpectedAt:new Date(v.nextExpectedAt).toISOString(),expectedPayroll:v.payrollProvider?[{provider:v.payrollProvider,payDate:v.payDate,rows:Number(v.payrollRows)}]:[]});await refresh()}}>
     <Field label="Entity forecast" name="scenario" options={state.scenarios.filter((s:D)=>s.kind==='forecast'&&s.entity===preview.source.entity).map((s:D)=>({value:s.id,label:s.name}))}/>
     <Field label="Next expected source update (UTC)" name="nextExpectedAt" type="datetime-local"/>
     <Field label="Expected payroll provider" name="payrollProvider" required={false}/><Field label="Expected payroll date" name="payDate" type="date" required={false}/><Field label="Expected employee rows" name="payrollRows" type="number" required={false}/>
    </Form>
   </details>}
   {preview.source.unsupportedTransactions.length>0&&<p role="alert" className="error">A source transaction type has no supported Intacct destination. No rows can be accepted: {preview.source.unsupportedTransactions.map((r:D)=>`${r.type} (${r.transactionId})`).join(', ')}.</p>}
   {preview.source.nonPostingRows.length>0&&<>
    <Table caption="Nonposting source observations" heads={['Date','Transaction type','Source transaction','Reason']}>
     {preview.source.nonPostingRows.map((r:D)=><tr key={`${r.transactionId}:${r.date}`}><td>{r.date}</td><td>{r.transactionType}</td><td>{r.transactionId}</td><td>{r.reason}</td></tr>)}
    </Table>
    <label className="check"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/> I reviewed these nonposting observations and confirm they stay out of ledger amounts</label>
   </>}
   <Table caption="Intacct source trial balance" heads={['Account','Opening','Posted movement','Fiscal report transfer','Closing','Difference']}>
    {preview.source.chart.map((a:D)=><tr key={a.id}><td>{a.code} · {a.name}</td><td className="num">{money(preview.source.trialBalance.opening[a.id]??0,currency)}</td><td className="num">{money(preview.source.trialBalance.movement?.[a.id]??0,currency)}</td><td className="num">{money(preview.source.trialBalance.automaticClose?.[a.id]??0,currency)}</td><td className="num">{money(preview.source.trialBalance.closing[a.id]??0,currency)}</td><td className="num">{money((preview.source.trialBalance.opening[a.id]??0)+(preview.source.trialBalance.movement?.[a.id]??0)+(preview.source.trialBalance.automaticClose?.[a.id]??0)-(preview.source.trialBalance.closing[a.id]??0),currency)}</td></tr>)}
   </Table>
   {!preview.source.trialBalance.balanced&&<p role="alert" className="error">The source ledger and trial balance differ. Review the account differences; no rows can be accepted.</p>}
   {preview.unchanged?<><p role="status">No changed posted amounts.</p>{preview.source.trialBalance.balanced&&!preview.source.unsupportedTransactions.length&&(!preview.source.nonPostingRows.length||acknowledged)&&<Action label="Accept reviewed Intacct month" run={async()=>{await api(['import','intacct','commit'].join('/'),{...draft,sourceFingerprint:preview.sourceFingerprint,acknowledgeNonPosting:preview.source.nonPostingRows.length});setPreview(null);await refresh()}}/>}</>:<>
    <Table caption="Intacct mapping review" heads={['Account','Rows','Target']}>
     {(preview.accounts??[]).map((a:D)=><tr key={a.account}><td>{a.account}</td><td>{a.rows}</td><td>{state.lines.find((line:D)=>line.id===a.target)?.name??BALANCE_TARGETS.find(target=>target.value===a.target)?.label??(a.target==='excluded'?'Excluded':a.target?'Unavailable target':'Map this account in Settings')}</td></tr>)}
    </Table>
    {preview.source.trialBalance.balanced&&!preview.source.unsupportedTransactions.length&&(!preview.source.nonPostingRows.length||acknowledged)&&<Action label="Accept reviewed Intacct month" run={async()=>{let result=await api(['import','intacct','commit'].join('/'),{...draft,fingerprint:preview.fingerprint,sourceFingerprint:preview.sourceFingerprint,acknowledgeNonPosting:preview.source.nonPostingRows.length});while(result.batch?.status==='importing')result=await api('import/actuals/resume',{id:result.batch.id});setPreview(null);await refresh()}}/>}
   </>}
   {!!queue.length&&<Action label="Review next history month" run={async()=>{const [next,...remaining]=queue;setQueue(remaining);await pull({sourceEntity:draft?.sourceEntity,month:next,includeOpening:false})}}/>}
  </>}
  {!preview&&queue.length>0&&<Action label="Review next history month" run={async()=>{const [next,...remaining]=queue;setQueue(remaining);await pull({sourceEntity:draft?.sourceEntity,month:next,includeOpening:false})}}/>}
 </section>
}

export function IntacctConnection({state,refresh}:{state:D;refresh:()=>Promise<void>}) {
 const [status,setStatus]=useState<D|null>(null),[entities,setEntities]=useState<D[]>([]),[error,setError]=useState('')
 const load=async()=>{try{const [connection,settings]=await Promise.all([api('connections/intacct'),api('entities')]);setStatus(connection);setEntities(settings.entities);setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[state])
 return <section className="card"><h2>Sage Intacct connection</h2>
  {error&&<p role="alert" className="error">{error}</p>}
  {status&&<>
   <Table caption="Intacct connection" heads={['Setting','Value']}>
    <tr><td>Status</td><td>{status.connected?'Connected · ending '+status.suffix:'Disconnected'}</td></tr><tr><td>Company</td><td>{status.realmId??'—'}</td></tr>
    <tr><td>Permitted operations</td><td>{status.operations}</td></tr><tr><td>Schedule</td><td>{status.schedule}</td></tr>
    <tr><td>Connected by</td><td>{status.owner??'—'}</td></tr><tr><td>Last accepted pull</td><td>{status.lastRefresh??'—'}</td></tr><tr><td>Rows</td><td>{status.rowCount??0}</td></tr><tr><td>Rate limit</td><td>{status.rateLimit??'No limit reported'}</td></tr>
   </Table>
   {status.error&&<p role="alert" className="error">{status.error}</p>}
   {!status.connected?<details><summary>Connect a read-only Web Services user</summary>
    <p>Create a read-only Web Services user in Sage Intacct and authorize your sender ID. Easel reads accrual ledger detail and trial balances; it never posts entries. Credentials are encrypted and excluded from exports.</p>
    <Form submit="Connect Sage Intacct" onSubmit={async(v,form)=>{await api('connections/intacct/connect',v);form.reset();await load()}}>
     <Field label="Intacct company ID" name="companyId"/><Field label="Web Services sender ID" name="senderId"/>
     <Field label="Sender password" name="senderPassword" type="password"/><Field label="Web Services user ID" name="userId"/><Field label="Web Services password" name="password" type="password"/>
     <Field label="I approve read-only Intacct access" name="consent" type="checkbox"/>
    </Form>
   </details>:<>
    <Action label="Check Intacct access" kind="quiet" run={async()=>{await api('connections/intacct/check',{});await load()}}/>
    <Action label="Disconnect Intacct" kind="danger" confirm="Delete local Intacct credentials? You must also disable the Web Services user and revoke sender authorization in Intacct. Accepted history remains." run={async()=>{await api('connections/intacct/disconnect',{});await load()}}/>
    <h3>Entity source mapping</h3><p>Create each entity and its local source plan in Entities. Map each Intacct entity once; its currency must agree with the plan. Use separate currency rates for consolidation.</p>
    <Form submit="Map Intacct entity" onSubmit={async v=>{await api('connections/intacct/entity-map',v);await load()}}>
     <Field label="Source Intacct entity" name="source" options={status.entities.map((e:D)=>({value:e.id,label:e.name+' · '+e.currency}))}/>
     <Field label="Easel entity plan" name="entity" options={entities.map(e=>({value:e.id,label:e.name+' · '+e.currency}))}/>
    </Form>
    <Table caption="Intacct entity mappings" heads={['Source entity','Plan','Currency','Forecast']}>{status.bindings.map((b:D)=>{
     const entity=entities.find(e=>e.id===b.entity),scenario=state.scenarios.find((s:D)=>s.id===entity?.scenario)
     return <tr key={b.id}><td>{b.source}</td><td>{entity?.name}</td><td>{b.currency}</td><td>{scenario?.status==='working'&&<Action label={'Start forecast for '+entity?.name} confirm="Approve this exact entity plan and open its working forecast?" run={async()=>{await api('command/approve-budget',{scenario:scenario.id,revision:scenario.revision});await refresh()}}/>}</td></tr>
    })}</Table>
   </>}
   {status.months.length>0&&<details><summary>Accepted Intacct source months</summary><Table caption="Intacct accepted source months" heads={['Entity','Month','Through','Rows','Trial balance','Status']}>{status.months.map((m:D)=><tr key={m.id}><td>{entities.find(e=>e.id===m.entity)?.name}</td><td>{m.month}</td><td>{m.through}</td><td>{m.ledgerRows}</td><td>{m.trialBalance.balanced?'Reconciled':'Difference'}</td><td>{m.status}</td></tr>)}</Table></details>}
  </>}
 </section>
}
