// One journal ownership projection for import, undo and retained-original reads.
import type { Context } from './context'
import { transformErased, type ErasureMap } from './erasure-map.mjs'
import { journalContext, kitContext } from './kit'
import { all, type Data } from './types'
const NAMESPACE = 'easel-payroll-files'

export function payrollJournalContext(c: Context, destination: string, mapping: string, job?: {mapping_version:string;principal_id:string}) {
 const ctx = job ? journalContext(c.db,c.x.actor,destination,NAMESPACE,job) : kitContext(c.db,c.x.actor,destination,NAMESPACE,mapping)
 const maps = all(c.s, 'erasure') as (Data & ErasureMap)[]
 ctx.storage.targets.ownedContent = row => {
  // Erasure is the only permitted ownership-preserving revision change.
  // A later edit has an unknown revision and remains a conflict on undo.
  let revision = row.revision
  for (const map of [...maps].reverse()) {
   const redaction = (map.redactions ?? []).find((r:Data)=>r.kind===row.targetKind && r.id===row.targetId && r.to===revision)
   if (redaction) revision = redaction.from
  }
  return {revision, value:transformErased(row.value,maps), attachment:row.attachment ?? null}
 }
 const predicate = ctx.authorization!.predicate!
 ctx.authorization = { ...ctx.authorization!, predicate: (...args) => {
  const auth = predicate(...args) as {sql:string;params:unknown[]}
  return c.x.actor.baseRole === 'owner' ? auth : { sql: `(${auth.sql}) AND EXISTS(SELECT 1 FROM e_records WHERE kind='pay-grant' AND id=? AND json_extract(value,'$.granted')=1)`, params: [...auth.params,c.x.actor.email] }
 } }
 return ctx
}
