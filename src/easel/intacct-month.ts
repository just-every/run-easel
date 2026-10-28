import { intacctAuthority } from './intacct-connection'
import type { Context } from './context'
import { all,find,put,requireThat,type Data } from './types'

/** A reviewed continuation depends on every earlier month in this entity. */
export function requireIntacctJournalIdle(c:Context,entity:string,except?:string){
 requireThat(!all(c.s,'batch').some(r=>r.id!==except&&r.intacctSource?.entity===entity&&['importing','undoing'].includes(r.status)),"Finish or undo this entity's active Intacct journal before reviewing or changing another month",409)
}

/** Receipts are published only after the native journal completes. Undo restores the prior receipt. */
export function finishIntacctMonth(c:Context,batch:Data,undone=false){
 const source=batch.intacctSource;if(!source)return
 intacctAuthority(c)
 const current=find(c.s,'intacct-month',source.id)
 if(undone&&current?.batch!==batch.id)return
 put(c.s,'intacct-month',source.id,undone?source.priorReceipt??{...source,status:'undone',batch:batch.id}:{...source,priorReceipt:undefined,status:'accepted',batch:batch.id,acceptedAt:c.now})
 if(!undone){const connection=find(c.s,'connection','intacct');if(connection?.company===source.company)put(c.s,'connection','intacct',{...connection,inventory:source.inventory,lastRefresh:c.now,rowCount:source.ledgerRows,error:null,rateLimit:null})}
}
