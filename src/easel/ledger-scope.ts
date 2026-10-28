import { boundEntity } from './entity-scope'
import { find,get,type Data,type State } from './types'
/** Empty scope is the original installation ledger. Entity rows never enter it. */
export const ledgerScope=(s:State,scenario?:string|Data):string=>scenario?boundEntity(s,typeof scenario==='string'?get(s,'scenario',scenario):scenario)?.id??'':''
export const ledgerPredicate="COALESCE(json_extract(value,'$.entity'),'')=?"
export function ledgerDimensions(s:State,scope:string,dimensions:Record<string,string>){const e=scope?find(s,'entity',scope):undefined;return e?{...dimensions,[e.dimension]:e.member}:dimensions}
