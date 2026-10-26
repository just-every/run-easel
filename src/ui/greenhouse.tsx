import { useEffect, useState } from 'react'
import { Action, api as easelApi, command, Field, Form, money, options, Table, type D } from './shared'

const api=(path:string,body?:unknown)=>easelApi(path.replace(/^\//,''),body)

/** Existing Settings forms and native proposal doors; no automatic plan edits. */
export function GreenhouseConnection() {
 const [connection,setConnection]=useState<D|null>(null),[state,setState]=useState<D|null>(null),[preview,setPreview]=useState<D|null>(null),[draft,setDraft]=useState<D|null>(null),[proposal,setProposal]=useState<D|null>(null),[error,setError]=useState('')
 const load=async()=>{try{const [status,current]=await Promise.all([api('/connections/greenhouse'),api('state')]);setConnection(status);setState(current)}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[])
 return <section className="card" aria-label="Greenhouse recruiting connection">
  <h2>Recruiting connection</h2><h3>Greenhouse</h3>
  <p>Read one requisition at a time. Map its department explicitly, review the observation, then create a proposal. The official plan changes only when finance promotes the reviewed proposal.</p>
  {error&&<p role="alert" className="error">{error}</p>}
  <Action label="Refresh Greenhouse status" kind="quiet" run={load}/>
  {connection&&state&&<>
   <Table caption="Greenhouse connection" heads={['Setting','Value']}>
    <tr><td>Status</td><td>{connection.connected?'Connected':'Disconnected'}</td></tr>
    <tr><td>Key</td><td>{connection.keySuffix?`••••${connection.keySuffix}`:'No stored key'}</td></tr>
    <tr><td>Last read rows</td><td>{connection.rowCount??0}</td></tr>
    <tr><td>Rate limit</td><td>{connection.rateLimited?'Rate limited; retry explicitly':'Not reported'}</td></tr>
    <tr><td>Read scope</td><td>{connection.scope}</td></tr>
    <tr><td>Schedule</td><td>{connection.schedule}</td></tr>
    <tr><td>Connected by</td><td>{connection.owner??'—'}</td></tr>
    <tr><td>Last proposal observation</td><td>{connection.lastRefresh??'None'}</td></tr>
   </Table>
   {connection.error&&<p role="alert">{connection.error}</p>}
   <p>{connection.revocationInstruction}</p>
   {!connection.connected?<Form submit="Connect Greenhouse" onSubmit={async(values,form)=>{await api('/connections/greenhouse/connect',values);form.reset();await load()}}>
    <Field label="Greenhouse Harvest API key" name="apiKey" type="password" hint="Grant GET access to jobs, openings, offers and candidates only. Easel seals this key and excludes it from archives."/>
    <Field label="I approve manual read-only ATS observations" name="consent" type="checkbox"/>
   </Form>:<>
    <Action label="Check Greenhouse connection" run={async()=>{await api('/connections/greenhouse/check',{});await load()}}/>
    <Action label="Disconnect Greenhouse" kind="danger" confirm="Delete the local key? Revoke it separately in Greenhouse API Credential Management. Existing proposals and history remain." run={async()=>{await api('/connections/greenhouse/disconnect',{});setPreview(null);setDraft(null);await load()}}/>
    <p className="muted">Choose a job and, when it has several openings, its numeric opening ID. Configure level and target_start_date on the job, and annual_salary as a USD currency field on jobs and offers. Accepted offers use their start date. Salaries are annual. Missing or ambiguous source fields block the preview.</p>
    <Form submit="Preview Greenhouse requisition" onSubmit={async values=>{setProposal(null);const result=await api('/greenhouse/preview',values);setDraft(values);setPreview(result)}}>
     <Field label="Greenhouse target plan" name="scenario" options={options(state.scenarios.filter((s:D)=>s.status==='working'&&s.kind!=='proposal'&&!s.sandbox))}/>
     <Field label="Greenhouse job ID" name="jobId"/>
     <Field label="Greenhouse opening ID" name="openingId" required={false} hint="Optional for a job with one opening."/>
     <Field label="Greenhouse mapped department" name="department" options={options(state.departments)}/>
     <Field label="Greenhouse payroll line" name="line" options={options(state.lines.filter((l:D)=>l.payroll))}/>
    </Form>
   </>}
   {preview&&draft&&<>
    <h3>Review requisition proposal</h3>
    <p>Source department: {preview.source.sourceDepartment.name}. Explicit target: {state.departments.find((d:D)=>d.id===preview.department)?.name}. Action: {preview.action}.</p>
    <Table caption="Greenhouse proposed position" heads={['Field','Current plan','Proposed']}>
     <tr><td>Role and level</td><td>{preview.prior?.title??'Not planned'}</td><td>{preview.source.title} · {preview.source.level}</td></tr>
     <tr><td>Person</td><td>{preview.prior?.holder||'To be hired'}</td><td>{preview.source.holder||'To be hired'}</td></tr>
     <tr><td>Start date</td><td>{preview.prior?.plannedStartDate??'—'}</td><td>{preview.source.start||'Remove position'}</td></tr>
     <tr><td>Annual salary</td><td>{preview.prior?money(preview.prior.annualSalaryCents):'—'}</td><td>{preview.source.annualSalary?money(Math.round(Number(preview.source.annualSalary)*100)):'Removed'}</td></tr>
    </Table>
    <p>Plan revision {preview.revision}. Department on-cost defaults apply to new roles; existing compensation assumptions remain. Review full monthly costs in the proposal comparison before promotion.</p>
    <Action label="Create reviewed ATS proposal" run={async()=>{const result=await api('/greenhouse/propose',{...draft,fingerprint:preview.fingerprint});setProposal(result.proposal);setPreview(null);await load()}}/>
   </>}
   {proposal&&<>
    <h3>ATS proposal created</h3><p>{proposal.name}. Official plan unchanged.</p>
    <p><a href={`?tab=scenarios&compareFrom=${proposal.branchedFrom.scenario}&compareTo=${proposal.id}`}>Review ATS proposal and costs</a></p>
    {proposal.proposalStatus==='draft'&&<Action label="Submit ATS proposal for finance" run={async()=>{setProposal(await command('proposal-submit',{id:proposal.id}));await load()}}/>}
   </>}
  </>}
 </section>
}
