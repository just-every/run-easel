import { cents, decimal } from './units'
import { contractDate } from './contract-revenue'
import { ownerDestination } from './egress'
import { Fault, requireThat, text, type Data } from './types'

export type PipelineProvider = 'hubspot' | 'salesforce' | 'orbit'
export type PipelineKey = Data & { provider: PipelineProvider; origin: string; currency: string; accessToken?: string; refreshToken?: string; clientId?: string; clientSecret?: string; termField?: string }
export type PipelineSource = { stages: Data[]; deals: Data[]; periods: Data[]; currency: string }
export const pipelineProvider = (v: unknown): PipelineProvider => { requireThat(['hubspot','salesforce','orbit'].includes(String(v)), 'Choose HubSpot, Salesforce or Orbit'); return v as PipelineProvider }
export class PipelineFailure extends Fault {
 constructor(message: string, public httpStatus: number | null = null, public rateLimit: string | null = null) { super(502, message) }
}
const valid = (condition: unknown, message: string) => { if (!condition) throw new PipelineFailure(message) }
const id = (v: unknown) => { valid(typeof v === 'string' && v.length > 0 && v.length <= 200, 'CRM returned an invalid identifier'); return v as string }
const date = (v: unknown) => { try { return contractDate(String(v).slice(0,10)) } catch { throw new PipelineFailure('CRM returned an invalid close date') } }
const money = (v: unknown) => { try { return cents(String(v), 'CRM amount') } catch { throw new PipelineFailure('CRM returned an inexact or negative amount') } }
const probability = (v: unknown, fractional = false) => {
 try { const n = decimal(String(v), 'CRM probability', fractional ? 4 : 2); valid(n <= 10000, 'CRM probability exceeds 100%'); return n } catch { throw new PipelineFailure('CRM returned an invalid stage probability') }
}

/** Fixed hosts for commercial CRMs, installation-configured Orbit origin. No redirects,
 * response bodies in errors, implicit retries, unbounded pagination or provider URLs. */
export async function pipelineRequest(origin: string, path: string, init: RequestInit = {}) {
 const url = new URL(path, origin)
 valid(url.origin === origin && url.pathname.startsWith('/'), 'CRM pagination changed origin')
 let response: Response
 try { response = await fetch(url.href, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15000) }) }
 catch { throw new PipelineFailure('CRM could not be reached; accepted pipeline data is unchanged') }
 if (!response.ok) {
  const retry = response.headers.get('retry-after')
  await response.body?.cancel()
  throw new PipelineFailure(`CRM refused the read (HTTP ${response.status}); accepted data is unchanged`, response.status, response.status === 429 ? retry && /^\d{1,6}$/.test(retry) ? `Retry after ${retry} seconds` : 'Rate limited; refresh explicitly later' : null)
 }
 const reader = response.body?.getReader(); valid(reader, 'CRM returned an empty response')
 let bytes = 0, raw = ''; const decoder = new TextDecoder()
 try {
  while (true) { const part = await reader!.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4_000_000) { await reader!.cancel(); throw new PipelineFailure('CRM response exceeds the bounded read') }; raw += decoder.decode(part.value, { stream: true }) }
  const parsed = JSON.parse(raw + decoder.decode()); valid(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'CRM returned an invalid object'); return parsed as Data
 } catch (e) { if (e instanceof PipelineFailure) throw e; throw new PipelineFailure('CRM returned invalid or interrupted JSON') }
}

