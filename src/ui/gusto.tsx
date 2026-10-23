import { useEffect, useState } from 'react'
import { Action, api, Field, Form, money, options, Table, type D } from './shared'

/** Uses the same Settings card, form, actions and horizontally scrollable
 * tables as other connections. Nothing is accepted until the mapping review. */
export function GustoConnection() {
 const [connection,setConnection]=useState<D|null>(null),[state,setState]=useState<D|null>(null),[error,setError]=useState('')
 const [draft,setDraft]=useState<D|null>(null),[preview,setPreview]=useState<D|null>(null),[reviewed,setReviewed]=useState(false)
 const load=async()=>{setError('');try{const [status,current]=await Promise.all([api('connections/gusto'),api('state')]);setConnection(status);setState(current)}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[])
 const pull=async(input:D)=>{
  const result=await api('import/gusto/preview',input)
  setDraft({...input,employeeMap:result.employeeMap});setPreview(result);setReviewed(result.unmapped.length===0)
 }
 const change=(id:string,field:string,value:unknown)=>{
  setDraft(current=>({...current!,employeeMap:{...current!.employeeMap,[id]:{...current!.employeeMap[id],[field]:value,...(field==='positionOrigin'?{unplanned:value==='__unplanned',positionOrigin:value==='__unplanned'?'':value}:{})}}}));setReviewed(false)
 }
 const identities=preview?[...new Set([...preview.roster,...preview.runs].map((r:D)=>r.employeeId))] as string[]:[]
 return <section className="card" aria-label="Gusto payroll connection">
  <h2>Payroll connection</h2><h3>Gusto</h3>
  <p className="muted">Pull employees, dated compensation and processed payroll from an authorized company token. Finance reviews each employee’s department and planned position before accepting observations. Pulls are manual and read only.</p>
  {error&&<p role="alert" className="error">{error}</p>}
  <Action label="Refresh Gusto status" kind="quiet" run={load}/>
  {connection&&state&&<>
   <Table caption="Gusto connection" heads={['Setting','Value']}>
    <tr><td>Status</td><td>{connection.connected?'Connected':'Disconnected'}</td></tr>
    <tr><td>Read scope</td><td>{connection.scope}</td></tr><tr><td>Schedule</td><td>{connection.schedule}</td></tr>
    {connection.environment&&<tr><td>Environment</td><td>{connection.environment}</td></tr>}
    {connection.companyId&&<tr><td>Company ID</td><td>{connection.companyId}</td></tr>}
    {connection.owner&&<tr><td>Connected by</td><td>{connection.owner}</td></tr>}
    <tr><td>Last accepted pull</td><td>{connection.lastRefresh??'No accepted pull yet'}</td></tr>
   </Table>
   {connection.error&&<p role="alert" className="error">{connection.error}</p>}
   {!connection.connected?<Form submit="Connect Gusto" onSubmit={async(values,form)=>{await api('connections/gusto/connect',values);form.reset();await load()}}>
    <Field label="Gusto environment" name="environment" defaultValue="demo" options={[{value:'demo',label:'Demo'},{value:'production',label:'Production'}]}/>
    <Field label="Gusto company ID" name="companyId"/>
    <Field label="Gusto company access token" name="accessToken" type="password" hint="Use the token for your authorized company. Easel seals it and excludes credentials from archives. Expired tokens require reconnection."/>
    <Field label="I approve read-only employee, compensation and payroll access for this company" name="consent" type="checkbox"/>
   </Form>:<>
    <Action label="Disconnect Gusto" kind="danger" confirm="Delete the stored Gusto token? Accepted observations remain in dated history. Revoke the grant separately in Gusto." run={async()=>{await api('connections/gusto/disconnect',{});setDraft(null);setPreview(null);setReviewed(false);await load()}}/>
    <p className="muted">Disconnect deletes local credentials. It does not revoke the provider grant; revoke access separately in Gusto. Accepted history remains available through its existing pay permissions.</p>
    <Form submit="Pull Gusto preview" onSubmit={async values=>pull({...values,employeeMap:{}})}>
     <Field label="Gusto target scenario" name="scenario" options={options(state.scenarios.filter((s:D)=>s.status!=='frozen'&&s.status!=='closed'))}/>
     <Field label="Gusto payroll line" name="line" options={options(state.lines.filter((l:D)=>l.payroll))}/>
     <Field label="Roster observation date" name="asOf" type="date" defaultValue={new Date().toISOString().slice(0,10)} hint="Today’s UTC date. A current roster cannot establish a historical observation."/>
     <Field label="Payroll check-date window start" name="windowStart" type="date"/>
     <Field label="Payroll check-date window end" name="windowEnd" type="date"/>
     <Field label="Gusto payroll history boundary" name="payrollHistoryStart" type="date" hint="Explicitly choose the earliest provider pay period to scan, on or before every employee’s first hire. Earlier payroll history remains unavailable. Delayed and off-cycle checks are selected from this reviewed period history."/>
    </Form>
   </>}
   {preview&&draft&&<>
    <h3>Review Gusto observations</h3>
    <p>{preview.completeness.employeeCount} employees · {preview.completeness.payrollCount} processed payrolls · complete pages read. Observation date {preview.asOf}. Payroll check dates {preview.completeness.windowStart} to {preview.completeness.windowEnd}.</p>
    <p className="muted">Reviewed payroll period history: {preview.completeness.payrollHistoryStart} through {preview.asOf}, across {preview.completeness.historySlices} slices and {preview.completeness.scannedPayrollCount} payrolls. History before this boundary is unavailable. Check dates outside the requested cost window are excluded.</p>
    <p className="muted">No name or department matching is inferred. Choose a planned position or explicitly mark an employee unplanned. Associate an Easel person when applicable so identity erasure follows the provider employee. Pay cost includes gross wages, employer taxes and employer benefits; provider service fees are excluded.</p>
    <Table caption="Gusto employee mapping" heads={['Employee','Department','Planned position','Associated Easel person']}>
     {identities.map(id=>{const row=preview.roster.find((r:D)=>r.employeeId===id),map=draft.employeeMap[id]??{};return <tr key={id}>
      <td>{row?.name??id}<small>{id}</small>{row&&<small>Hired {row.start}{row.termination?` · Departure ${row.termination}`:''}</small>}</td>
      <td><select aria-label={`Gusto department ${id}`} value={map.department??''} onChange={e=>change(id,'department',e.target.value)}><option value="">Choose…</option>{preview.departments.map((d:D)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
      <td><select aria-label={`Gusto position ${id}`} value={map.unplanned&&!map.positionOrigin?'__unplanned':map.positionOrigin??''} onChange={e=>change(id,'positionOrigin',e.target.value)}><option value="">Choose…</option><option value="__unplanned">Unplanned employee</option>{preview.positions.filter((p:D)=>p.department===map.department).map((p:D)=><option key={p.originId} value={p.originId}>{p.title}</option>)}</select></td>
      <td><select aria-label={`Gusto person ${id}`} value={map.memberEmail??''} onChange={e=>change(id,'memberEmail',e.target.value)}><option value="">No Easel person</option>{state.members.map((m:D)=><option key={m.email} value={m.email}>{m.name} · {m.email}</option>)}</select></td>
     </tr>})}
    </Table>
    <Action label="Review Gusto mapping" run={()=>pull(draft)}/>
    {preview.unmapped.length>0&&<p role="status">{preview.unmapped.length} employees need an explicit mapping before acceptance.</p>}
    <Table caption="Gusto payroll cost review" heads={['Employee','Pay date','Gross wages','Employer taxes','Employer benefits','Cost excluding fees']}>
     {preview.runs.map((r:D)=><tr key={r.sourceObservationId}><td>{preview.roster.find((p:D)=>p.employeeId===r.employeeId)?.name??r.employeeId}</td><td>{r.payDate}</td><td className="num">{money(r.grossWagesCents)}</td><td className="num">{money(r.employerTaxesCents)}</td><td className="num">{money(r.benefitsCents)}</td><td className="num">{money(r.totalCents)}</td></tr>)}
    </Table>
    <p>{preview.runs.length} new pay observations · {preview.completeness.skippedExistingPayRuns} already accepted pay observations skipped · {money(preview.totalCents)} new payroll cost.</p>
    {reviewed&&preview.unmapped.length===0&&<Action label="Accept reviewed Gusto observations" run={async()=>{await api('import/gusto/commit',{...draft,fingerprint:preview.fingerprint});setPreview(null);setDraft(null);setReviewed(false);await load()}}/>}
   </>}
   {connection.imports.length>0&&<Table caption="Gusto accepted history" heads={['Observation date','Status','Observations','Actions']}>
    {connection.imports.map((imp:D)=><tr key={imp.id}><td>{imp.asOf}</td><td>{imp.status}</td><td>{imp.rows}</td><td>
     {imp.status==='importing'&&<Action label={`Continue Gusto pull ${imp.asOf}`} run={async()=>{await api('import/gusto/resume',{id:imp.id});await load()}}/>}
     {['imported','undoing'].includes(imp.status)&&<Action label={`Undo Gusto pull ${imp.asOf}`} kind="danger" confirm="Undo this pull’s journal-owned observations? Other dated history and your plan remain." run={async()=>{await api('import/gusto/undo',{id:imp.id});setPreview(null);setDraft(null);await load()}}/>}
    </td></tr>)}
   </Table>}
  </>}
 </section>
}
