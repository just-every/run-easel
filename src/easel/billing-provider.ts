import { addMonths, month, monthsBetween } from './months'
import { mulDiv } from './units'
import { Fault, requireThat } from './types'

export type BillingObservation = {
 month: string
 customerId: string
 subscriptionId: string
 mrrCents: number
 currency: string
 revenueCents: number
 deferredCents: number
 refundsCents: number
 taxCents: number
}

type RecordData = Record<string, unknown>
type Invoice = RecordData & { id: string; customer: string; currency: string; created: number; status: string }
type Line = RecordData & { id: string; amount: number; period: { start: number; end: number }; currency: string }
type Entry = { customerId: string; subscriptionId: string; currency: string; invoiceCreated: number; start: number; end: number; endedAt:number|null; amount: number; mrr: number; prorated: boolean; intervalMonths: number }

const ORIGIN = 'https://api.stripe.com'
const PAGE_SIZE = 100
const MAX_REQUESTS = 2000
const MAX_BYTES = 4_000_000

export class StripeBillingFailure extends Fault {
 constructor(message: string, public httpStatus: number | null = null, public rateLimit: string | null = null) { super(502, message) }
}

const object = (v: unknown): RecordData => {
 if (!v || typeof v !== 'object' || Array.isArray(v)) throw new StripeBillingFailure('Stripe returned an invalid billing record')
 return v as RecordData
}
const string = (v: unknown): string => {
 if (typeof v !== 'string' || !v || v.length > 200) throw new StripeBillingFailure('Stripe returned an invalid billing identifier')
 return v
}
const amount = (v: unknown): number => {
 if (!Number.isSafeInteger(v)) throw new StripeBillingFailure('Stripe returned an inexact billing amount')
 return v as number
}
const timestamp = (v: unknown): number => {
 if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > 8_000_000_000) throw new StripeBillingFailure('Stripe returned an invalid billing date')
 return v as number
}
const safe = (n: number): number => {
 if (!Number.isSafeInteger(n)) throw new StripeBillingFailure('Stripe billing total exceeds exact integer precision')
 return n
}
const monthAt = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 7)
const monthStart = (value: string) => Date.parse(`${value}-01T00:00:00Z`) / 1000
const rowKey = (customer: string, subscription: string, currency: string, value: string) => JSON.stringify([customer, subscription, currency, value])

class StripeReader {
 requests = 0
 rowCount = 0
 rateLimit: string | null = null
 constructor(private key: string, private fetcher: typeof fetch) {}

 async get(path: string, query?: URLSearchParams): Promise<RecordData> {
  if (++this.requests > MAX_REQUESTS) throw new StripeBillingFailure('Stripe billing history exceeds the bounded read; narrow the month range')
  const url = new URL(path, ORIGIN)
  if (query) url.search = query.toString()
  let response: Response
  try {
   response = await this.fetcher.call(globalThis,url.toString(), { method: 'GET', headers: { authorization: `Bearer ${this.key}`, accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15000) })
  } catch { throw new StripeBillingFailure('Stripe could not be reached; no billing data was imported') }
  if (!response.ok) {
   const retry = response.headers.get('retry-after')
   this.rateLimit = response.status === 429 ? retry && /^\d{1,6}$/.test(retry) ? `Retry after ${retry} seconds` : 'Rate limited; try later' : null
   await response.body?.cancel()
   throw new StripeBillingFailure(`Stripe refused the billing read (HTTP ${response.status})`, response.status, this.rateLimit)
  }
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) throw new StripeBillingFailure('Stripe billing response is too large')
  const reader = response.body?.getReader()
  if (!reader) throw new StripeBillingFailure('Stripe returned an empty billing response')
  const decoder = new TextDecoder()
  let raw = '', bytes = 0
  while (true) {
   let part: ReadableStreamReadResult<Uint8Array>
   try { part = await reader.read() } catch { throw new StripeBillingFailure('Stripe billing response was interrupted') }
   if (part.done) break
   bytes += part.value.byteLength
   if (bytes > MAX_BYTES) { await reader.cancel(); throw new StripeBillingFailure('Stripe billing response is too large') }
   raw += decoder.decode(part.value, { stream: true })
  }
  raw += decoder.decode()
  try { return object(JSON.parse(raw)) } catch { throw new StripeBillingFailure('Stripe returned invalid billing JSON') }
 }

 async list(path: string, base?: URLSearchParams): Promise<RecordData[]> {
  const found: RecordData[] = [], ids = new Set<string>()
  let cursor: string | null = null
  for (let page = 0; page < 50; page++) {
   const query = new URLSearchParams(base)
   query.set('limit', String(PAGE_SIZE))
   if (cursor) query.set('starting_after', cursor)
   const body = await this.get(path, query)
   if (!Array.isArray(body.data) || typeof body.has_more !== 'boolean' || body.data.length > PAGE_SIZE) throw new StripeBillingFailure('Stripe returned an invalid billing page')
   if (body.has_more && body.data.length === 0) throw new StripeBillingFailure('Stripe returned an incomplete billing page')
   for (const value of body.data) {
    const item = object(value), id = string(item.id)
    if (ids.has(id)) throw new StripeBillingFailure('Stripe returned duplicate billing records')
    ids.add(id); found.push(item)
   }
   if (!body.has_more) return found
   cursor = string(object(body.data[body.data.length - 1]).id)
  }
  throw new StripeBillingFailure('Stripe billing history exceeds the bounded read; narrow the month range')
 }
}

