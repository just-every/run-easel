/** Retain the provider's exact entry destination; never synthesize a login URL. */
export function intacctEntryUrl(value: unknown): string | undefined {
 if(typeof value!=='string'||value.length>2000||/[\u0000-\u0020\\]/.test(value))return
 try{
  const u=new URL(value)
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!(/^(?:www|www\d+|us\d+|eu\d+|au\d+)\.intacct\.com$/.test(u.hostname)))return
  if(/(?:session|password|passwd|token|secret|credential|auth|login|sender|userid|companyid)/i.test(decodeURIComponent(u.pathname+u.search)))return
  if(!u.pathname.startsWith('/ia/acct/'))return
  return value
 }catch{return}
}
