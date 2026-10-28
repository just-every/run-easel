import './hris.css'
import { useEffect, useState } from 'react'
import { Action, api, Field, Form, money, options, Table, type D } from './shared'

const providers=[{value:'rippling',label:'Rippling'},{value:'willow',label:'Willow'},{value:'bamboohr',label:'BambooHR'},{value:'adp',label:'ADP Workforce Now'}]
export function HrisConnections(){
 const [provider,setProvider]=useState('rippling')
 return <section className="card hris-connections" aria-label="HRIS roster connections">
  <h2>HRIS roster connections</h2>
  <p>Review employee and contractor observations alongside your planned positions. Pulls never change the source or overwrite your plan.</p>
  <label>Roster provider<select aria-label="Roster provider" value={provider} onChange={e=>setProvider(e.target.value)}>{providers.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
  <HrisConnection key={provider} provider={provider} name={providers.find(p=>p.value===provider)!.label}/>
 </section>
}
function HrisConnection({provider,name}:{provider:string;name:string}){
 const [connection,setConnection]=useState<D|null>(null),[state,setState]=useState<D|null>(null),[error,setError]=useState('')
 const [draft,setDraft]=useState<D|null>(null),[preview,setPreview]=useState<D|null>(null),[reviewed,setReviewed]=useState(false)
 const status=`connections/hris/${provider}`,kit=`import/${provider}`
 const load=async()=>{setError('');try{const [c,s]=await Promise.all([api(status),api('state')]);setConnection(c);setState(s)}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[provider])
 const pull=async(input:D)=>{const result=await api(`${kit}/preview`,input);setDraft({...input,employeeMap:result.employeeMap});setPreview(result);setReviewed(result.unmapped.length===0)}
 const change=(id:string,field:string,value:string)=>{
  setDraft(current=>({...current!,employeeMap:{...current!.employeeMap,[id]:{...current!.employeeMap[id],[field]:value,...(field==='department'?{positionOrigin:'',unplanned:false}:{}),...(field==='positionOrigin'?{unplanned:value==='__unplanned',positionOrigin:value==='__unplanned'?'':value}:{})}}}));setReviewed(false)
 }
 return <section aria-label={`${name} roster connection`}>
  <h3>{name}</h3>
  {error&&<p role="alert" className="error">{error}</p>}
  <Action label={`Refresh ${name} status`} kind="quiet" run={load}/>
  {connection&&state&&<>
   <Table caption={`${name} connection status`} heads={['Setting','Value']}>
    <tr><td>Status</td><td>{connection.connected?'Connected':'Disconnected'}</td></tr>
    <tr><td>Credential</td><td>{connection.keySuffix?`••••${connection.keySuffix}`:'No credential shown'}</td></tr>
    <tr><td>Scope</td><td>{connection.scope}</td></tr><tr><td>Schedule</td><td>{connection.schedule}</td></tr>
    <tr><td>Connected by</td><td>{connection.owner??'—'}</td></tr><tr><td>Last successful read</td><td>{connection.lastRefresh??'None'}</td></tr>
    <tr><td>Employees read</td><td>{connection.rowCount??0}</td></tr><tr><td>Rate limit</td><td>{connection.rateLimited?'Rate limited; check explicitly later':'No rate limit reported'}</td></tr>
    <tr><td>Last accepted roster</td><td>{connection.lastAccepted??'None'}</td></tr>
   </Table>
   {connection.error&&<p role="alert" className="error">{connection.error}</p>}
   {!connection.connected?<Form submit={`Connect ${name}`} onSubmit={async(values,form)=>{await api(`${status}/connect`,values);form.reset();await load()}}>
    {provider!=='adp'&&<Field label={`${name} company or origin`} name="tenant" hint={provider==='willow'?'Full HTTPS installation origin.':provider==='bamboohr'?'Your BambooHR company subdomain.':'The authorized provider company identifier.'}/>}

    {provider==='rippling'&&<Field label="Rippling API version" name="apiVersion" type="date" hint="The dated API version approved for this token (YYYY-MM-DD)."/>}
    {provider==='adp'?<>
     <p className="muted">Configure the installation’s ADP mutual-TLS certificate binding before connecting. Easel exchanges this approved read-only client grant for short-lived OAuth tokens.</p>
     <Field label="ADP client ID" name="clientId"/><Field label="ADP client secret" name="clientSecret" type="password"/>
    </>:<Field label={`${name} read-only credential`} name="credential" type="password" hint={provider==='bamboohr'?'A BambooHR API key with roster and compensation report access.':'An employer-authorized read-only bearer key or OAuth access token. Expired tokens require reconnection.'}/>}
    <Field label={`I approve read-only ${name} roster and compensation access`} name="consent" type="checkbox"/>
   </Form>:<>
    <Action label={`Check ${name} connection`} run={async()=>{await api(`${status}/check`,{});await load()}}/>
    <Action label={`Disconnect ${name}`} kind="danger" confirm={`Delete this local credential? ${connection.revocationInstruction}`} run={async()=>{await api(`${status}/disconnect`,{});setDraft(null);setPreview(null);setReviewed(false);await load()}}/>
    <Form submit={`Pull ${name} preview`} onSubmit={async values=>pull({...values,employeeMap:{}})}>
     <Field label={`${name} target scenario`} name="scenario" options={options(state.scenarios.filter((s:D)=>s.status!=='frozen'&&s.status!=='closed'))}/>
     <Field label={`${name} observation date`} name="asOf" type="date" defaultValue={new Date().toISOString().slice(0,10)} hint="Today’s UTC date. A current roster cannot establish historical observations."/>
    </Form>
   </>}
   <p className="muted">Disconnect deletes local custody. {connection.revocationInstruction}</p>
   {connection.revocation&&<p role="status">Local credential deleted. Provider revocation requires the owner action above.</p>}
   {preview&&draft&&<>
    <h3>Review {name} observations</h3>
    <p>{preview.completeness.employeeCount} employees and contractors · {preview.completeness.pages} complete pages · observed {preview.asOf}.</p>
    <p className="muted">{preview.completeness.payrollCost}</p>
    <Table className="hris-unmapped" caption={`${name} unmapped fields`} heads={['Unmapped provider field','Treatment']}>
     {preview.completeness.unmappedFields.map((field:string)=><tr key={field}><td>{field}</td><td>Listed for review; value excluded from the plan and retained files</td></tr>)}
     {!preview.completeness.unmappedFields.length&&<tr><td colSpan={2}>No additional fields returned</td></tr>}
    </Table>
    <p>Choose each employee’s department, planned position (or unplanned hire), and US employment type. Associate their Easel person when applicable so erasure follows the provider identity.</p>
    <Table caption={`${name} employee mapping`} heads={['Employee and source','Compensation','Department','Planned position','Employment type','Easel person']}>
     {preview.roster.map((row:D)=>{const id=row.employeeId,map=draft.employeeMap[id]??{};return <tr key={id}>
      <td>{row.name}<small>{row.title} · {row.sourceDepartment} · {row.sourceEmploymentType}</small><small>{row.start}{row.termination?` → ${row.termination}`:''}</small></td>
      <td>{row.salaryCents!==null?`${money(row.salaryCents)} / year`:`${money(row.hourlyRateCents)} / hour`}</td>
      <td><select aria-label={`${name} department ${id}`} value={map.department??''} onChange={e=>change(id,'department',e.target.value)}><option value="">Choose…</option>{preview.departments.map((d:D)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
      <td><select aria-label={`${name} position ${id}`} value={map.unplanned?'__unplanned':map.positionOrigin??''} onChange={e=>change(id,'positionOrigin',e.target.value)}><option value="">Choose…</option><option value="__unplanned">Unplanned hire</option>{preview.positions.filter((p:D)=>p.department===map.department).map((p:D)=><option key={p.originId} value={p.originId}>{p.title}</option>)}</select></td>
      <td><select aria-label={`${name} employment type ${id}`} value={map.employmentType??row.employmentType??''} onChange={e=>change(id,'employmentType',e.target.value)}><option value="">Choose…</option><option value="W-2">W-2 employee</option><option value="1099">1099 contractor</option></select></td>
      <td><select aria-label={`${name} person ${id}`} value={map.memberEmail??''} onChange={e=>change(id,'memberEmail',e.target.value)}><option value="">No Easel person</option>{state.members.map((m:D)=><option key={m.email} value={m.email}>{m.name}</option>)}</select></td>
     </tr>})}
    </Table>
    <Action label={`Review ${name} mapping`} run={()=>pull(draft)}/>
    <Table caption={`${name} reconciliation`} heads={['Bucket','People']}>
     {Object.entries(preview.reconciliation).map(([bucket,rows])=><tr key={bucket}><td>{{matched:'Matched',unplanned:'Unplanned hires',plannedNotHired:'Planned but not hired',changedSalary:'Changed salaries'}[bucket]??bucket}</td><td>{(rows as D[]).map(r=>r.name??r.title).join(', ')||'None'}</td></tr>)}
    </Table>
    {preview.unmapped.length>0&&<p role="status">{preview.unmapped.length} people need a complete mapping before acceptance.</p>}
    {reviewed&&preview.unmapped.length===0&&<Action label={`Accept reviewed ${name} matches`} run={async()=>{await api(`${kit}/commit`,{...draft,fingerprint:preview.fingerprint});setPreview(null);setDraft(null);setReviewed(false);await load()}}/>}
   </>}
   {connection.imports.length>0&&<Table caption={`${name} accepted history`} heads={['Observed','Employees','Status','Actions']}>
    {connection.imports.map((imp:D)=><tr key={imp.id}><td>{imp.asOf}</td><td>{imp.rows}</td><td>{imp.status}</td><td>
     {imp.status==='importing'&&<Action label={`Continue ${name} roster ${imp.asOf}`} run={async()=>{await api(`${kit}/resume`,{id:imp.id});await load()}}/>}
     {['imported','undoing'].includes(imp.status)&&<Action label={`Undo ${name} roster ${imp.asOf}`} kind="danger" confirm="Undo only this journal’s observations? Your plan and other dated history remain." run={async()=>{await api(`${kit}/undo`,{id:imp.id});await load()}}/>}
    </td></tr>)}
   </Table>}
  </>}
 </section>
}
