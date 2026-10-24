import assert from 'node:assert/strict'
export const pantryGrant={key:'synthetic-easel-1',consent:true}
export function pantryProvider() {
 const state={amount:10000,revision:'synthetic-easel-revision-1',status:200,changed:false,badCursor:false,pageSize:100,reversed:false,reads:[],extraAccounts:[],extraEntries:[],entries:null,periods:null}
 const accounts=[{id:'synthetic-easel-2',code:'1000',name:'Cash',type:'asset'},{id:'synthetic-easel-3',code:'4000',name:'Services',type:'income'}]
 const entries=()=>[{id:'synthetic-easel-4',entry_date:'2026-01-15',status:'posted',revision:state.revision,lines:[{id:'synthetic-easel-5',account_id:accounts[0].id,debit_cents:state.amount,credit_cents:0,class_name:'Operations',location_name:'East',project_name:''},{id:'synthetic-easel-6',account_id:accounts[1].id,debit_cents:0,credit_cents:state.amount,class_name:'Operations',location_name:'East',project_name:''}]}]
 state.outbound=async request=>{
  const u=new URL(request.url),path=u.pathname.replace('/api/pantry/integration/v1/','')
  assert.equal(u.origin,'https://pantry.example.test');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),`Bearer ${pantryGrant.key}`);state.reads.push(path)
  if(state.status!==200)return Response.json({secret:pantryGrant.key},{status:state.status,...(state.status===302?{headers:{location:'https://unrelated.example/'}}:{})})
  const page=(rows,envelope='records')=>{const limit=Number(u.searchParams.get('limit')??100),cursor=u.searchParams.get('cursor')??'',selected=rows.filter(r=>r.id>cursor).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,Math.min(limit,state.pageSize));return Response.json({[envelope]:selected,nextCursor:state.badCursor?cursor||'synthetic-easel-999':rows.filter(r=>r.id>cursor).length>selected.length?selected.at(-1).id:null})}
  if(path==='business')return page([{id:'1',currency:'USD'}])
  if(path==='accounts')return page([...accounts,...state.extraAccounts])
  if(path==='periods')return page(state.periods??[{id:'2026-01',start_date:'2026-01-01',end_date:'2026-01-31',status:'locked'}])
  const allEntries=state.entries??[...entries(),...state.extraEntries],chart=[...accounts,...state.extraAccounts]
  if(path==='journals')return page(allEntries,'entries')
  if(path===['reports','general-ledger'].join('/'))return Response.json({basis:'accrual',from:u.searchParams.get('from'),to:u.searchParams.get('to'),accounts:chart.map(a=>({...a,rows:allEntries.filter(e=>e.entry_date>=u.searchParams.get('from')&&e.entry_date<=u.searchParams.get('to')).flatMap(e=>e.lines.filter(l=>l.account_id===a.id).map(l=>({...l,entry_id:e.id,entry_date:e.entry_date})))}))})
  if(path===['reports','trial-balance'].join('/')){
   const balances=new Map()
   for(const e of allEntries.filter(e=>e.entry_date<=u.searchParams.get('to')))for(const l of e.lines)balances.set(l.account_id,(balances.get(l.account_id)??0)+l.debit_cents-l.credit_cents)
   if(state.changed&&balances.size){balances.set(accounts[0].id,balances.get(accounts[0].id)+1);balances.set(accounts[1].id,balances.get(accounts[1].id)-1)}
   const rows=[...balances].map(([id,net])=>({id,net})),debit=rows.reduce((n,r)=>n+Math.max(r.net,0),0),credit=rows.reduce((n,r)=>n+Math.max(-r.net,0),0)
   return Response.json({basis:'accrual',asOf:u.searchParams.get('to'),balanced:true,debit,credit,rows})
  }
  const invoice=(id,overrides={})=>({id,kind:'invoice',customer_id:'synthetic-easel-7',status:'issued',issue_date:'2026-01-01',due_date:'2026-01-10',total_cents:10000,open_cents:0,...overrides})
  if(path==='invoices')return page([invoice('synthetic-easel-8'),invoice('synthetic-easel-9',{issue_date:'2026-02-01',due_date:'2026-02-10',open_cents:5000})],'invoices')
  if(path==='bills')return page([{id:'synthetic-easel-10',status:'posted',bill_date:'2026-02-01',due_date:'2026-02-15',total_cents:3000,open_cents:2000}],'bills')
  if(path==='payments')return page([{id:'synthetic-easel-11',direction:'received',payment_date:'2026-01-22',reversal_id:state.reversed?'synthetic-easel-12':null,allocations:[{target_kind:'invoice',target_id:'synthetic-easel-8',amount_cents:10000}]}],'payments')
  assert.fail(`Unexpected Pantry read ${path}`)
 }
 return state
}
