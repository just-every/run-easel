import { requireThat } from './types'
export type NetSuiteCredentials = { realm:string; consumerKey:string; consumerSecret:string; tokenId:string; tokenSecret:string; role:string }
export const NETSUITE_PURPOSE='easel-netsuite-tba-v1'
export const NETSUITE_READS='SuiteQL SELECT: chart, subsidiaries, books, periods, departments, classes, locations, posted accounting lines and trial aggregates'
export function netsuiteHost(realm:string,service:'suitetalk'|'restlets'='suitetalk') {
 requireThat(/^[A-Za-z0-9]+(?:_(?:SB|RP)\d+)?$/i.test(realm),'Use a NetSuite account ID, including its sandbox suffix')
 return realm.toLowerCase().replaceAll('_','-')+'.'+service+'.api.netsuite.com'
}
const encode=(s:string)=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())
/** RFC 5849 parameter normalization; the JSON SuiteQL body is not an OAuth form. */
export async function netsuiteAuthorization(key:NetSuiteCredentials,method:string,url:URL) {
 requireThat(url.protocol==='https:'&&[netsuiteHost(key.realm),netsuiteHost(key.realm,'restlets')].includes(url.hostname)&&!url.username&&!url.password,'Invalid NetSuite destination')
 const oauth:Record<string,string>={oauth_consumer_key:key.consumerKey,oauth_token:key.tokenId,oauth_nonce:crypto.randomUUID().replaceAll('-',''),oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_signature_method:'HMAC-SHA256',oauth_version:'1.0'}
 const parameters=[...url.searchParams,...Object.entries(oauth)].map(([k,v])=>[encode(k),encode(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0).map(([k,v])=>k+'='+v).join('&')
 const base=method.toUpperCase()+'&'+encode(url.origin+url.pathname)+'&'+encode(parameters)
 const secret=await crypto.subtle.importKey('raw',new TextEncoder().encode(encode(key.consumerSecret)+'&'+encode(key.tokenSecret)),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',secret,new TextEncoder().encode(base)))
 oauth.oauth_signature=btoa(String.fromCharCode(...signature))
 return 'OAuth '+Object.entries({realm:key.realm,...oauth}).map(([k,v])=>encode(k)+'="'+encode(v)+'"').join(', ')
}
export async function netsuiteRevoke(key:NetSuiteCredentials) {
 const url=new URL('/rest/revoketoken','https://'+netsuiteHost(key.realm,'restlets'));url.searchParams.set('consumerKey',key.consumerKey);url.searchParams.set('token',key.tokenId)
 try {
  const response=await fetch(url,{method:'GET',headers:{Authorization:await netsuiteAuthorization(key,'GET',url)},redirect:'manual',signal:AbortSignal.timeout(15000)})
  await response.body?.cancel()
  return {status:response.status>=200&&response.status<300?'confirmed':'refused',httpStatus:response.status}
 } catch { return {status:'unreachable',httpStatus:null} }
}
