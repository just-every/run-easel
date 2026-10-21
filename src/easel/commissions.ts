// PEOPLE-004: explicit REV-004 booking commission planning estimates only.
import { cents, percentBps, formatBps, formatMoney, mulDiv } from './units'
import { requireThat, type Data } from './types'

export function commissionPosition(positions: Data[], contract: Data): Data {
 const position = positions.find(p => p.originId === contract.commissionPosition)
 requireThat(position && position.start <= contract.start && (!position.end || contract.start <= position.end), 'Commission needs an active position in the same scenario at the booking start period', 409)
 return position!
}

export function commissionInput(b: Data) {
 const commissionQuotaCents = cents(b.commissionQuota || '0','Commission quota per period')
 const raw = String(b.commissionTiers || '').trim()
 const commissionTiers = raw ? raw.split(/\r?\n/).map((line: string) => {
  const parts = line.split(':')
  requireThat(parts.length === 2, 'Use attainment percent:commission rate percent per accelerator line')
  return { attainmentBps: percentBps(parts[0].trim(),'Accelerator attainment %',10000), rateBps: percentBps(parts[1].trim(),'Accelerator commission rate %') }
 }) : []
 requireThat(commissionTiers.length <= 20, 'Use at most 20 accelerator tiers')
 let previous = 0, rate = percentBps(b.commissionPercent || '0','Commission rate %')
 for (const tier of commissionTiers) {
  const threshold = mulDiv(commissionQuotaCents,tier.attainmentBps,10000)
  requireThat(commissionQuotaCents > 0 && threshold > previous && tier.rateBps > rate, 'Accelerators need positive quota, distinct increasing cent thresholds and increasing rates')
  previous = threshold; rate = tier.rateBps
 }
 return { commissionQuotaCents, commissionTiers }
}

export function commissionEstimates(revenues: Data[], positions: Data[], currency: string) {
 const result = new Map<string, { amount: number; traces: string[] }>()
 const booked = new Map<string,number>()
 const contracts = revenues.filter(r => r.commissionPosition).sort((a,b) => a.start.localeCompare(b.start) || a.originId.localeCompare(b.originId))
 for (const contract of contracts) {
  requireThat(contract.kind === 'contract', 'Only an explicit contract booking can link commission', 409)
  const position = commissionPosition(positions, contract)
  const rate = position.commissionRateBps ?? 0
  const key = `${position.originId}|${contract.start}`
  const before = booked.get(key) ?? 0, after = before + contract.contractValueCents
  requireThat(Number.isSafeInteger(after), 'Commission bookings exceed the supported exact range',409)
  booked.set(key,after)
  const quota = position.commissionQuotaCents ?? 0
  const tiers = (position.commissionTiers ?? []).map((t:Data) => ({ threshold: mulDiv(quota,t.attainmentBps,10000), rate: t.rateBps }))
  let cursor = before, currentRate = rate, numerator = 0n
  const parts: string[] = []
  for (const tier of [...tiers,{threshold:after,rate:0}]) {
   const upper = Math.min(after,tier.threshold)
   if (upper > cursor) { const portion = upper-cursor; numerator += BigInt(portion)*BigInt(currentRate); parts.push(`${formatMoney(portion,currency)} × ${formatBps(currentRate)}`); cursor = upper }
   currentRate = tier.rate
   if(cursor === after) break
  }
  const amount = Number((numerator*2n+10000n)/20000n)
  const tierTrace = quota ? ` Period quota ${formatMoney(quota,currency)}; cumulative linked bookings ${formatMoney(after,currency)}; attainment ${formatBps(mulDiv(after,10000,quota))}; marginal tiers: ${parts.join(' + ')}. Contracts use ascending origin ID within each period; quota resets each period; no retroactive rate.` : ''
  const previous = result.get(key) ?? { amount: 0, traces: [] }
  requireThat(Number.isSafeInteger(previous.amount + amount), 'Commission estimate exceeds the supported exact range', 409)
  result.set(key, { amount: previous.amount + amount, traces: [...previous.traces,
   `Commission planning estimate: contract ${contract.originId} (${contract.name}), booking ${contract.start}: ${formatMoney(contract.contractValueCents, currency)} ${tiers.length ? `allocated across marginal tiers` : `× ${formatBps(rate)}`} = ${formatMoney(amount, currency)}, once half-away rounded to cents; no on-costs; ASC 340-40 capitalisation is not modelled.${tierTrace}`] })
 }
 return result
}
