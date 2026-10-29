import { addMonths } from './months'
import { mulDiv, formatBps, formatMoney } from './units'
import { requireThat, type Data } from './types'

/** Weighted open bookings divided by finance's explicit quarterly bookings
 * target. Missing inputs or a zero target are unavailable, never zero coverage. */
export function pipelineCoverage(revenues: Data[], current: string, fiscalYearStart: number, targetCents: number, department = '', observations:Data={}, currency='USD') {
 const index=(Number(current.slice(5))-fiscalYearStart+12)%12
 const from=addMonths(current,3-index%3),to=addMonths(from,2)
 const pipeline=revenues.filter(r=>r.pipeline && (!department||r.department===department))
 const rows=pipeline.filter(r=>!r.pipeline.closed && r.start>=from && r.start<=to)
 const weightedCents=Number(rows.reduce((n,r)=>n+BigInt(r.contractValueCents),0n))
 requireThat(Number.isSafeInteger(weightedCents),'Pipeline coverage exceeds exact limits',409)
 return {from,to,targetCents,weightedCents,coverageBps:(pipeline.length || Object.keys(observations).length) && targetCents>0?mulDiv(weightedCents,10000,targetCents):null,
  sources:[...Object.entries(observations).map(([provider,o])=>`${provider} accepted source digest ${o.sourceDigest}; observed ${o.observedAt}; ${o.rows} complete scoped deals`),...rows.map(r=>`${r.pipeline.provider} deal ${r.pipeline.deal}; product ${r.pipeline.product}; ${r.start}; weighted ${formatMoney(r.contractValueCents,currency)} at ${formatBps(r.pipeline.probabilityBps)}; assumption ${r.pipeline.assumptionVersion}`)]}
}
