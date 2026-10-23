// Manual read boundary. Never accepts a caller-controlled origin or a write verb.
import { cents } from './units'
import { canonicalJson, sha256 } from '../modules/import-kit/src/d1/index'
import { choice, Fault, requireThat, text, type Data } from './types'

export const GUSTO_PURPOSE = 'easel:gusto:employees-payroll:read:v1'
export const GUSTO_SCOPE = 'Read employees, compensation and processed payroll; no payroll execution or changes'
export const GUSTO_VERSION = '2026-06-15'
export type GustoCredentials = { environment: 'demo' | 'production'; companyId: string; accessToken: string }
export class GustoFailure extends Fault {
 constructor(message: string, public httpStatus: number | null = null) { super(502, message) }
}
export function gustoCredentials(b: Data): GustoCredentials {
 const key = { environment: choice(b.environment, ['demo','production'] as const, 'Gusto environment'), companyId: text(b.companyId,'Gusto company ID',100), accessToken: text(b.accessToken,'Gusto company access token',2000) }
 requireThat(/^[a-zA-Z0-9-]+$/.test(key.companyId) && !/\s/.test(key.accessToken), 'Use a company ID and an access token without whitespace')
 return key
}
export function gustoDate(value: unknown, label = 'Gusto date'): string {
 requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value, `${label} must be a real ISO date`)
 return value
}
export const gustoId = (value: unknown, label: string) => {
 requireThat(typeof value === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value), `Gusto returned an invalid ${label}`,502)
 return value
}
export async function gustoRequest(key: GustoCredentials, resource: 'company' | 'employees' | 'payrolls' | 'payroll', query: Record<string,string> = {}, payrollId?: string) {
 const company = encodeURIComponent(key.companyId)
 const suffix = resource === 'company' ? '' : resource === 'payroll' ? `/payrolls/${encodeURIComponent(gustoId(payrollId,'payroll ID'))}` : `/${resource}`
 const url = new URL(`https://${key.environment === 'demo' ? 'api.gusto-demo.com' : 'api.gusto.com'}/v1/companies/${company}${suffix}`)
 for (const [name,value] of Object.entries(query)) url.searchParams.set(name,value)
 let response: Response
 try { response = await fetch(url, { method:'GET', headers:{ Authorization:`Bearer ${key.accessToken}`, 'X-Gusto-API-Version':GUSTO_VERSION, Accept:'application/json' }, redirect:'manual', signal:AbortSignal.timeout(15000) }) }
 catch { throw new GustoFailure('Gusto could not be reached; no observations were accepted') }
 if (response.status !== 200) {
  await response.body?.cancel()
  throw new GustoFailure(`Gusto refused the read (HTTP ${response.status})${response.status === 429 ? '; rate limited, try explicitly later' : '; check the company token and read scopes'}`,response.status)
 }
 let value: any
 try {
  const raw = await response.text()
  requireThat(raw.length <= 4_000_000,'Gusto response is too large',502)
  value = JSON.parse(raw)
 } catch { throw new GustoFailure('Gusto returned an unreadable response; no observations were accepted',200) }
 requireThat(value && typeof value === 'object','Gusto returned an invalid response',502)
 return { value, headers:response.headers }
}

/** Metadata, cardinality and unique IDs must agree on every page. A truncated
 * response never becomes an empty or complete roster. */
export async function gustoPages(key: GustoCredentials, resource: 'employees'|'payrolls'|'payroll', query: Record<string,string>, payrollId?: string, budget?: {remaining:number}) {
 const rows: Data[] = [], seen = new Set<string>()
 let count = -1, pages = -1, metadataSignature: string | undefined
 for (let page = 1; page <= 50; page++) {
  if(budget)requireThat(budget.remaining-- > 0,'Gusto history exceeds the manual read limit; no partial source is accepted',409)
  const {value,headers} = await gustoRequest(key,resource,{...query,page:String(page),per:'100'},payrollId)
  const list = resource === 'payroll' ? value.employee_compensations : value
  const number = (name: string) => { const raw = headers.get(name); requireThat(raw !== null && /^\d+$/.test(raw), 'Gusto pagination metadata is missing; completeness is unproven',502); return Number(raw) }
  const total = number('X-Total-Count'), totalPages = number('X-Total-Pages')
  requireThat(number('X-Page') === page && number('X-Per-Page') === 100 && total <= 5000 && totalPages <= 50 && (totalPages === Math.max(1,Math.ceil(total/100)) || total === 0 && totalPages === 0), 'Gusto returned inconsistent pagination',502)
  requireThat(count < 0 || count === total && pages === totalPages, 'Gusto changed during pagination; preview again',409)
  count = total; pages = totalPages
  requireThat(Array.isArray(list) && list.length === Math.min(100,count-rows.length),'Gusto returned an incomplete page',502)
  for (const item of list) {
   requireThat(item && typeof item === 'object','Gusto returned an invalid row',502)
   const id = gustoId(resource === 'payroll' ? item.employee_uuid : item.uuid ?? item.payroll_uuid, 'source ID')
   requireThat(!seen.has(id),'Gusto returned duplicate source IDs',502); seen.add(id); rows.push(item)
  }
  if (resource === 'payroll') {
   requireThat(value.processed === true && (value.payroll_uuid ?? value.uuid) === payrollId && value.company_uuid === key.companyId,'Gusto returned an unprocessed or foreign payroll',502)
   const signature=JSON.stringify([value.payroll_uuid ?? value.uuid,value.company_uuid,value.processed,value.check_date,value.pay_period?.start_date,value.pay_period?.end_date,value.totals?.gross_pay,value.totals?.employer_taxes,value.totals?.benefits])
   requireThat(metadataSignature===undefined||signature===metadataSignature,'Gusto payroll metadata changed during pagination; preview again',409)
   metadataSignature=signature
  }
  if (page >= pages) return {rows,metadata:resource === 'payroll' ? value : null,complete:true,pages:page,count}
 }
 throw new GustoFailure('Gusto exceeds this manual pull limit; narrow the payroll window')
}
export function gustoAmount(value: unknown) {
 requireThat((typeof value === 'string' || typeof value === 'number') && /^\d+(\.\d{1,2})?$/.test(String(value)),'Gusto returned a missing or inexact monetary amount',502)
 return cents(String(value),'Gusto amount')
}
const sum = (values: number[]) => { const total=values.reduce((a,b)=>a+b,0); requireThat(Number.isSafeInteger(total),'Gusto cost exceeds exact integer precision',502); return total }

