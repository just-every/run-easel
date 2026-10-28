import { dimensionAllowed } from './access'
import { entityReceipts,ledgerWhere } from './ledger-scope'
import { intacctEntryUrl } from './intacct-links'
import { resolveDimensions } from './dimension-mapping'
import { xeroTransactionUrl } from './xero-links'
import { qboTransactionUrl } from './qbo-links'
import { balanceActuals } from './balance-actuals'
import { balanceTarget } from './balance-targets'
// Accepted-row projections share the same reusable mapping resolver as preview.
import { resolveAccount } from './account-rules'
import type { ActualCell } from './engine'
import { lines, workspace } from './model'
import { monthLabel } from './months'
import { all, find, get, requireThat, type Data, type State, type Access } from './types'

async function grouped(db: D1Database, entity?:string) {
 const scope=ledgerWhere(entity)
 const { results } = await db.prepare(`SELECT period, account, department, COALESCE(json_extract(value,'$.accountType'),'') AS accountType, COALESCE(json_extract(value,'$.sourceDimensions'),'{}') AS sourceDimensions, SUM(amount) AS amount, SUM(MAX(amount,0)) AS debits, SUM(MAX(-amount,0)) AS credits, COUNT(*) AS rows, GROUP_CONCAT(DISTINCT destination) AS batches FROM e_actuals WHERE ${scope.sql} GROUP BY period, account, department, COALESCE(json_extract(value,'$.accountType'),''), COALESCE(json_extract(value,'$.sourceDimensions'),'{}')`).bind(...scope.params).all<any>()
 return results.map(r => ({ ...r, amount: Number(r.amount), rows: Number(r.rows), batches: String(r.batches).split(',') }))
}
const resolved = (s: State, g: Data) => {
 const mapping = resolveAccount(s, g.account, g.accountType)
 const department = find(s, 'department-map', g.department)
 return { ...mapping, department: department?.department ?? '', blocked: !mapping.target || !department || (!!department.department && !find(s, 'department', department.department)) }
}

/** Only consumed periods must be complete; a later unresolved month does not
 * prevent an earlier review. Counts detect missing net-zero account groups. */
export async function actualCells(db: D1Database, s: State, through?: string, entity?:string): Promise<ActualCell[]> {
 const lineType = new Map(lines(s).map(l => [l.id, l.type]))
 const cells = new Map<string, ActualCell>()
 for (const g of await grouped(db,entity)) {
  const r = resolved(s, g)
  if (through && g.period >= workspace(s).planStart && g.period <= through) requireThat(!r.blocked, `Actuals reconciliation blocked for ${g.period}; map account ${g.account} and department ${g.department}`, 409)
  if (r.blocked || !r.target || !lineType.has(r.target)) continue
  const k = `${r.target}|${r.department}|${g.period}`
  const cell: ActualCell = cells.get(k) ?? { dimensionSources: [], line: r.target, department: r.department, month: g.period, amount: 0, rows: 0, batches: [] }
  const amount = lineType.get(r.target) === 'revenue' ? -g.amount : g.amount
  cell.amount += amount
  const owner=entity?get(s,'entity',entity):undefined
  const dimensions = {...resolveDimensions(s, JSON.parse(g.sourceDimensions)).dimensions,...(owner?{[owner.dimension]:owner.member}:{})}
  cell.dimensionSources ??= []
  cell.dimensionSources.push({ dimensions, amount, rows: g.rows, batches: g.batches })
  cell.rows += g.rows; cell.batches = [...new Set([...cell.batches, ...g.batches])]
  cells.set(k, cell)
 }
 for(const receipt of entityReceipts(s,entity).filter(r=>r.ledgerRows===0)){const owner=get(s,'entity',entity!);for(const line of lines(s))for(const department of all(s,'department')){const key=`${line.id}|${department.id}|${receipt.month}`;if(!cells.has(key))cells.set(key,{line:line.id,department:department.id,month:receipt.month,amount:0,rows:0,batches:[],dimensions:{[owner.dimension]:owner.member}})}}
 return [...cells.values()]
}

