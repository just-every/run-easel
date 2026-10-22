import { createPortability } from '@runeditrun/rer/modules/portability'
import { createHmac, randomBytes } from 'node:crypto'
import { moveErasureScopes } from './move-erasure.mjs'
import { payrollErasureScopes, payrollOriginalScopes, payrollIdentityHistory } from './payroll-erasure.mjs'
import { requireFinance } from './access'
import type { Context } from './context'
import { type ErasureMap, erasureMatchers, erasedHash, transformErased } from './erasure-map.mjs'
import { get, put, requireThat, text, uid, type Data } from './types'

export async function erasure(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (op !== 'person-erase') return
 requireFinance(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent, 'Use a signed-in finance session for erasure', 403)
 const email = text(b.email, 'Former member email').toLowerCase()
 const native = await c.db.prepare('SELECT id,email,display_name AS name,role,status FROM oa_operators WHERE email=?').bind(email).first<Data>()
 if (native?.role === 'owner' || native?.role === 'admin') {
  const count = await c.db.prepare("SELECT COUNT(*) AS n FROM oa_operators WHERE role IN ('owner','admin') AND status='active'").first<{ n:number }>()
  requireThat(count && count.n > 1, 'Cannot erase the last finance member', 409)
 }
 requireThat(email !== c.x.actor.email && native?.role !== 'owner', 'The installation owner cannot be erased', 409)
 const member = get(c.s, 'member', email, 'former member')
 requireThat(!member.active, 'Deactivate the former member before erasure', 409)
 const existingKey = await c.db.prepare('SELECT value FROM e_erasure_key WHERE id=1').first<{value:string}>()
 const installationKey = existingKey?.value ?? Buffer.from(randomBytes(32)).toString('hex')
 const pseudonym = `Erased person ${createHmac('sha256', installationKey).update(native?.id ?? email).digest('hex').slice(0,20)}`
 const receiptId = uid()
 const identityRecords = await payrollIdentityHistory(c.db,[...c.s.values()])
 const map: Data & ErasureMap = { receiptId, pseudonym, matchers: erasureMatchers([email, member.name, native?.name, native?.id]), erasedIdHash: erasedHash(native?.id ?? email), at:c.now, moveScopes:moveErasureScopes(identityRecords,email), payrollScopes:payrollErasureScopes(identityRecords,email), redactions:[] }
 Object.assign(map, payrollOriginalScopes([map], identityRecords, (await c.db.prepare('SELECT id,destination FROM ik_jobs').all<Data>()).results)[0])
 let records=0
 for (const [rowKey,row] of [...c.s]) {
  if (row.kind === 'member' && row.id === email || row.kind === 'pay-grant' && row.id === email) { c.s.delete(rowKey); records++; continue }
  if (row.kind === 'erasure') continue
  const value=transformErased(row.value,[map]); const id=transformErased(row.id,[map])
  if (JSON.stringify(value) === JSON.stringify(row.value) && id === row.id) continue
  if (id !== row.id) c.s.delete(rowKey)
  put(c.s,row.kind,id,value)
  if ((row.destination.startsWith('payroll:') || row.destination.startsWith('incumbent:'))) map.redactions.push({kind:row.kind,id,from:row.revision,to:c.s.get(`${row.kind}:${id}`)!.revision})
  records++
 }
 put(c.s,'erasure',receiptId,{...map,counts:{records,native:native?1:0}})
 c.extra ??= []
 const portability = await createPortability({db:c.db,policy:{product:'just-every/planning-easel',excludeTables:['e_api_tokens','e_api_limits','e_connection_secrets','e_erasure_key']}})
 c.extra.push(...await portability.redactionStatements(), ...await portability.invalidateTransfersStatements())
 if (!existingKey) c.extra.push(c.db.prepare('INSERT INTO e_erasure_key(id,value) VALUES(1,?)').bind(installationKey))
 if(native) {
  c.extra.push(c.db.prepare("UPDATE oa_operators SET email=?,display_name=?,status='inactive',version=version+1 WHERE id=?").bind(`${pseudonym.replaceAll(' ','-').toLowerCase()}@erased.invalid`,pseudonym,native.id))
  c.extra.push(c.db.prepare('UPDATE oa_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=?').bind(Date.now(),native.id))
  c.extra.push(c.db.prepare('UPDATE oa_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=?').bind(Date.now(),native.id))
  c.extra.push(c.db.prepare('UPDATE oa_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=?').bind(Date.now(),native.id))
  c.extra.push(c.db.prepare('DELETE FROM oa_external_identities WHERE operator_id=?').bind(native.id))
 }
 c.activity.push({action:op,record:receiptId,detail:{receiptId,pseudonym,counts:{records,native:native?1:0},at:c.now}})
 return {receiptId,pseudonym,counts:{records,native:native?1:0},at:c.now}
}

export async function erasureMaps(db: D1Database): Promise<(Data & ErasureMap)[]> {
 const {results}=await db.prepare("SELECT value FROM e_records WHERE kind='erasure'").all<{value:string}>()
 const records = (await db.prepare("SELECT kind,value FROM e_records WHERE kind IN ('payroll-file-mapping','payroll-import','move-personnel-mapping','move-import')").all<{kind:string;value:string}>()).results.map(r=>({...r,value:JSON.parse(r.value)}))
 return payrollOriginalScopes(results.map(row=>JSON.parse(row.value)), await payrollIdentityHistory(db,records), (await db.prepare("SELECT id,destination FROM ik_jobs").all<Data>()).results)
}
export async function erasedView<T>(db:D1Database,value:T):Promise<T> { return transformErased(value,await erasureMaps(db)) }
