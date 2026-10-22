import { useState } from 'react'
import { Action, api, money, Table, type D } from './shared'
import { FilePicker } from './file-picker'
const fileBase64 = async (file:File) => { const bytes = new Uint8Array(await file.arrayBuffer()); let raw = ''; for (let i=0;i<bytes.length;i+=0x8000) raw += String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(raw) }

/** Original provider exports plus an explicit buyer mapping, reviewed before saving. */
export function IncumbentImport({state,refresh}:{state:D;refresh:()=>Promise<void>}) {
 const [provider,setProvider] = useState('adaptive'), [files,setFiles] = useState<File[]>([]), [recipe,setRecipe] = useState<D|null>(null), [preview,setPreview] = useState<D|null>(null), [error,setError] = useState('')
 const body = async () => {
  if (!recipe) throw Error('Choose the buyer mapping first')
  const originals = await Promise.all((recipe.files ?? files.map(f=>({name:f.name}))).map(async (meta:D)=>{
   const file = files.find(f=>f.name===meta.name)
   if (!file) throw Error(`Choose the original export ${meta.name}`)
   return {...meta,base64:await fileBase64(file)}
  }))
  return {provider,files:originals,options:recipe.options ?? {},mapping:recipe.mapping ?? {}}
 }
 const label = (kind:string,id:string,source:string) => preview?.created?.find((r:D)=>r.kind===kind && r.id===id)?.name ?? (kind==='scenario' ? preview?.versions : kind==='line' ? state.lines : state.departments)?.find((r:D)=>r.id===id)?.name ?? source
 const review = async () => {try {setError('');setPreview(await api('import/incumbent/preview',await body()))}catch(e){setError((e as Error).message);setPreview(null)}}
 return <section className="card"><h2>Move in an existing planning model</h2>
  <p>Choose the original exports and a buyer mapping. Preview creates no records. Each source version becomes a separate working scenario. Payroll must reconcile from positions; differences block acceptance. <a href="https://run-easel.com/docs/move-in" target="_blank" rel="noreferrer">Export formats and mapping</a></p>
  <label>Planning export provider<select aria-label="Planning export provider" value={provider} onChange={e=>{setProvider(e.target.value);setPreview(null)}}>{[['adaptive','Adaptive Planning'],['planful','Planful'],['anaplan','Anaplan'],['runway','Runway'],['pigment','Pigment']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  <label>Original planning exports<input aria-label="Original planning exports" type="file" multiple accept=".xml,.csv,.xlsx,.json" onChange={e=>{setFiles([...e.target.files ?? []]);setPreview(null)}} /></label>
  <FilePicker label="Buyer mapping JSON" button="Choose buyer mapping" accept=".json" filename={recipe ? 'Mapping loaded' : undefined} onFile={async f=>{try{setRecipe(JSON.parse(await f.text()));setPreview(null);setError('')}catch{setError('Choose a valid mapping JSON file')}}} />
  <button type="button" disabled={!files.length || !recipe} onClick={()=>void review()}>Preview planning model</button>
  {error && <p role="alert" className="error">{error}</p>}
  {preview && <div><p>{preview.created?.filter((r:D)=>r.kind==='position').length ?? 0} positions · {preview.versions.length} versions · {preview.ready ? 'All account totals reconciled' : 'Resolve mappings and account differences before accepting'}</p>
   <Table caption="Records to create" heads={['Kind','Name']}>{(preview.created ?? []).map((r:D)=><tr key={r.id}><td>{r.kind}</td><td>{r.name}</td></tr>)}</Table>
   {(preview.unresolved ?? []).length>0 && <p role="alert">Missing mappings: {preview.unresolved.join(', ')}</p>}
   <Table caption="Incumbent account reconciliation" heads={['Version','Account','Level','Month','Export','Native','Difference']}>{(preview.reconciliation ?? []).map((r:D,i:number)=><tr key={i}><td>{label('scenario',r.scenario,r.version)}</td><td>{label('line',r.line,r.account)}</td><td>{label('department',r.department,r.level)}</td><td>{r.month}</td><td>{r.exported===null?'Unavailable':money(r.exported,state.workspace.currency)}</td><td>{money(r.imported,state.workspace.currency)}</td><td>{r.difference===null?'Unavailable':money(r.difference,state.workspace.currency)}</td></tr>)}</Table>
   <Table caption="Items without a mapped equivalent" heads={['Source','Reason']}>{(preview.unmapped ?? []).map((r:D,i:number)=><tr key={i}><td style={{overflowWrap:'anywhere',wordBreak:'break-word',verticalAlign:'top'}}>{r.location}</td><td style={{whiteSpace:'normal',overflowWrap:'anywhere',minWidth:260,verticalAlign:'top'}}>{r.reason}</td></tr>)}</Table>
   {preview.ready && <Action label="Accept reviewed planning model" run={async()=>{await api('import/incumbent/commit',{...await body(),fingerprint:preview.fingerprint});setPreview(null);await refresh()}} />}
  </div>}
  {(state.moveImports ?? []).length>0 && <Table caption="Incumbent imports" heads={['Provider','Versions','Status','Actions']}>{state.moveImports.map((imp:D)=><tr key={imp.id}><td>{imp.provider}</td><td>{imp.scenarios.length}</td><td>{imp.status}</td><td>{imp.status==='importing' && <Action label="Continue model import" run={async()=>{await api('import/incumbent/resume',{id:imp.id});await refresh()}} />}{['imported','undoing'].includes(imp.status) && <Action label={imp.status==='undoing'?'Continue model undo':'Undo model import'} kind="danger" confirm="Remove records this import created? Later independent changes are kept." run={async()=>{await api('import/incumbent/undo',{id:imp.id});await refresh()}} />}</td></tr>)}</Table>}
 </section>
}