export function salesforceOrigin(value: unknown) {
 const url = ownerDestination(value, 'Salesforce instance')
 requireThat(/\.(my\.salesforce\.com|salesforce\.com)$/.test(url.hostname) && url.pathname === '/' && !url.search && !url.port, 'Use the Salesforce HTTPS instance origin')
 return url.origin
}
export async function pipelineExchange(key: PipelineKey, grant?: Data) {
 const hubspot = key.provider === 'hubspot', origin = hubspot ? 'https://api.hubapi.com' : key.origin
 const result = await pipelineRequest(origin, hubspot ? '/oauth/v1/token' : '/services/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: key.clientId!, client_secret: key.clientSecret!, ...(grant ?? { grant_type: 'refresh_token', refresh_token: key.refreshToken! }) }) })
 valid(typeof result.access_token === 'string' && !!result.access_token, 'CRM OAuth response has no access token')
 if (result.scope) valid(!String(result.scope).split(/\s+/).some(s => /write|delete/.test(s)), 'CRM grant includes write scopes; reconnect a read-only grant')
 if (result.instance_url) valid(salesforceOrigin(result.instance_url) === key.origin, 'Salesforce OAuth changed instance; reconnect explicitly')
 return { accessToken: result.access_token, refreshToken: result.refresh_token ?? key.refreshToken, expiresAt: Date.now() + Math.min(3600, Number(result.expires_in) || 600) * 1000 }
}

export async function readPipeline(key: PipelineKey, beforeRead:()=>Promise<void>): Promise<PipelineSource> {
 let requests = 0
 const get = async (path: string) => { if (++requests > 160) throw new PipelineFailure('CRM exceeds the bounded read; narrow the provider grant'); await beforeRead(); return pipelineRequest(key.origin, path, { headers: { authorization: `Bearer ${key.accessToken}`, accept: 'application/json' } }) }
 const list = async (path: string, kind: 'hubspot' | 'salesforce' | 'orbit') => {
  const rows: Data[] = [], seen = new Set<string>(); let next: string | null = path
  while (next) {
   const page = await get(next), values = page[kind === 'salesforce' ? 'records' : kind === 'orbit' ? 'deals' : 'results']
   valid(Array.isArray(values), 'CRM returned an invalid list')
   for (const row of values) { const identity = id(row.Id ?? row.id); valid(!seen.has(identity), 'CRM repeated a record or pagination cursor'); seen.add(identity); rows.push(row) }
   valid(rows.length <= 5000, 'CRM exceeds 5,000 records; narrow the read-only grant')
   if (kind === 'salesforce') { valid(typeof page.done === 'boolean' && (page.done || typeof page.nextRecordsUrl === 'string'), 'Salesforce returned incomplete pagination'); next = page.done ? null : page.nextRecordsUrl }
   else if (kind === 'orbit') { valid(page.nextCursor === null || typeof page.nextCursor === 'string', 'Orbit returned incomplete pagination'); next = page.nextCursor ? `/api/v1/deals?limit=100&cursor=${encodeURIComponent(page.nextCursor)}` : null }
   else { const after = page.paging?.next?.after; next = after == null ? null : `${path}${path.includes('?') ? '&' : '?'}after=${encodeURIComponent(String(after))}` }
  }
  return rows
 }
 if (key.provider === 'hubspot') {
  const pipelines = await get('/crm/v3/pipelines/deals'), stages: Data[] = []
  valid(Array.isArray(pipelines.results), 'HubSpot returned no deal pipelines')
  for (const pipe of pipelines.results) { valid(Array.isArray(pipe.stages), 'HubSpot returned no stages'); for (const s of pipe.stages) stages.push({ id: id(s.id), name: text(s.label,'Stage'), probabilityBps: probability(s.metadata?.probability, true), closed: s.metadata?.isClosed === 'true' || s.metadata?.isClosed === true }) }
  const deals = await list('/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,hubspot_owner_id,deal_currency_code,hs_is_closed,hs_is_closed_won&associations=line_items', 'hubspot')
  const normalized: Data[] = []
  for (const row of deals) {
   const p = row.properties; valid(p && !row.archived, 'HubSpot returned an invalid deal')
   const stage = stages.find(s => s.id === p.dealstage); valid(stage, 'HubSpot deal has an unknown stage')
   const products: Data[] = []; const associated = row.associations?.line_items
   valid(!associated?.paging?.next, 'HubSpot line-item associations are incomplete; no partial deal was imported')
   for (const link of associated?.results ?? []) {
    const item = await get(`/crm/v3/objects/line_items/${encodeURIComponent(id(link.id))}?properties=name,hs_product_id,quantity,price,amount,hs_recurring_billing_period`), x = item.properties
    valid(x, 'HubSpot returned an invalid line item')
    products.push({ id: id(item.id), product: id(x.hs_product_id ?? item.id), name: text(x.name,'Product'), amountCents: money(x.amount), quantity: String(x.quantity), unitPriceCents: money(x.price), term: x.hs_recurring_billing_period ?? null })
   }
   normalized.push({ id: id(row.id), name: text(p.dealname,'Deal'), stage: stage!.id, amountCents: money(p.amount), owner: p.hubspot_owner_id ? id(p.hubspot_owner_id) : '', closeDate: date(p.closedate), closed: p.hs_is_closed==null?stage!.closed:p.hs_is_closed==='true'||p.hs_is_closed===true, won:p.hs_is_closed_won==null?stage!.closed&&stage!.probabilityBps===10000:p.hs_is_closed_won==='true'||p.hs_is_closed_won===true, currency: String(p.deal_currency_code ?? key.currency).toUpperCase(), products })
  }
  return { stages, deals: normalized, periods: [], currency: key.currency }
 }
 if (key.provider === 'salesforce') {
  const query = (q: string) => list('/services/data/v61.0/query?q=' + encodeURIComponent(q), 'salesforce')
  const stages = (await query('SELECT Id,MasterLabel,DefaultProbability,IsClosed,IsWon FROM OpportunityStage')).map(s => ({ id: id(s.MasterLabel), name: text(s.MasterLabel,'Stage'), probabilityBps: probability(s.DefaultProbability), closed: s.IsClosed === true, won: s.IsWon === true }))
  const periods = (await query("SELECT Id,StartDate,EndDate,Number,Type FROM Period WHERE Type = 'Month'")).map(p => ({ id: id(p.Id), start: date(p.StartDate), end: date(p.EndDate), number: p.Number }))
  const describe = await get('/services/data/v61.0/sobjects/Opportunity/describe')
  valid(Array.isArray(describe.fields), 'Salesforce returned no opportunity schema')
  const multicurrency = describe.fields.some((f: Data) => f.name === 'CurrencyIsoCode')
  const deals = await query(`SELECT Id,Name,StageName,Amount,OwnerId,CloseDate,IsClosed,IsWon${multicurrency ? ',CurrencyIsoCode' : ''} FROM Opportunity`)
  const term = key.termField ?? 'Subscription_Term__c'; valid(/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(term), 'Invalid Salesforce term field')
  const items = await query(`SELECT Id,OpportunityId,PricebookEntry.Product2Id,PricebookEntry.Product2.Name,Quantity,UnitPrice,TotalPrice,${term} FROM OpportunityLineItem`)
  valid(items.every(i=>deals.some(d=>d.Id===i.OpportunityId)),'Salesforce returned line items without their visible opportunities')
  return { stages, periods, currency: key.currency, deals: deals.map(d => ({ id: id(d.Id), name: text(d.Name,'Opportunity'), stage: id(d.StageName), amountCents: money(d.Amount), owner: id(d.OwnerId), closeDate: date(d.CloseDate), closed: d.IsClosed === true, won: d.IsWon === true, currency: String(d.CurrencyIsoCode ?? key.currency).toUpperCase(), products: items.filter(i => i.OpportunityId === d.Id).map(i => ({ id: id(i.Id), product: id(i.PricebookEntry?.Product2Id), name: text(i.PricebookEntry?.Product2?.Name,'Product'), amountCents: money(i.TotalPrice), quantity: String(i.Quantity), unitPriceCents: money(i.UnitPrice), term: i[term] })) })) }
 }
 await list('/api/v1/deals?limit=100', 'orbit')
 // Orbit's current scoped API exposes only title, stage_id, value_cents and
 // company_id. Never manufacture owner, product or close dates from them.
 throw new PipelineFailure('Orbit scoped deal API does not expose close date, owner and product; no pipeline was imported. Orbit must provide these read-only fields before this connector can be qualified.')
}
