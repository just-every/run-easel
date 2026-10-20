// An app export follows scenario shares even though its import journals retain
// original bytes. Native installation backups keep their existing full policy.
import type { Context } from './context'
import { canSeeScenario } from './scenario-access'
import { all, get, type Data } from './types'

export async function payrollExportAccess(c: Context) {
 const destinations = new Set(all(c.s,'payroll-import').filter(i=>!canSeeScenario(c.x,get(c.s,'scenario',i.scenario))).map(i=>i.destination))
 const jobs = new Set<string>(), stages = new Set<string>()
 if (destinations.size) {
  const rows = (await c.db.prepare('SELECT id,destination FROM ik_jobs').all<Data>()).results
  for (const row of rows) if (destinations.has(row.destination)) jobs.add(row.id)
  for (const table of ['ik_d1_staging','ik_d1_native_staging']) {
   for (const row of (await c.db.prepare(`SELECT id,destination FROM ${table}`).all<Data>()).results) if(destinations.has(row.destination)) stages.add(row.id)
  }
 }
 return { job:(id:string)=>!jobs.has(id), row:(table:string,row:Data)=>!table.startsWith('ik_') || !(
  destinations.has(row.destination) || jobs.has(row.job_id) || jobs.has(row.owner_job_id) || stages.has(row.stage_id) ||
  table === 'ik_jobs' && jobs.has(row.id) || ['ik_d1_staging','ik_d1_native_staging'].includes(table) && stages.has(row.id)
 ) }
}