/** Only necessary fields leave the provider boundary; SSN, addresses, bank
 * details, birthdates, personal emails and payroll memos are never retained. */
export async function readGusto(key: GustoCredentials, asOf: string, windowStart: string, windowEnd: string, payrollHistoryStart: string) {
 const budget={remaining:180}
 const employees = await gustoPages(key,'employees',{include:'all_compensations'},undefined,budget)
 const hireDates=employees.rows.flatMap(employee=>{
  requireThat(Array.isArray(employee.jobs),'Gusto employee jobs are unavailable',502)
  return employee.jobs.map((job:Data)=>gustoDate(job.hire_date,'Gusto job hire date'))
 }).sort()
 requireThat(!hireDates.length||payrollHistoryStart<=hireDates[0],'Choose a payroll history boundary on or before the earliest provider job hire date',409)
 const roster = employees.rows.map(employee => {
  requireThat(employee.company_uuid === key.companyId,'Gusto returned an employee from another company',502)
  requireThat(Array.isArray(employee.jobs) && employee.jobs.length > 0,'Gusto employee has no readable job; check compensation scope',502)
  const jobs = employee.jobs.filter((job:Data)=>job.primary === true)
  const job = jobs.length === 1 ? jobs[0] : employee.jobs.length === 1 ? employee.jobs[0] : null
  requireThat(job,'Gusto employee needs one primary job for planned-position comparison',409)
  const start = gustoDate(job.hire_date,'Gusto hire date')
  requireThat(Array.isArray(job.compensations) && job.compensations.length > 0,'Gusto compensation history is unavailable; check compensations:read scope',502)
  const compensation = job.compensations.filter((r:Data)=>gustoDate(r.effective_date,'Gusto compensation effective date') <= asOf).sort((a:Data,b:Data)=>b.effective_date.localeCompare(a.effective_date))[0]
  requireThat(compensation,'Gusto has no compensation effective on the observation date',409)
  requireThat(job.compensations.filter((r:Data)=>r.effective_date===compensation.effective_date).length===1,'Gusto has ambiguous compensation on the observation date',409)
  const rate = gustoAmount(compensation.rate), unit = compensation.payment_unit
  requireThat(['Year','Month','Week','Hour'].includes(unit),'Gusto compensation needs Year, Month, Week or Hour payment units; no pay-period annualization is guessed',409)
  const salaryCents = unit === 'Hour' ? null : rate * (unit === 'Month' ? 12 : unit === 'Week' ? 52 : 1)
  requireThat(salaryCents === null || Number.isSafeInteger(salaryCents),'Gusto salary exceeds exact precision',502)
  requireThat(Array.isArray(employee.terminations),'Gusto termination history is unavailable',502)
  const terminations = employee.terminations.map((r:Data)=>gustoDate(r.effective_date,'Gusto termination date')).filter((date:string)=>date >= start).sort()
  requireThat(!employee.terminated || terminations.length > 0,'Gusto reports a departure without its effective date',502)
  return {employeeId:gustoId(employee.uuid,'employee ID'),name:`${text(employee.first_name,'Gusto first name')} ${text(employee.last_name,'Gusto last name')}`,title:text(job.title,'Gusto job title'),employmentType:'W-2',sourceDepartment:employee.department ?? '',start,termination:terminations.at(-1) ?? '',salaryCents,hourlyRateCents:unit === 'Hour' ? rate : null,sourceVersion:employee.version ?? null}
 })
 // Gusto's default omits older history and check-date filtering is documented
 // only for regular payroll. Scan the reviewed period boundary in contiguous
 // explicit slices, then select exact check dates locally for every type.
 const payrolls=new Map<string,Data>()
 let payrollPages=0,historySlices=0,payrollDetailPages=0,overlappingPayrollIds=0
 for(let cursor=payrollHistoryStart;cursor<=asOf;){
  requireThat(++historySlices<=20,'Gusto history exceeds 20 annual slices; no partial source is accepted',409)
  const end=new Date(Math.min(Date.parse(asOf),Date.parse(cursor)+364*86400000)).toISOString().slice(0,10)
  const page=await gustoPages(key,'payrolls',{processing_statuses:'processed',payroll_types:'regular,off_cycle,external',start_date:cursor,end_date:end},undefined,budget)
  payrollPages+=page.pages
  for(const payroll of page.rows){
   const id=gustoId(payroll.payroll_uuid??payroll.uuid,'payroll ID'),prior=payrolls.get(id)
   requireThat(!prior||canonicalJson(prior)===canonicalJson(payroll),'Gusto payroll changed across history slices; preview again',409)
   if(prior)overlappingPayrollIds++;else payrolls.set(id,payroll)
   requireThat(payrolls.size<=5000,'Gusto history exceeds 5000 payrolls; no partial source is accepted',409)
  }
  cursor=new Date(Date.parse(end)+86400000).toISOString().slice(0,10)
 }
 const runs: Data[] = [], payrollIds: string[] = []
 for (const payroll of payrolls.values()) {
  const payrollId = gustoId(payroll.payroll_uuid ?? payroll.uuid,'payroll ID')
  requireThat(payroll.processed === true && payroll.company_uuid === key.companyId,'Gusto returned an unprocessed or foreign payroll',502)
  const detail = await gustoPages(key,'payroll',{include:'taxes,benefits'},payrollId,budget)
  payrollDetailPages+=detail.pages
  const payDate = gustoDate(detail.metadata.check_date,'Gusto check date')
  requireThat(payroll.check_date===payDate,'Gusto payroll check date changed during the pull; preview again',409)
  if(payDate<windowStart||payDate>windowEnd)continue
  const providerPeriodStart=gustoDate(detail.metadata.pay_period?.start_date,'Gusto pay-period start'),providerPeriodEnd=gustoDate(detail.metadata.pay_period?.end_date,'Gusto pay-period end')
  requireThat(providerPeriodStart<=providerPeriodEnd,'Gusto returned a reversed payroll period',502)
  const added = detail.rows.filter(row=>row.excluded !== true).map(row => {
   requireThat(row.excluded === false && Array.isArray(row.taxes) && Array.isArray(row.benefits),'Gusto payroll cost is incomplete; check payroll and benefits read scopes',502)
   requireThat(row.taxes.every((tax:Data)=>typeof tax.employer === 'boolean'),'Gusto tax attribution is missing',502)
   const grossWagesCents = gustoAmount(row.gross_pay), employerTaxesCents = sum(row.taxes.filter((tax:Data)=>tax.employer).map((tax:Data)=>gustoAmount(tax.amount)))
   const benefitsCents = sum(row.benefits.map((benefit:Data)=>gustoAmount(benefit.company_contribution)))
   return {employeeId:gustoId(row.employee_uuid,'employee ID'),providerPayrollId:payrollId,providerPeriodStart,providerPeriodEnd,payDate,grossWagesCents,employerTaxesCents,benefitsCents,feesCents:0,totalCents:sum([grossWagesCents,employerTaxesCents,benefitsCents]),costBasis:'Gross wages + employer taxes + employer benefits; provider fees excluded'}
  })
  // Missing/PHI-hidden benefits and unallocated company taxes must not silently
  // understate departmental cost. Compare complete employee pages to totals.
  for (const [field,total] of [['grossWagesCents','gross_pay'],['employerTaxesCents','employer_taxes'],['benefitsCents','benefits']]) requireThat(sum(added.map(row=>(row as Data)[field])) === gustoAmount(detail.metadata.totals?.[total]),'Gusto payroll totals do not reconcile to readable employee cost; no department allocation is guessed',409)
  runs.push(...added); payrollIds.push(payrollId)
  requireThat(runs.length<=5000,'Gusto pull exceeds 5000 pay observations; no partial source is accepted',409)
 }
 requireThat(roster.length <= 5000 && runs.length <= 5000,'Gusto pull exceeds 5000 observations; narrow the payroll window',409)
 return {roster,runs,asOf,windowStart,windowEnd,payrollHistoryStart,complete:true,employeeCount:roster.length,payrollCount:payrollIds.length,payrollIds,employeePages:employees.pages,payrollPages,payrollDetailPages,historySlices,scannedPayrollCount:payrolls.size,overlappingPayrollIds,payrollScanFingerprint:sha256(canonicalJson([...payrolls.values()].sort((a,b)=>String(a.payroll_uuid??a.uuid).localeCompare(String(b.payroll_uuid??b.uuid)))))}
}