function subscriptionFor(line: RecordData, invoice: Invoice): string | null {
 const parent = line.parent == null ? null : object(line.parent)
 const details = parent?.subscription_item_details ?? parent?.invoice_item_details
 const fromLine = details == null ? null : object(details).subscription
 const invoiceParent = invoice.parent == null ? null : object(invoice.parent)
 const invoiceDetails = invoiceParent?.subscription_details == null ? null : object(invoiceParent.subscription_details)
 const value = fromLine ?? line.subscription ?? invoice.subscription ?? invoiceDetails?.subscription
 return value == null ? null : string(value)
}

function isProration(line: RecordData): boolean {
 const parent = line.parent == null ? null : object(line.parent)
 const details = parent?.subscription_item_details ?? parent?.invoice_item_details
 return details == null ? line.proration === true : object(details).proration === true
}

function recurringMonths(price: RecordData): number {
 const recurring = object(price.recurring)
 if (recurring.usage_type !== 'licensed') throw new StripeBillingFailure('Stripe metered prices need an explicit recurring revenue policy')
 const count = amount(recurring.interval_count)
 if (count < 1 || count > 12 || !['month', 'year'].includes(String(recurring.interval))) throw new StripeBillingFailure('Stripe price interval cannot be normalized to monthly revenue')
 return recurring.interval === 'year' ? count * 12 : count
}

export async function checkStripeBillingKey(key:string) {
 const reader=new StripeReader(key,fetch)
 const page=await reader.get('/v1/invoices',new URLSearchParams({limit:'1'}))
 requireThat(Array.isArray(page.data)&&typeof page.has_more==='boolean','Stripe returned an invalid billing access check',502)
 return {checkedRows:page.data.length,rateLimit:reader.rateLimit}
}

