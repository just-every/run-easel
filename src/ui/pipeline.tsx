import { useEffect, useState } from 'react'
import type { Shared } from './app'
import { Action, api, decimalText, Field, Form, money, options, Table, type D } from './shared'

const providers=[{value:'hubspot',label:'HubSpot'},{value:'salesforce',label:'Salesforce'},{value:'orbit',label:'Orbit'}]
const post=(path:string,body:D)=>api(path,body)

/** Native finance review uses the same forms, tables and revision feedback as
 * the rest of Easel. Provider credentials are never returned into a form. */
export function Pipeline({state,refresh}:Shared){
 const scenarios=state.scenarios.filter((s:D)=>s.status!=='frozen'&&s.kind!=='proposal'&&!s.sandbox)
 const [provider,setProvider]=useState(()=>typeof window!=='undefined'&&providers.some(p=>p.value===new URLSearchParams(window.location.search).get('crm'))?new URLSearchParams(window.location.search).get('crm')!:'hubspot'),[scenario,setScenario]=useState(scenarios.find((s:D)=>s.kind==='forecast')?.id??scenarios[0]?.id??'')
 const [oauth,setOauth]=useState(false)
 const [status,setStatus]=useState<D|null>(null),[view,setView]=useState<D|null>(null),[source,setSource]=useState<D|null>(null),[review,setReview]=useState<D|null>(null),[staged,setStaged]=useState(false),[error,setError]=useState('')
 const sc=state.scenarios.find((s:D)=>s.id===scenario),name=providers.find(p=>p.value===provider)!.label
 const load=async()=>{setStatus(await api(`connections/pipeline/${provider}`));if(scenario)setView(await api(`pipeline/${scenario}`))}
 useEffect(()=>{let live=true;setSource(null);setReview(null);setStaged(false);setError('');Promise.all([api(`connections/pipeline/${provider}`),scenario?api(`pipeline/${scenario}`):Promise.resolve(null)]).then(([s,v])=>{if(live){setStatus(s);setView(v)}},e=>{if(live)setError(e.message)});return()=>{live=false}},[provider,scenario,sc?.revision])
 const previous=view?.reviews?.find((r:D)=>r.provider===provider)
 return <>
  <section className="card">
   <h2>Pipeline connections</h2>
   <p>Read CRM deals into a reviewed planning estimate. Finance owns probabilities, close-date slippage and product recognition. Easel never changes CRM deals or sends invoices.</p>
   <label>CRM provider<select aria-label="CRM provider" value={provider} onChange={e=>setProvider(e.target.value)}>{providers.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
   {error&&<p role="alert" className="error">{error}</p>}
   {status&&<><p role="status">{status.connected?`${name} connected · credential ending ${status.suffix}`:`${name} disconnected`}</p><p className="muted">{status.scope} · {status.schedule}</p>
    <p>Last accepted refresh: {status.lastRefresh??'None'} · {status.rowCount??0} deals</p>
    {status.error&&<p role="alert">{status.error}</p>}{status.rateLimit&&<p role="status">{status.rateLimit}</p>}
    {status.providerRevocation&&<p>Provider revocation: {status.providerRevocation.status}{status.providerRevocation.httpStatus?` (HTTP ${status.providerRevocation.httpStatus})`:''}. {status.providerRevocation.status!=='confirmed'&&status.ownerAction}</p>}
    {status.connected?<Action label={`Disconnect ${name}`} kind="danger" run={async()=>{await post(`connections/pipeline/${provider}/disconnect`,{});await load()}}/>:
     <><p>{provider!=='orbit'&&<button type="button" className="quiet" onClick={()=>setOauth(!oauth)}>{oauth?'Use an existing OAuth refresh grant':'Start OAuth authorization'}</button>}</p><Form key={`${provider}:${oauth}`} submit={oauth&&provider!=='orbit'?`Authorize ${name} read-only`:`Connect ${name} read-only`} onSubmit={async v=>{const result=await post(`connections/pipeline/${provider}/${oauth&&provider!=='orbit'?'begin':'connect'}`,{...v,currency:state.workspace.currency});if(result.authorizationUrl)window.location.assign(result.authorizationUrl);else await load()}}>
      {provider==='orbit'?<Field label="Orbit scoped read-only token" name="key" type="password"/>:<>
       <Field label="CRM client ID" name="clientId"/><Field label="CRM client secret" name="clientSecret" type="password"/>
       {!oauth&&<Field label="CRM OAuth refresh token" name="refreshToken" type="password"/>}
       {provider==='salesforce'&&<><Field label="Salesforce instance" name="instance" hint="Your https://company.my.salesforce.com origin"/><Field label="Salesforce line-item term field" name="termField" defaultValue="Subscription_Term__c"/></>}
      </>}
      <Field label="I approve read-only CRM access" name="consent" type="checkbox"/>
      <Field label="This provider grant has only read permission" name="readOnly" type="checkbox"/>
      <p className="muted wide">{provider==='salesforce'?'Use a Salesforce user whose object permissions are read-only. OAuth api scope alone does not restrict writes.':provider==='hubspot'?'Use an OAuth app with deals, line items and owners read scopes, without write scopes.':'Orbit must expose dated deals, owners and products through its scoped read-only API. Incomplete sources are refused.'} Credentials stay encrypted and are excluded from exports. {status.ownerAction}</p>
     </Form></>}
   </>}
  </section>
  <section className="card">
   <h2>Review pipeline</h2>
   <label>Pipeline scenario<select aria-label="Pipeline scenario" value={scenario} onChange={e=>setScenario(e.target.value)}>{scenarios.map((s:D)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   {view?.blocked&&<p role="status">{view.blocked}</p>}
   <Action label={`Read ${name} deals`} run={async()=>{setSource(await post('pipeline/observe',{provider,scenario,revision:sc.revision}));setReview(null);setStaged(false);await load()}}/>
   {source&&<Form key={`${provider}:${scenario}:${JSON.stringify(source)}`} submit="Preview weighted pipeline" onSubmit={async v=>{
    const body={provider,scenario,revision:sc.revision,nextExpectedAt:new Date(v.nextExpectedAt).toISOString(),coverageTarget:v.coverageTarget,
     stages:source.stages.map((s:D,i:number)=>({stage:s.id,mode:v[`stage-mode-${i}`],probability:v[`stage-probability-${i}`],slippageDays:Number(v[`stage-days-${i}`])})),
     products:[...new Set(source.deals.flatMap((d:D)=>d.products.length?d.products.map((p:D)=>p.product):['*']))].sort().map((product,i)=>({product,line:v[`product-line-${i}`],department:v[`product-department-${i}`],rule:v[`product-rule-${i}`],termMonths:Number(v[`product-term-${i}`]),termSource:v[`product-source-${i}`],dsoDays:Number(v[`product-dso-${i}`])})),
     owners:[...new Set(source.deals.map((d:D)=>d.owner))].sort().map((owner,i)=>({owner,position:v[`owner-position-${i}`]??'',member:v[`owner-member-${i}`]??''})),
     periods:source.periods.map((p:D,i:number)=>({period:p.id,month:v[`period-${i}`]}))}
    const result=await post('pipeline/preview',body);setReview({...result,body});setStaged(false)
   }}>
    <div className="wide"><h3>Stage assumptions</h3><p>Closed won deals use 100%; closed lost deals use 0%. Slippage applies to open deals. Every accepted assumption keeps its source version.</p></div>
    {source.stages.map((s:D,i:number)=>{const old=previous?.assumptions.stages.find((x:D)=>x.id===s.id);return <fieldset className="wide" key={s.id}><legend>{s.name} · CRM {s.probabilityBps===null?'unavailable':`${decimalText(s.probabilityBps)}%`}</legend>
     <Field label={`${s.name} probability source`} name={`stage-mode-${i}`} options={[{value:'crm',label:'CRM probability'},{value:'override',label:'Finance override'}]} defaultValue={old?.mode??(s.probabilityBps===null?'override':'crm')}/>
     <Field label={`${s.name} probability percent`} name={`stage-probability-${i}`} defaultValue={decimalText(old?.probabilityBps??s.probabilityBps??0)}/>
     <Field label={`${s.name} slippage days`} name={`stage-days-${i}`} type="number" defaultValue={old?.slippageDays??0}/>
    </fieldset>})}
    <div className="wide"><h3>Product recognition</h3><p>One-time recognizes in the slipped close period. Ratable and subscription-start allocate the weighted deal total over the term, starting in that period, with the final cent remainder. Planning invoices bill upfront; collection follows DSO.</p></div>
    {[...new Set<string>(source.deals.flatMap((d:D)=>d.products.length?d.products.map((p:D)=>p.product):['*']))].sort().map((product,i)=>{const old=previous?.assumptions.products.find((x:D)=>x.product===product);return <fieldset className="wide" key={product}><legend>Product {product==='*'?'Deal amount (no line items)':product}</legend>
     <Field label={`Product ${product} revenue line`} name={`product-line-${i}`} options={options(state.lines.filter((l:D)=>l.type==='revenue'))} defaultValue={old?.line}/>
     <Field label={`Product ${product} department`} name={`product-department-${i}`} options={options(state.departments)} defaultValue={old?.department}/>
     <Field label={`Product ${product} recognition rule`} name={`product-rule-${i}`} options={[{value:'one-time',label:'One-time'},{value:'ratable',label:'Ratable over term'},{value:'subscription-start',label:'Subscription start'}]} defaultValue={old?.rule??'one-time'}/>
     <Field label={`Product ${product} term source`} name={`product-source-${i}`} options={[{value:'finance',label:'Finance term'},{value:'crm',label:'CRM line-item term'}]} defaultValue={old?.termSource??'finance'}/>
     <Field label={`Product ${product} term periods`} name={`product-term-${i}`} type="number" defaultValue={old?.termMonths??12}/><Field label={`Product ${product} collection days`} name={`product-dso-${i}`} type="number" defaultValue={old?.dsoDays??0}/>
    </fieldset>})}
    <div className="wide"><h3>CRM owners</h3><p>Choose an explicit native person for sourced questions and a permitted position for commission estimates. Blank choices record no link; Easel never matches identities by name.</p></div>
    {[...new Set<string>(source.deals.map((d:D)=>d.owner))].sort().map((owner,i)=>{const old=previous?.assumptions.owners.find((x:D)=>x.owner===owner);return <fieldset className="wide" key={owner}><legend>Owner {owner||'Unassigned'}</legend>
     <Field label={`Owner ${owner} native person`} name={`owner-member-${i}`} required={false} options={[state.me,...state.members.filter((m:D)=>m.active&&m.role!=='viewer'&&m.email!==state.me.email)].map((m:D)=>({value:m.email,label:m.name}))} defaultValue={old?.member}/>
     <Field label={`Owner ${owner} commission position`} name={`owner-position-${i}`} required={false} options={(view?.positions??[]).map((p:D)=>({value:p.origin,label:`${p.title} · ${state.departments.find((d:D)=>d.id===p.department)?.name??'Department'}`}))} defaultValue={old?.position} hint="Blank means no commission. Position choices require Pay detail."/>
    </fieldset>})}
    {source.periods.length>0&&<h3 className="wide">Salesforce fiscal period mapping</h3>}
    {source.periods.map((p:D,i:number)=><Field key={p.id} label={`Fiscal ${p.id} (${p.start}–${p.end}) Easel period`} name={`period-${i}`} type="month" defaultValue={previous?.assumptions.periods.find((x:D)=>x.id===p.id)?.month}/>)}
    <Field label="Quarterly pipeline bookings target" name="coverageTarget" defaultValue={decimalText(sc.pipelineCoverageTargetCents??10000000)} hint="Coverage is weighted open next-fiscal-quarter bookings divided by this finance target."/>
    <Field label="Next expected CRM update" name="nextExpectedAt" type="datetime-local" defaultValue={new Date(Date.now()+86400000).toISOString().slice(0,16)}/>
   </Form>}
   {review&&<div><h3>Weighted bookings preview</h3><p>{review.changes.length} source changes. No revenue changes until the exact review is accepted.</p>
    <Table caption="Weighted CRM bookings" heads={['Deal / product','Booking period','Weighted bookings','Source arithmetic']}>{review.bookings.map((r:D,i:number)=><tr key={i}><th scope="row">{r.deal} / {r.product}</th><td>{r.month}</td><td className="num">{money(r.amountCents,state.workspace.currency)}</td><td className="wrap">{r.trace}</td></tr>)}</Table>
    <details><summary>Source changes and affected records</summary><p>Working scenarios: {review.impacts.scenarios.map((r:D)=>r.name).join(', ')}. Reports: {review.impacts.reports.map((r:D)=>r.name).join(', ')||'None'}. {review.impacts.packs.length} packs retain their captures; {review.impacts.alerts.length} alert rules depend on the source.</p><ul>{review.changes.map((c:D)=><li key={c.origin}><strong>{c.after?.name??c.before?.name}</strong>: {c.before?`${c.before.start} · ${money(c.before.contractValueCents,state.workspace.currency)} · ${c.before.pipeline.stageName}`:'New source'} → {c.after?`${c.after.start} · ${money(c.after.contractValueCents,state.workspace.currency)} · ${c.after.pipeline.stageName}`:'removed from CRM'}</li>)}</ul></details>
    {!staged?<Action label="Stage source changes" run={async()=>{await post('pipeline/stage',review.body);setStaged(true);await load()}}/>:<Form submit="Accept reviewed pipeline" onSubmit={async v=>{await post('pipeline/accept',{...review.body,digest:review.digest,reason:v.reason});setSource(null);setReview(null);setStaged(false);await refresh();await load()}}><Field label="Finance source-review reason" name="reason" type="textarea"/></Form>}
   </div>}
   {view&&<><h3>Last accepted pipeline</h3><Table caption="Accepted weighted pipeline" heads={['Deal','Stage','Booking period','Weighted amount']}>{view.deals.map((d:D)=><tr key={d.id}><th scope="row">{d.name}<small style={{display:'block'}}>{d.provider} · {d.deal}</small></th><td>{d.stage} · {decimalText(d.probabilityBps)}% {d.closed?'closed outcome':d.mode==='override'?'finance override':'CRM'}</td><td>{d.month}</td><td className="num">{money(d.weightedCents,state.workspace.currency)}</td></tr>)}</Table></>}
  </section>
 </>
}
