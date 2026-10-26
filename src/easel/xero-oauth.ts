import { Fault, requireThat, type Data } from './types'
export const XERO_PURPOSE='easel:xero:accounting:oauth:v1'
export const XERO_SCOPE='offline_access accounting.settings.read accounting.contacts.read accounting.journals.read accounting.reports.read'
export const XERO_READS='Read accounts, tracking categories, contacts, journals and trial balance; no accounting writes'
export async function xeroExchange(clientId:string,clientSecret:string,form:Record<string,string>){
 let response:Response
 try{response=await fetch('https://identity.xero.com/connect/token',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Basic ${btoa(`${clientId}:${clientSecret}`)}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)})}
 catch{throw new Fault(502,'Xero token exchange could not be confirmed; reconnect explicitly without automatic retry')}
 if(!response.ok){await response.body?.cancel();throw new Fault(502,`Xero refused token exchange (HTTP ${response.status})`)}
 let v:Data
 try{v=await response.json()}catch{throw new Fault(502,'Xero returned unreadable tokens')}
 requireThat(typeof v.access_token==='string'&&typeof v.refresh_token==='string'&&Number.isSafeInteger(v.expires_in)&&v.expires_in>0&&v.token_type?.toLowerCase()==='bearer','Xero returned incomplete tokens',502)
 requireThat(typeof v.scope==='string'&&XERO_SCOPE.split(' ').every(scope=>v.scope.split(' ').includes(scope))&&!v.scope.split(' ').some((s:string)=>s.startsWith('accounting.')&&!s.endsWith('.read')),'Xero grant must contain the requested read-only accounting scopes',403)
 return{accessToken:v.access_token,refreshToken:v.refresh_token,expiresAt:Date.now()+v.expires_in*1000}
}
export async function xeroTenants(key:{accessToken:string}):Promise<Data[]>{
 const r=await fetch('https://api.xero.com/connections',{headers:{Authorization:`Bearer ${key.accessToken}`},redirect:'manual',signal:AbortSignal.timeout(15000)})
 requireThat(r.status===200,'Xero organisation authorization could not be checked',502)
 const v:unknown=await r.json();requireThat(Array.isArray(v)&&v.length<=100&&v.every(t=>typeof t.tenantId==='string'),'Xero returned invalid organisation bindings',502)
 return v as Data[]
}
export async function xeroRevoke(key:{clientId:string;clientSecret:string;refreshToken:string}){
 try{
  const r=await fetch('https://identity.xero.com/connect/revocation',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Authorization:`Basic ${btoa(`${key.clientId}:${key.clientSecret}`)}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:key.refreshToken,token_type_hint:'refresh_token'})})
  await r.body?.cancel();return{status:r.status===200?'confirmed':'refused',httpStatus:r.status}
 }catch{return{status:'unreachable',httpStatus:null}}
}
