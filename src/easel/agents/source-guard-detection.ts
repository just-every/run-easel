import { canSeeDashboard } from '../dashboard-access'
import { canSeeScenario } from '../scenario-access'
import { canonicalJson, sha256 } from '../../modules/import-kit/src/d1/index'
import { all, type Data } from '../types'
import type { Context } from '../context'

const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function sourceChanges(c: Context, preview: Data, metadata: Data, prior?: Data): Data[] {
 const issues: Data[] = []
 const add = (kind: string, key: string, reason: string, extra: Data = {}) => issues.push({ id: sha256(canonicalJson([kind,key])).slice(0,20), kind, key, reason, ...extra })
 for (const a of preview.accounts) {
  if (!a.target) {
   const name = normalized(a.name || a.account)
   const candidates = all(c.s,'line').filter(l => { const target = normalized(l.name); return name === target || target.length >= 4 && (` ${name} `).includes(` ${target} `) })
   add('account',a.account, a.mappingStatus === 'ambiguous' ? 'Existing rules disagree on the target' : 'No reviewed account mapping', { account:a.account, name:a.name, proposals:candidates.map(l => ({target:l.id,name:l.name,reason:`Source account name “${a.name || a.account}” ${name === normalized(l.name) ? 'normalizes to the same name as' : 'contains the complete line name'} “${l.name}”; finance must approve this match.`})) })
  }
 }
 for (const d of preview.departments.filter((d:Data)=>d.department === null)) add('department',d.source,'No reviewed department mapping',{source:d.source})
 for (const d of preview.dimensionExceptions) add('dimension',`${d.dimension}:${d.line}`,d.reason,{dimension:d.dimension,sources:d.sources})
 if (prior) {
  for (const a of metadata.accounts) { const old=prior.metadata.accounts.find((r:Data)=>r.account===a.account); if(old && canonicalJson([old.name,old.types])!==canonicalJson([a.name,a.types])) add('metadata',a.account,`Account ${a.account} changed name or type`,{before:old,after:a}) }
  if(canonicalJson(prior.metadata.headers)!==canonicalJson(metadata.headers)) add('shape','headers','Source column names or order changed',{before:prior.metadata.headers,after:metadata.headers})
  if(canonicalJson(prior.metadata.dimensions)!==canonicalJson(metadata.dimensions)) add('dimensions','members','Source departments, classes or tracking options changed',{before:prior.metadata.dimensions,after:metadata.dimensions})
 }
 return issues
}

/** A conservative impact inventory, explicitly describing possible dependencies rather than predicting cell amounts. */
export function sourceImpacts(c: Context, month: string) {
 const scenarios=all(c.s,'scenario').filter(s=>canSeeScenario(c.x,s)).filter(s=>s.kind==='forecast' || s.actualsThrough && s.actualsThrough >= month || all(c.s,'expense').some(i=>i.scenario===s.id && i.history) || all(c.s,'revenue').some(i=>i.scenario===s.id && i.history))
 return {
  scenarios:scenarios.map(s=>({id:s.id,name:s.name,status:s.status==='frozen' || s.snapshot ? 'captured; unchanged' : 'working; dependent conclusions held'})),
  reports:[{id:'actuals',name:'Actuals reconciliation',status:'dependent month held'},...all(c.s,'dashboard').filter(d=>d.report && canSeeDashboard(c.s,c.x,d) && scenarios.some(s=>s.id===d.scenario)).map(d=>({id:d.id,name:d.name,status:'source-dependent report'}))],
  packs:all(c.s,'pack').filter(p=>(p.months ?? [p.month]).some((m:string)=>m>=month)).map(p=>({id:p.id,name:p.title,status:p.status==='published'?'published snapshot; unchanged':'draft; refresh held'})),
  alerts:all(c.s,'cash-alert-rule').filter(r=>r.enabled && r.kind!=='bank-below-plan').map(r=>({id:r.id,name:r.name,status:'held until reviewed refresh accepted'})),
 }
}
