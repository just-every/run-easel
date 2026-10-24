import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance } from './access'
import { scopedReader } from './group-projections'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { pantryOrigin, pantryRequest, PANTRY_PURPOSE, PANTRY_SCOPES, type PantryKey } from './pantry-provider'
import { find, put, requireThat, text, type Data } from './types'

export const PANTRY_REVOKE='Revoke this credential in Pantry People & settings → Integration credentials; Easel only deletes its local copy'
export function pantryAuthority(c: Context) {
 requireCapability(c.x,'connections');requireFinance(c.x)
 requireThat(!c.x.actor.token&&!c.x.actor.agent&&!c.x.actor.scheduler&&!scopedReader(c.x),'Use a native finance session with company-wide access for Pantry',403)
}
export async function pantryStatus(c: Context,env: Bindings) {
 pantryAuthority(c)
 const row=find(c.s,'connection','pantry'),stored=await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('pantry').first()
 return {...row,configured:!!env.PANTRY_ORIGIN,connected:!!(stored&&row?.connected&&row.origin===pantryOrigin(env)),scopes:PANTRY_SCOPES,schedule:'Manual',ownerStep:PANTRY_REVOKE,error:row?.connected&&!stored?'Reconnect Pantry after restore; credentials are excluded from archives':null}
}
export async function pantryKey(c: Context,env: Bindings):Promise<PantryKey> {
 pantryAuthority(c)
 const row=find(c.s,'connection','pantry'),stored=await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('pantry').first<{sealed:string}>(),origin=pantryOrigin(env)
 requireThat(row?.connected&&row.origin===origin&&stored,'Connect Pantry before reading its books',409)
 return {origin,token:await openConnection(env.SESSION_SECRET,stored.sealed,PANTRY_PURPOSE,'Pantry')}
}
export async function pantryConnection(c: Context,env: Bindings,op: string,b: Data) {
 pantryAuthority(c);requireThat(['connect','disconnect'].includes(op),'Unknown Pantry connection action',404)
 const prior=find(c.s,'connection','pantry')
 if(op==='disconnect') {
  put(c.s,'connection','pantry',{...prior,connected:false,disconnectedAt:c.now,providerRevocation:{status:'unsupported',at:c.now,ownerStep:PANTRY_REVOKE}})
  c.activity.push({action:'pantry-disconnected',record:'pantry',detail:{localCredentialDeleted:true,providerRevocation:'unsupported',ownerStep:PANTRY_REVOKE}})
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('pantry')]
 }
 requireThat(!prior?.connected,'Disconnect Pantry before replacing its credential',409)
 requireThat(b.consent===true,'Explicitly consent to read Pantry accounts, periods, posted journals and financial reports')
 const origin=pantryOrigin(env),token=text(b.key,'Pantry scoped read credential',2000)
 requireThat(!/\s/.test(token),'Use a scoped Pantry credential without whitespace')
 await pantryRequest({origin,token},'accounts',{limit:'1'})
 const sealed=await sealConnection(env.SESSION_SECRET,token,PANTRY_PURPOSE)
 put(c.s,'connection','pantry',{origin,connected:true,suffix:token.slice(-4),owner:c.x.actor.email,connectedAt:c.now,scopes:PANTRY_SCOPES,schedule:'Manual'})
 c.activity.push({action:'pantry-connected',record:'pantry',detail:{origin,scopes:PANTRY_SCOPES,consent:true,suffix:token.slice(-4)}})
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind('pantry',sealed)]
}