export async function fetchStripeBilling(key: string, months: string[], fetcher: typeof fetch = fetch): Promise<{ observations: BillingObservation[]; rowCount: number; rateLimit: string | null }> {
 requireThat(typeof key === 'string' && key.length > 0 && key.length <= 500 && !/\s/.test(key), 'A Stripe restricted read key is required')
 requireThat(months.length > 0 && months.length <= 36, 'Choose one to 36 billing months')
 const selected = [...new Set(months.map(m => month(m)))].sort()
 requireThat(selected.length === months.length && selected.every((m, i) => i === 0 || m === addMonths(selected[i - 1], 1)), 'Billing months must be unique and consecutive')
 const last = selected[selected.length - 1]
 const cutoff = monthStart(addMonths(last, 1))
 const reader = new StripeReader(key, fetcher)
 const subscriptions=await reader.list('/v1/subscriptions',new URLSearchParams({status:'all','created[lt]':String(cutoff)}))
 reader.rowCount+=subscriptions.length
 const subscriptionMap=new Map(subscriptions.map(s=>[string(s.id),s]))
 const invoiceQuery = new URLSearchParams({ 'created[lt]': String(cutoff) })
 const invoices = await reader.list('/v1/invoices', invoiceQuery)
 const priceCache = new Map<string, RecordData>()
 const entries: Entry[] = []
 const invoiceWeights = new Map<string, { customer: string; currency: string; weights: Map<string, number>; created: number; tax: number; charge: string | null; paid: boolean; paidAmount: number | null }>()
 for (const raw of invoices) {
  const invoice = raw as Invoice
  string(invoice.id); string(invoice.customer); timestamp(invoice.created)
  if (!['draft', 'open', 'paid', 'uncollectible', 'void'].includes(invoice.status)) throw new StripeBillingFailure('Stripe returned an unknown invoice status')
  if (invoice.status === 'draft' || invoice.status === 'void') continue
  const currency = string(invoice.currency).toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new StripeBillingFailure('Stripe returned an invalid currency')
  const lines = await reader.list(`/v1/invoices/${encodeURIComponent(invoice.id)}/lines`)
  reader.rowCount += lines.length
  const weights = new Map<string, number>()
  for (const rawLine of lines) {
   const line = rawLine as Line
   string(line.id); amount(line.amount)
   if (string(line.currency).toUpperCase() !== currency) throw new StripeBillingFailure('Stripe invoice lines have conflicting currencies')
   const period = object(line.period)
   line.period = { start: timestamp(period.start), end: timestamp(period.end) }
   if (line.period.end <= line.period.start) throw new StripeBillingFailure('Stripe invoice line has no service period')
   const subscriptionId = subscriptionFor(line, invoice)
   if (!subscriptionId) continue
   const subscription=subscriptionMap.get(subscriptionId)
   if(!subscription || subscription.customer!==invoice.customer || string(subscription.currency).toUpperCase()!==currency)throw new StripeBillingFailure('Stripe invoice has no matching readable subscription')
   if(['paused','unpaid','incomplete','incomplete_expired'].includes(String(subscription.status)))throw new StripeBillingFailure('Stripe subscription status needs an evidenced history before importing recurring run rates')
   const endedAt=subscription.ended_at===null?null:timestamp(subscription.ended_at)
   if(subscription.status==='canceled'&&endedAt===null)throw new StripeBillingFailure('Stripe cancellation has no evidenced end date')
   weights.set(subscriptionId, safe((weights.get(subscriptionId) ?? 0) + Math.abs(line.amount)))
   const pricing = line.pricing == null ? null : object(line.pricing)
   const priceId = pricing?.price_details == null ? null : object(pricing.price_details).price
   const legacyPrice = line.price == null ? null : object(line.price)
   const id = priceId ?? legacyPrice?.id
   let mrr = 0, intervalMonths = 0
   const prorated = isProration(line)
   const recurringParent = line.parent != null && object(line.parent).type === 'subscription_item_details'
   if (recurringParent && id == null) throw new StripeBillingFailure('Stripe recurring line has no readable price')
   if (id != null) {
    const priceKey = string(id)
    let price = priceCache.get(priceKey)
    if (!price) { price = await reader.get(`/v1/prices/${encodeURIComponent(priceKey)}`); priceCache.set(priceKey, price) }
    if (price.type === 'recurring') {
     if (string(price.currency).toUpperCase() !== currency) throw new StripeBillingFailure('Stripe price currency does not match its invoice')
     intervalMonths = recurringMonths(price)
     if (!prorated) mrr = mulDiv(line.amount, 1, intervalMonths)
    }
    else if (recurringParent) throw new StripeBillingFailure('Stripe subscription line has a nonrecurring price')
   }
   if (prorated && !intervalMonths) throw new StripeBillingFailure('Stripe proration lacks a recurring price')
   entries.push({ customerId: invoice.customer, subscriptionId, currency, invoiceCreated: invoice.created, start: line.period.start, end: line.period.end,endedAt, amount: line.amount, mrr, prorated, intervalMonths })
  }
  const pretax = amount(invoice.total_excluding_tax)
  const total = amount(invoice.total)
  const tax = safe(total - pretax)
  if (tax < 0) throw new StripeBillingFailure('Stripe invoice tax cannot be reconciled')
  const paidAmount = invoice.amount_paid == null ? null : amount(invoice.amount_paid)
  invoiceWeights.set(invoice.id, { customer: invoice.customer, currency, weights, created: invoice.created, tax, charge: invoice.charge == null ? null : string(invoice.charge), paid: invoice.status === 'paid' || (paidAmount != null && paidAmount > 0), paidAmount })
 }
 for (const entry of entries) {
  if (!entry.prorated) continue
  const cycles = entries.filter(other => !other.prorated && other.customerId === entry.customerId && other.subscriptionId === entry.subscriptionId && other.currency === entry.currency && other.end === entry.end && other.start < entry.start)
  if (!cycles.length) throw new StripeBillingFailure('Stripe proration has no evidenced full billing period')
  const start = Math.min(...cycles.map(cycle => cycle.start))
  const fullSeconds = entry.end - start, partialSeconds = entry.end - entry.start
  if (fullSeconds <= 0 || partialSeconds <= 0) throw new StripeBillingFailure('Stripe proration has an invalid service period')
  entry.mrr = mulDiv(entry.amount, fullSeconds, partialSeconds * entry.intervalMonths)
 }
 const credits = await reader.list('/v1/credit_notes', new URLSearchParams({ 'created[lt]': String(cutoff) }))
 reader.rowCount += invoices.length + credits.length
 const refunds = new Map<string, number>()
 const creditRefunds = new Map<string, { invoiceId: string; amount: number }>()
 const assignRefund = (invoiceId: string, value: number, when: number) => {
  const source = invoiceWeights.get(invoiceId)
  if (!source || !source.weights.size) return
  const subscriptions = [...source.weights.keys()]
  if (subscriptions.length > 1 && value) throw new StripeBillingFailure('Stripe refund spans subscriptions without an evidenced allocation')
  for (const id of subscriptions) {
   const key = rowKey(source.customer, id, source.currency, monthAt(when))
   refunds.set(key, safe((refunds.get(key) ?? 0) + value))
  }
 }
 for (const credit of credits) {
  string(credit.id); timestamp(credit.created)
  if (credit.status === 'void') continue
  if (credit.status !== 'issued') throw new StripeBillingFailure('Stripe returned an unknown credit note status')
  const invoiceId = string(credit.invoice)
  const source = invoiceWeights.get(invoiceId)
  if (!source) continue
  if (!Array.isArray(credit.refunds)) throw new StripeBillingFailure('Stripe credit note refunds are unavailable')
  for (const rawRefund of credit.refunds) {
   const linked = object(rawRefund), value = amount(linked.amount_refunded)
   if (value < 0) throw new StripeBillingFailure('Stripe returned a negative refund')
   if (linked.type === 'payment_record_refund') { assignRefund(invoiceId, value, credit.created as number); continue }
   const reference = linked.refund
   const refundId = string(typeof reference === 'string' ? reference : object(reference).id)
   if (creditRefunds.has(refundId)) throw new StripeBillingFailure('Stripe refund is linked to multiple credit notes')
   creditRefunds.set(refundId, { invoiceId, amount: value })
  }
 }
 const paidInvoices = [...invoiceWeights].filter(([, invoice]) => invoice.weights.size && invoice.paid)
 if (paidInvoices.length || creditRefunds.size) {
  const paymentOwners = new Map<string, Set<string>>()
  const chargeOwners = new Map<string, Set<string>>()
  const bind = (map: Map<string, Set<string>>, id: string, invoiceId: string) => {
   const owners = map.get(id) ?? new Set<string>()
   owners.add(invoiceId); map.set(id, owners)
  }
  for (const [id, invoice] of paidInvoices) if (invoice.charge) bind(chargeOwners, invoice.charge, id)
  const payments = await reader.list('/v1/invoice_payments', new URLSearchParams({ 'created[lt]': String(cutoff), status: 'paid' }))
  reader.rowCount += payments.length
  for (const payment of payments) {
   const invoiceId = string(payment.invoice)
   if (!invoiceWeights.get(invoiceId)?.weights.size) continue
   const link = object(payment.payment)
   if (link.type !== 'payment_intent') throw new StripeBillingFailure('Stripe invoice payment has no supported refund link')
   bind(paymentOwners, string(link.payment_intent), invoiceId)
  }
  for (const [invoiceId, invoice] of paidInvoices) {
   const linked = invoice.charge || [...paymentOwners.values()].some(owners => owners.has(invoiceId))
   if (!linked && invoice.paidAmount !== 0) throw new StripeBillingFailure('Stripe paid invoice has no readable payment link for refunds')
  }
  const issued = await reader.list('/v1/refunds', new URLSearchParams({ 'created[lt]': String(cutoff) }))
  reader.rowCount += issued.length
  const seenRefunds = new Set<string>()
  for (const refund of issued) {
   const id = string(refund.id), when = timestamp(refund.created)
   seenRefunds.add(id)
   const paymentId = refund.payment_intent == null ? null : string(refund.payment_intent)
   const chargeId = refund.charge == null ? null : string(refund.charge)
   const owners = new Set([...(paymentId ? paymentOwners.get(paymentId) ?? [] : []), ...(chargeId ? chargeOwners.get(chargeId) ?? [] : [])])
   const linked = creditRefunds.get(id)
   if (linked) owners.add(linked.invoiceId)
   if (owners.size > 1) throw new StripeBillingFailure('Stripe refund spans invoices without an evidenced allocation')
   const invoiceId = [...owners][0]
   if (!invoiceId) continue
   if (refund.status === 'failed' || refund.status === 'canceled') continue
   if (refund.status !== 'succeeded') throw new StripeBillingFailure('Stripe has a pending refund; reconcile after its final status')
   const value = linked ? linked.amount : amount(refund.amount)
   if (value < 0 || value > amount(refund.amount)) throw new StripeBillingFailure('Stripe refund amount cannot be reconciled')
   const source = invoiceWeights.get(invoiceId)
   if (!source || string(refund.currency).toUpperCase() !== source.currency) throw new StripeBillingFailure('Stripe refund currency does not match its invoice')
   assignRefund(invoiceId, value, when)
  }
  for (const id of creditRefunds.keys()) if (!seenRefunds.has(id)) throw new StripeBillingFailure('Stripe credit note refund is missing from the refund ledger')
 }
 const tax = new Map<string, number>()
 for (const invoice of invoiceWeights.values()) {
  const subscriptions = [...invoice.weights.keys()]
  if (!subscriptions.length) continue
  if (subscriptions.length > 1 && invoice.tax) throw new StripeBillingFailure('Stripe invoice tax spans subscriptions without an evidenced allocation')
  subscriptions.forEach(id => {
   const key = rowKey(invoice.customer, id, invoice.currency, monthAt(invoice.created))
   tax.set(key, safe((tax.get(key) ?? 0) + invoice.tax))
  })
 }
 const identities = new Map<string, { customerId: string; subscriptionId: string; currency: string; entries: Entry[] }>()
 for (const entry of entries) {
  const key = JSON.stringify([entry.customerId, entry.subscriptionId, entry.currency])
  const identity = identities.get(key) ?? { customerId: entry.customerId, subscriptionId: entry.subscriptionId, currency: entry.currency, entries: [] }
  identity.entries.push(entry); identities.set(key, identity)
 }
 const earliest = entries.filter(entry => entry.intervalMonths > 0).reduce((value, entry) => {
  const from = monthAt(entry.start)
  return from < value ? from : value
 }, selected[0])
 if (monthsBetween(earliest, last) >= 240) throw new StripeBillingFailure('Stripe billing history exceeds 240 months; a complete cohort cannot be shown')
 const observations: BillingObservation[] = []
 for (let value = earliest; value <= last; value = addMonths(value, 1)) {
  const end = monthStart(addMonths(value, 1)), start = monthStart(value)
  for (const identity of identities.values()) {
   let mrrCents = 0, revenueCents = 0, billedCents = 0, recognizedCents = 0
   for (const entry of identity.entries) {
    if (entry.invoiceCreated >= end) continue
    billedCents = safe(billedCents + entry.amount)
    const through = Math.max(0, Math.min(end, entry.end) - entry.start)
    const before = Math.max(0, Math.min(start, entry.end) - entry.start)
    const duration = entry.end - entry.start
    const totalRecognized = mulDiv(entry.amount, through, duration)
    recognizedCents = safe(recognizedCents + totalRecognized)
    revenueCents = safe(revenueCents + totalRecognized - mulDiv(entry.amount, before, duration))
    if (entry.start <= end - 1 && entry.end >= end && (entry.endedAt===null||entry.endedAt>=end) && entry.mrr) mrrCents = safe(mrrCents + entry.mrr)
   }
   const key = rowKey(identity.customerId, identity.subscriptionId, identity.currency, value)
   const refundsCents = refunds.get(key) ?? 0, taxCents = tax.get(key) ?? 0
   if (mrrCents < 0) throw new StripeBillingFailure('Stripe recurring credits exceed current charges')
   const deferredCents = safe(billedCents - recognizedCents)
   if (mrrCents || revenueCents || deferredCents || refundsCents || taxCents) observations.push({ month: value, customerId: identity.customerId, subscriptionId: identity.subscriptionId, currency: identity.currency, mrrCents, revenueCents, deferredCents, refundsCents, taxCents })
  }
 }
 return { observations, rowCount: reader.rowCount, rateLimit: reader.rateLimit }
}
