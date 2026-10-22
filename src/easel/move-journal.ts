import type { Context } from './context'
import { journalContext, kitContext } from './kit'
import { transformErased, type ErasureMap } from './erasure-map.mjs'
import { all, type Data } from './types'

export const structureAssumptions = (c: Context,destination:string) => [...c.s.values()].filter(r=>r.destination!==destination && ['workspace','department','line','dimension','dimension-member'].includes(r.kind)).map(r=>[r.kind,r.id,r.revision])
export const MOVE_NAMESPACE = 'easel-incumbent-files'
export function moveContext(c: Context, destination: string, mapping: string, job?: {mapping_version:string;principal_id:string}, applying = false) {
 const ctx = job ? journalContext(c.db,c.x.actor,destination,MOVE_NAMESPACE,job) : kitContext(c.db,c.x.actor,destination,MOVE_NAMESPACE,mapping)
 const imp = all(c.s,'move-import').find(i=>i.destination===destination)
 const prepare = ctx.storage.targets.preparePreservedUndo!
 if (imp) ctx.storage.targets.preparePreservedUndo = async function(...args) {
  const snapshot = await prepare.call(this,...args)
  // This operation's own status/report is administration, never an independent business reference.
  return {...snapshot,dependencies:snapshot.dependencies.filter(d=>!(d.cause.table==='e_records' && d.cause.field==='move-import' && d.cause.recordId===imp.id))}
 }
 const maps = all(c.s,'erasure').filter(m=>!imp || !['undoing','undone'].includes(imp.status) || (imp.undoErasureReceipts ?? []).includes(m.id)) as (Data & ErasureMap)[]
 ctx.storage.targets.ownedContent = row => {
  let revision = row.revision
  for (const map of [...maps].reverse()) {const redaction=(map.redactions ?? []).find((r:Data)=>r.kind===row.targetKind && r.id===row.targetId && r.to===revision);if(redaction)revision=redaction.from}
  return {revision,value:transformErased(row.value,maps),attachment:row.attachment ?? null}
 }
 const predicate = ctx.authorization!.predicate!
 ctx.authorization = { ...ctx.authorization!, predicate: (...args) => {
  const native = predicate(...args) as {sql:string;params:unknown[]}
  const assumptions = job && applying ? imp!.assumptions : structureAssumptions(c,destination)
  const auth = !applying ? native : {sql:`(${native.sql}) AND (SELECT COUNT(*) FROM e_records WHERE kind IN ('workspace','department','line','dimension','dimension-member') AND destination<>?)=? AND NOT EXISTS(SELECT 1 FROM json_each(?) expected LEFT JOIN e_records actual ON actual.kind=json_extract(expected.value,'$[0]') AND actual.id=json_extract(expected.value,'$[1]') WHERE actual.revision IS NOT json_extract(expected.value,'$[2]'))`,params:[...native.params,destination,assumptions.length,JSON.stringify(assumptions)]}
  return c.x.actor.baseRole === 'owner' ? auth : {sql:`(${auth.sql}) AND (EXISTS(SELECT 1 FROM e_records WHERE kind='pay-grant' AND id=? AND json_extract(value,'$.granted')=1) OR EXISTS(SELECT 1 FROM e_records WHERE kind='access-group' AND json_extract(value,'$.payDetail')=1 AND EXISTS(SELECT 1 FROM json_each(value,'$.members') WHERE value=?)))`,params:[...auth.params,c.x.actor.email,c.x.actor.email]}
 } }
 return ctx
}
