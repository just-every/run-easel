import { useEffect, useState } from 'react'
import { BALANCE_TARGETS } from '../easel/balance-targets'
import { Action, api, Field, Form, money, Table, type D } from './shared'

export function QboConnection() {
 const [status,setStatus]=useState<D|null>(null),[error,setError]=useState('')
 const load=async()=>{try{setStatus(await api(['connections','qbo'].join('/')));setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[])
 const credentials=<><Field label="Intuit environment" name="environment" defaultValue="sandbox" options={[{value:'sandbox',label:'Sandbox'},{value:'production',label:'Production'}]}/><Field label="Intuit client ID" name="clientId"/><Field label="Intuit client secret" name="clientSecret" type="password"/><Field label="I approve read-only QuickBooks accounting access" name="consent" type="checkbox"/></>
 return <section className="card"><h2>QuickBooks Online connection</h2>
  {error&&<p role="alert" className="error">{error}</p>}
  {status&&<>
   <Table caption="QuickBooks connection" heads={['Setting','Value']}>
    <tr><td>Status</td><td>{status.connected?`Connected · ending ${status.suffix}`:'Disconnected'}</td></tr><tr><td>Company realm</td><td>{status.realmId??'—'}</td></tr>
    <tr><td>OAuth scope</td><td>{status.scope}</td></tr><tr><td>Permitted operations</td><td>{status.operations}</td></tr><tr><td>Schedule</td><td>{status.schedule}</td></tr>
    <tr><td>Connected by</td><td>{status.owner??'—'}</td></tr><tr><td>Last accepted pull</td><td>{status.lastRefresh??'—'}</td></tr><tr><td>Rows</td><td>{status.rowCount??0}</td></tr><tr><td>Rate limit</td><td>{status.rateLimit??'No limit reported'}</td></tr>
   </Table>
   {status.error&&<p role="alert" className="error">{status.error}</p>}
   {!status.connected?<>
    <details><summary>Authorize a QuickBooks company</summary><p>Register this installation’s callback address with your Intuit app. The accounting grant includes provider write permissions; Easel’s connector only reads.</p><Form submit="Authorize QuickBooks" onSubmit={async v=>{const value=await api(['connections','qbo','begin'].join('/'),v);window.location.assign(value.authorizationUrl)}}>{credentials}</Form></details>
    <details><summary>Connect an existing OAuth company grant</summary><Form submit="Connect QuickBooks grant" onSubmit={async(v,form)=>{await api(['connections','qbo','connect'].join('/'),v);form.reset();await load()}}>{credentials}<Field label="QuickBooks company realm" name="realmId"/><Field label="Intuit refresh token" name="refreshToken" type="password" hint="An existing accounting grant for this exact app and company. Easel renews it through Intuit OAuth and encrypts the latest tokens."/></Form></details>
   </>:<><Action label="Check QuickBooks access" kind="quiet" run={async()=>{await api(['connections','qbo','check'].join('/'),{});await load()}}/><Action label="Disconnect QuickBooks" kind="danger" confirm="Revoke this Intuit company grant and delete its local credentials? Accepted ledger history remains." run={async()=>{await api(['connections','qbo','disconnect'].join('/'),{});await load()}}/></>}
   {status.providerRevocation&&<p role="status">Provider revocation: {status.providerRevocation.status}. Local credentials deleted.</p>}
   {status.months?.length>0&&<details><summary>Accepted source months</summary><Table caption="QuickBooks accepted source months" heads={['Month','Through','Rows','Status','Trial balance']}>
    {status.months.map((m:D)=><tr key={m.id}><td>{m.month}</td><td>{m.through}</td><td>{m.ledgerRows}</td><td>{m.status}</td><td>{m.trialBalance.balanced?'Reconciled':'Difference'}</td></tr>)}
   </Table></details>}
  </>}
 </section>
}

export function QboImport({refresh,state}:{refresh:()=>Promise<void>;state:D}) {
 const currency=state.workspace.currency
 const [draft,setDraft]=useState<D|null>(null),[preview,setPreview]=useState<D|null>(null),[queue,setQueue]=useState<string[]>([]),[acknowledged,setAcknowledged]=useState(false)
 const pull=async(input:D)=>{const p=await api(['import','qbo','preview'].join('/'),input);setDraft(input);setPreview(p);setAcknowledged(false)}
 return <section className="card"><h2>QuickBooks actuals</h2>
  <details><summary>Backfill reviewed history</summary><p>Each month has its own preview, acceptance and trial balance. Review months in order. The first month includes the preceding source trial balance once.</p>
   <Form submit="Review QuickBooks history" onSubmit={async v=>{
    const count=Number(v.historyMonths),last=String(v.lastMonth)
    if(!Number.isInteger(count)||count<12||count>36)throw Error('Choose 12 to 36 closed months')
    const end=new Date(`${last}-01T00:00:00Z`)
    if(!Number.isFinite(end.getTime())||last>=new Date().toISOString().slice(0,7))throw Error('Choose a completed month')
    const months=Array.from({length:count},(_,i)=>{const d=new Date(end);d.setUTCMonth(d.getUTCMonth()-count+1+i);return d.toISOString().slice(0,7)})
    setQueue(months.slice(1));await pull({month:months[0],includeOpening:v.includeOpening})
   }}><Field label="History months" name="historyMonths" type="number" defaultValue="24"/><Field label="Last closed month" name="lastMonth" type="month"/><Field label="Include the initial source opening balance" name="includeOpening" type="checkbox" defaultValue={true}/></Form>
  </details>
  <details><summary>Pull a ledger month</summary><Form submit="Preview QuickBooks month" onSubmit={async v=>{setQueue([]);await pull(v)}}><Field label="QuickBooks month" name="month" type="month"/><Field label="This is the first imported QuickBooks month" name="includeOpening" type="checkbox"/></Form></details>
  {preview&&draft&&<>
   <h3>Review {preview.source.month}</h3><p>{preview.changedTransactions} changed transactions · {preview.changedRows} posting groups · {queue.length} history months after this review.</p>
   {preview.source.changes?.accounts.length>0&&<Table caption="New or changed QuickBooks accounts" heads={['Account','Source type','Change']}>
    {preview.source.changes.accounts.map((a:D)=><tr key={a.id}><td>{a.code} · {a.name}</td><td>{a.type}</td><td>{a.change}</td></tr>)}
   </Table>}
   {['classes','locations'].map(kind=>preview.source.changes?.[kind]?.length>0&&<Table key={kind} caption={`New or changed QuickBooks ${kind}`} heads={['Name','Source ID','Change']}>{preview.source.changes[kind].map((r:D)=><tr key={r.id}><td>{r.name}</td><td>{r.id}</td><td>{r.change}</td></tr>)}</Table>)}
   <p>{preview.source.trialBalance.basis}</p>
   {preview.source.unsupportedTransactions.length>0&&<p role="alert" className="error">A source transaction type has no supported QuickBooks destination. No rows can be accepted: {preview.source.unsupportedTransactions.map((r:D)=>`${r.type} (${r.transactionId})`).join(', ')}.</p>}
   {preview.source.nonPostingRows.length>0&&<>
    <Table caption="Nonposting source observations" heads={['Date','Transaction type','Source transaction','Reason']}>
     {preview.source.nonPostingRows.map((r:D)=><tr key={`${r.transactionId}:${r.date}`}><td>{r.date}</td><td>{r.transactionType}</td><td>{r.transactionId}</td><td>{r.reason}</td></tr>)}
    </Table>
    <label className="check"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/> I reviewed these nonposting observations and confirm they stay out of ledger amounts</label>
   </>}
   <Table caption="QuickBooks source trial balance" heads={['Account','Opening','Posted movement','Fiscal report transfer','Closing','Difference']}>
    {preview.source.chart.map((a:D)=><tr key={a.id}><td>{a.code} · {a.name}</td><td className="num">{money(preview.source.trialBalance.opening[a.id]??0,currency)}</td><td className="num">{money(preview.source.trialBalance.movement?.[a.id]??0,currency)}</td><td className="num">{money(preview.source.trialBalance.automaticClose?.[a.id]??0,currency)}</td><td className="num">{money(preview.source.trialBalance.closing[a.id]??0,currency)}</td><td className="num">{money((preview.source.trialBalance.opening[a.id]??0)+(preview.source.trialBalance.movement?.[a.id]??0)+(preview.source.trialBalance.automaticClose?.[a.id]??0)-(preview.source.trialBalance.closing[a.id]??0),currency)}</td></tr>)}
   </Table>
   {!preview.source.trialBalance.balanced&&<p role="alert" className="error">The source ledger and trial balance differ. Review the account differences; no rows can be accepted.</p>}
   {preview.unchanged?<><p role="status">No changed posted amounts.</p>{preview.source.trialBalance.balanced&&!preview.source.unsupportedTransactions.length&&(!preview.source.nonPostingRows.length||acknowledged)&&<Action label="Accept reviewed QuickBooks month" run={async()=>{await api(['import','qbo','commit'].join('/'),{...draft,sourceFingerprint:preview.sourceFingerprint,acknowledgeNonPosting:preview.source.nonPostingRows.length});setPreview(null);await refresh()}}/>}</>:<>
    <Table caption="QuickBooks mapping review" heads={['Account','Rows','Target']}>
     {(preview.accounts??[]).map((a:D)=><tr key={a.account}><td>{a.account}</td><td>{a.rows}</td><td>{state.lines.find((line:D)=>line.id===a.target)?.name??BALANCE_TARGETS.find(target=>target.value===a.target)?.label??(a.target==='excluded'?'Excluded':a.target?'Unavailable target':'Map this account in Settings')}</td></tr>)}
    </Table>
    {preview.source.trialBalance.balanced&&!preview.source.unsupportedTransactions.length&&(!preview.source.nonPostingRows.length||acknowledged)&&<Action label="Accept reviewed QuickBooks month" run={async()=>{let result=await api(['import','qbo','commit'].join('/'),{...draft,fingerprint:preview.fingerprint,sourceFingerprint:preview.sourceFingerprint,acknowledgeNonPosting:preview.source.nonPostingRows.length});while(result.batch?.status==='importing')result=await api('import/actuals/resume',{id:result.batch.id});setPreview(null);await refresh()}}/>}
   </>}
   {!!queue.length&&<Action label="Review next history month" run={async()=>{const [next,...remaining]=queue;setQueue(remaining);await pull({month:next,includeOpening:false})}}/>}
  </>}
  {!preview&&queue.length>0&&<Action label="Review next history month" run={async()=>{const [next,...remaining]=queue;setQueue(remaining);await pull({month:next,includeOpening:false})}}/>}
 </section>
}
