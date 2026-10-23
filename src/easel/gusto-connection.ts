import type { Bindings } from '../auth.server'
import { requireCapability, requireFinance, requirePayDetail } from './access'
import type { Context } from './context'
import { openConnection, sealConnection } from './connection-seal'
import { scopedReader } from './group-projections'
import { gustoCredentials, gustoRequest, GUSTO_PURPOSE, GUSTO_SCOPE, type GustoCredentials } from './gusto-provider'
import { canSeeScenario } from './scenario-access'
import { all, Fault, find, put, requireThat, type Data } from './types'

export function gustoAuthority(c: Context) {
 requireCapability(c.x,'connections'); requireFinance(c.x); requirePayDetail(c.x)
 requireThat(!c.x.actor.token && !c.x.actor.agent && !c.x.actor.scheduler && !scopedReader(c.x),'Use a native finance session with company-wide pay access for Gusto',403)
}
export async function gustoStatus(c: Context) {
 gustoAuthority(c)
 const row = find(c.s,'connection','gusto'), stored = await c.db.prepare('SELECT id FROM e_connection_secrets WHERE id=?').bind('gusto').first()
 return {...row,connected:Boolean(stored && row?.connected),scope:GUSTO_SCOPE,schedule:'Manual',error:row?.connected && !stored ? 'Reconnect Gusto after restore; credentials are excluded from archives' : row?.error ?? null,
  imports:all(c.s,'payroll-import').filter(i=>i.source === 'gusto' && canSeeScenario(c.x,find(c.s,'scenario',i.scenario)!)).map(i=>({id:i.id,scenario:i.scenario,asOf:i.asOf,status:i.status,rows:i.rows,createdAt:i.createdAt}))}
}
export async function gustoStoredCredentials(c: Context, env: Bindings): Promise<GustoCredentials> {
 gustoAuthority(c)
 const stored=await c.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind('gusto').first<{sealed:string}>()
 requireThat(find(c.s,'connection','gusto')?.connected && stored,'Connect Gusto in Settings before pulling observations',409)
 try { return gustoCredentials(JSON.parse(await openConnection(env.SESSION_SECRET,stored.sealed,GUSTO_PURPOSE,'Gusto'))) }
 catch { throw new Fault(409,'Gusto credentials could not be opened; reconnect in Connections') }
}
export async function gustoConnection(c: Context,env: Bindings,op: string,b: Data): Promise<D1PreparedStatement[]> {
 gustoAuthority(c)
 requireThat(['connect','disconnect'].includes(op),'Unknown Gusto connection action',404)
 const prior=find(c.s,'connection','gusto')
 if(op === 'disconnect') {
  put(c.s,'connection','gusto',{...prior,connected:false,disconnectedAt:c.now,error:null})
  c.activity.push({action:'gusto-disconnected',record:'gusto',detail:{localCredentialDeleted:true}})
  return [c.db.prepare('DELETE FROM e_connection_secrets WHERE id=?').bind('gusto')]
 }
 requireThat(!prior?.connected,'Disconnect the current Gusto company before connecting another one',409)
 requireThat(b.consent === true,'Explicitly approve read-only employee, compensation and payroll access')
 const key=gustoCredentials(b), company=(await gustoRequest(key,'company')).value
 requireThat(company.uuid === key.companyId,'Gusto company does not match the supplied company ID',409)
 const sealed=await sealConnection(env.SESSION_SECRET,JSON.stringify(key),GUSTO_PURPOSE)
 put(c.s,'connection','gusto',{connected:true,environment:key.environment,companyId:key.companyId,owner:c.x.actor.email,connectedAt:c.now,scope:GUSTO_SCOPE,schedule:'Manual',lastRefresh:null,rowCount:0,error:null})
 c.activity.push({action:'gusto-connected',record:'gusto',detail:{environment:key.environment,companyId:key.companyId,consent:true,scope:GUSTO_SCOPE}})
 return [c.db.prepare('INSERT INTO e_connection_secrets(id,sealed) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed').bind('gusto',sealed)]
}
