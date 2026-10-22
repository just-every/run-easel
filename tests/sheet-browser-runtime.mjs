// The emitted production Worker and assets, real D1/auth, and Google-only network edge.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_splitSqlQuery } from 'wrangler'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { freePort } from './browser-runtime.mjs'
import assert from 'node:assert/strict'

export async function sheetBrowserRuntime() {
 const directory=await mkdtemp(join(tmpdir(),'easel-sheet-browser-')), port=await freePort(), origin=`http://127.0.0.1:${port}`
 const configPath=resolve('dist/server/wrangler.json'), workerDir=dirname(configPath), config=JSON.parse(await readFile(configPath,'utf8')), entry=resolve(workerDir,config.main)
 const scripts=[]
 async function enumerate(path){for(const file of await readdir(path,{withFileTypes:true})){const full=join(path,file.name);if(file.isDirectory())await enumerate(full);else if(/\.m?js$/.test(file.name))scripts.push(full)}}
 await enumerate(workerDir)
 const provider={values:[100,200],columns:3,missing:false,revokeStatus:503}
 const credentials={clientId:'synthetic-easel-1',clientSecret:'synthetic-easel-2',refreshToken:'synthetic-easel-3'}
 const mf=new Miniflare({...convertV4MiniflareOptions({
  host:'127.0.0.1',port,inspectorPort:0,modules:[entry,...scripts.filter(p=>p!==entry)].map(path=>({type:'ESModule',path})),modulesRoot:workerDir,
  compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,d1Databases:{DB:'easel-sheet-browser'},
  bindings:{AUTH_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:'owner@example.test',SESSION_SECRET:'synthetic-easel-session-secret-01234567890123456789',SETUP_TOKEN:'synthetic-easel-bootstrap-token-01234567890123456789',MAIL_PROVIDER:'development',MAIL_FROM:'Easel <easel@example.test>'},
  assets:{directory:resolve(workerDir,config.assets.directory),binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true},assetConfig:{html_handling:config.assets.html_handling,not_found_handling:config.assets.not_found_handling}},
  outboundService:async request=>{
   const url=new URL(request.url)
   assert.equal(url.protocol,'https:')
   if(url.hostname==='oauth2.googleapis.com'){
    assert.equal(request.method,'POST')
    if(url.pathname==='/revoke'){assert.equal((await request.formData()).get('token'),credentials.refreshToken);return new Response(null,{status:provider.revokeStatus})}
    assert.equal(url.pathname,'/token');const form=await request.formData();assert.equal(form.get('refresh_token'),credentials.refreshToken)
    return Response.json({access_token:'synthetic-easel-4',token_type:'Bearer',expires_in:3600,scope:'https://www.googleapis.com/auth/spreadsheets.readonly'})
   }
   assert.equal(url.hostname,'sheets.googleapis.com');assert.equal(url.pathname,'/v4/spreadsheets/synthetic-easel-5');assert.equal(url.searchParams.get('ranges'),"'Capacity'!B2:C2")
   assert.equal(request.headers.get('authorization'),'Bearer synthetic-easel-4')
   if(provider.missing)return Response.json({error:'Synthetic missing sheet'},{status:404})
   return Response.json({spreadsheetId:'synthetic-easel-5',sheets:[{properties:{sheetId:0,title:'Capacity',sheetType:'GRID',gridProperties:{rowCount:10,columnCount:provider.columns}},data:[{startRow:1,startColumn:1,rowData:[{values:provider.values.map(numberValue=>({effectiveValue:{numberValue}}))}]}]}]})
  },
 }),resourcePersistencePath:directory})
 try{
  await mf.ready
  const db=await mf.getD1Database('DB')
  for(const file of(await readdir('migrations/core')).filter(f=>f.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile(`migrations/core/${file}`,'utf8')).map(sql=>db.prepare(sql)))
  return {mf,origin,provider,credentials,bootstrap:'synthetic-easel-bootstrap-token-01234567890123456789',async close(){await mf.dispose();await rm(directory,{recursive:true,force:true})}}
 }catch(error){await mf.dispose();await rm(directory,{recursive:true,force:true});throw error}
}