export async function reconciliation(db: D1Database, s: State, entity?:string) {
 const lineType = new Map(lines(s).map(l => [l.id, l.type]))
 const months = new Map<string, Data>(), unmapped = new Map<string, Data>()
 const groups = await grouped(db,entity)
 for (const g of groups) {
  const m = months.get(g.period) ?? { period: g.period, label: monthLabel(g.period), rows: 0, imported: 0, mapped: 0, excluded: 0, cash: 0, unmapped: 0, balanceSheet: 0, revenue: 0, costs: 0, blocked: false, unmappedAccounts: [] as string[], unmappedDepartments: [] as string[] }
  m.rows += g.rows; m.imported += g.amount
  const r = resolved(s, g), target = r.target
  if (r.blocked) {
   m.blocked = true; m.unmapped += g.amount
   if (!target && !m.unmappedAccounts.includes(g.account)) m.unmappedAccounts.push(g.account)
   if (!find(s, 'department-map', g.department) && !m.unmappedDepartments.includes(g.department)) m.unmappedDepartments.push(g.department)
   const key = `${g.period}|${g.account}`
   const u = unmapped.get(key) ?? { period: g.period, account: g.account, rows: 0, amount: 0, reason: r.mappingStatus === 'ambiguous' ? 'Conflicting account rules' : !target ? 'No account mapping' : 'No department mapping' }
   u.rows += g.rows; u.amount += g.amount; unmapped.set(key, u)
  } else if (target === 'excluded') m.excluded += g.amount
  else if (target === 'cash') m.cash += g.amount
  else if (target && balanceTarget(target)) m.balanceSheet += g.amount
  else if (target && lineType.has(target)) { m.mapped += g.amount; if (lineType.get(target) === 'revenue') m.revenue -= g.amount; else m.costs += g.amount }
  months.set(g.period, m)
 }
 for(const receipt of entityReceipts(s,entity))if(!months.has(receipt.month))months.set(receipt.month,{period:receipt.month,label:monthLabel(receipt.month),rows:0,imported:0,mapped:0,excluded:0,cash:0,unmapped:0,balanceSheet:0,revenue:0,costs:0,blocked:false,unmappedAccounts:[],unmappedDepartments:[],receipt:receipt.id})
 const list: Data[] = [...months.values()].sort((a, b) => a.period.localeCompare(b.period)).map(m => ({ ...m, revenue: m.blocked ? null : m.revenue, costs: m.blocked ? null : m.costs, balanced: m.mapped + m.excluded + m.cash + m.balanceSheet + m.unmapped === m.imported }))
 return { months: list, unmapped: [...unmapped.values()], trialBalances: balanceActuals(groups.map(g => ({ ...g, ...resolved(s, g), department: g.department })), list.map(m => m.period)) }
}

export async function cashBalance(db: D1Database, s: State, before: string, entity?:string) {
 let cents = 0, rows = 0
 const batches = new Set<string>()
 for (const g of await grouped(db,entity)) {
  if (g.period >= before) continue
  const r = resolved(s, g)
  requireThat(!r.blocked, `Opening cash reconciliation blocked for ${g.period}; map account ${g.account} and department ${g.department}`, 409)
  if (r.target !== 'cash') continue
  cents += g.amount; rows += g.rows; for (const b of g.batches) batches.add(b)
 }
 return { cents, rows, batches: [...batches] }
}

export async function rowsFor(db: D1Database, s: State, month: string, line: string, department: string, entity?:string,x?:Access) {
 const scope=ledgerWhere(entity)
 const { results } = await db.prepare(`SELECT id, value, amount FROM e_actuals WHERE period=? AND ${scope.sql} ORDER BY ABS(amount) DESC, id`).bind(month,...scope.params).all<any>()
 const type = lines(s).find(l => l.id === line)?.type
 return results.flatMap(r => {
  const v = JSON.parse(r.value), mapping = resolved(s, { ...v, accountType: v.accountType ?? '' })
  if (mapping.blocked || mapping.target !== line || mapping.department !== department) return []
  const owner=entity?get(s,'entity',entity):undefined
  const dimensions={...resolveDimensions(s,v.sourceDimensions).dimensions,...(owner?{[owner.dimension]:owner.member}:{})}
  if(x&&!dimensionAllowed(s,x,dimensions,false,department))return []
  let providerUrl: string | undefined
  if (v.pantryOrigin && /^[A-Za-z0-9_-]{1,120}$/.test(v.pantryEntry)) {
   try { const origin = new URL(v.pantryOrigin); if (!origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash && (origin.protocol === 'https:' || origin.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))) providerUrl = new URL('/app/search?' + new URLSearchParams({type:'journal',record:v.pantryEntry}), origin).href } catch {}
  }
  if(v.intacctCompany)providerUrl=intacctEntryUrl(v.intacctEntryUrl)
  if(v.xeroRealm)providerUrl=xeroTransactionUrl(v.xeroEnvironment,v.xeroTransactionType,v.xeroTransactionId)??undefined
  if (v.qboRealm && /^[A-Za-z0-9_-]{1,120}$/.test(v.qboTransactionId)) {
   providerUrl=qboTransactionUrl(v.qboEnvironment,v.qboTransactionType,v.qboTransactionId)??undefined
  }
  return [{ providerUrl, dimensions, id: r.id, file: v.file, line: v.line, date: v.date, account: v.account, description: v.description, reference: v.reference, amount: type === 'revenue' ? -Number(r.amount) : Number(r.amount) }]
 })
}
