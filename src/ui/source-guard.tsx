import { useEffect, useState } from 'react'
import { api, command, Field, Form, Table, type D } from './shared'

export function SourceGuard({state,refresh}:{state:D;refresh:()=>Promise<unknown>}) {
 const [view,setView]=useState<D|null>(null),[error,setError]=useState('')
 const load=()=>api('source-guard').then(setView,e=>setError(e.message))
 useEffect(()=>{void load()},[state])
 const forecasts=state.scenarios.filter((s:D)=>s.kind==='forecast' && s.status!=='frozen')
 if(state.me.role!=='finance' || !state.me.payDetail)return null
 return <section className="card" aria-label="Source change guard">
  <h2>Source change guard</h2>
  <p className="muted">Stage one month of a ledger refresh before accepting it. Review new mappings, changed source metadata and the payroll register runs finance expects. Missing source evidence holds dependent cash alerts. Published packs and kept forecasts retain their captured numbers.</p>
  {error && <p role="alert">{error}</p>}
  <Form submit="Stage source refresh" onSubmit={async v=>{
   const previous=view?.guards.find((g:D)=>g.id===v.source)
   const expectedPayroll=v.expectedPayroll.split(/\r?\n/).filter((s:string)=>s.trim()).map((s:string)=>{const [provider,payDate,rows]=s.split(',').map(s=>s.trim());return {provider,payDate,rows}})
   await command('source-guard-stage',{...v,revision:previous?.revision,expectedPayroll,actuals:{filename:'source-refresh.csv',csv:v.csv,dateFormat:'YYYY-MM-DD',amountMode:'debit-positive',columns:{date:'Date',account:'Account',accountName:'Name',amount:'Amount',department:'Department'}}})
   await load();await refresh()
  }}>
   <Field label="Source ID" name="source" hint="Use the same ID for later observations of this source." />
   <Field label="Source label" name="label" />
   <Field label="Source forecast" name="scenario" options={forecasts.map((s:D)=>({value:s.id,label:s.name}))} />
   <Field label="Coverage month" name="month" type="month" />
   <Field label="Source observed at" name="observedAt" hint="ISO timestamp, for example 2026-01-31T18:00:00Z." />
   <Field label="Next source update expected at" name="nextExpectedAt" />
   <Field label="Expected payroll runs" name="expectedPayroll" type="textarea" required={false} hint="One per line: provider, YYYY-MM-DD pay date, expected employee rows. Leave empty only when payroll is not a dependency." />
   <Field label="Source ledger CSV" name="csv" type="textarea" hint="Headers: Date,Account,Name,Department,Amount. Dates YYYY-MM-DD; amounts debit-positive. Staging does not import ledger rows." />
  </Form>
  {view?.guards.map((guard:D)=><div key={guard.id}>
   <h3>{guard.label} · {guard.month}</h3>
   <p role="status">{guard.unresolved.length ? `Blocked: ${guard.unresolved.length} unresolved source issues` : guard.status==='completed'?'Refresh accepted':'Source review complete; accept the reviewed ledger file through Upload actuals'}</p>
   <p className="muted">Source observed {guard.observedAt}; next update expected {guard.nextExpectedAt}. Revision {guard.revision}.</p>
   {guard.unresolved.map((issue:D)=><div key={issue.id}>
    <p>{issue.reason}</p>
    {issue.proposals?.map((p:D)=><p key={p.target}>Proposed mapping: {p.name}. {p.reason}</p>)}
    <Form submit={`Review ${issue.kind} ${issue.account ?? issue.key ?? issue.expected?.payDate ?? ''}`} onSubmit={async v=>{
     await command('source-guard-review',{id:guard.id,revision:guard.revision,fingerprint:guard.fingerprint,decisions:[{issue:issue.id,...v}]});await load();await refresh()
    }}>
     <Field label={`Decision for ${issue.id}`} name="action" options={[...(issue.kind==='account' || issue.kind==='department'?[{value:'map',label:'Approve mapping'}]:[]),...(issue.kind==='payroll'?[{value:'evidence',label:'Verify imported register evidence'}]:[]),{value:'exclude',label:'Exclude this finding with reason'}]} />
     {(issue.kind==='account' || issue.kind==='department') && <Field label={`Mapping target for ${issue.id}`} name="target" required={false} options={(issue.kind==='account'?state.lines:state.departments).map((l:D)=>({value:l.id,label:l.name}))} />}
     <Field label={`Review reason for ${issue.id}`} name="reason" />
    </Form>
   </div>)}
   <Table caption={`Source impact ${guard.label}`} heads={['Kind','Affected item','Effect']}>
    {Object.entries(guard.impacts).flatMap(([kind,rows])=>(rows as D[]).map(row=><tr key={`${kind}:${row.id}`}><td>{kind}</td><td>{row.name || row.id}</td><td>{row.status}</td></tr>))}
   </Table>
   {guard.decisions.length>0 && <Table caption={`Source review history ${guard.label}`} heads={['Decision','Reason','Finance','When']}>
    {guard.decisions.map((d:D)=><tr key={d.issue}><td>{d.action}</td><td>{d.reason}</td><td>{d.by}</td><td>{d.at}</td></tr>)}
   </Table>}
  </div>)}
 </section>
}
