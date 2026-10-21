// PEOPLE-004: explicit REV-004 booking commission planning estimates only.
import { formatBps, formatMoney, mulDiv } from './units'
import { requireThat, type Data } from './types'

export function commissionPosition(positions: Data[], contract: Data): Data {
 const position = positions.find(p => p.originId === contract.commissionPosition)
 requireThat(position && position.start <= contract.start && (!position.end || contract.start <= position.end), 'Commission needs an active position in the same scenario at the booking start period', 409)
 return position!
}

export function commissionEstimates(revenues: Data[], positions: Data[], currency: string) {
 const result = new Map<string, { amount: number; traces: string[] }>()
 for (const contract of revenues.filter(r => r.commissionPosition)) {
  requireThat(contract.kind === 'contract', 'Only an explicit contract booking can link commission', 409)
  const position = commissionPosition(positions, contract)
  const rate = position.commissionRateBps ?? 0
  const amount = mulDiv(contract.contractValueCents, rate, 10000)
  const key = `${position.originId}|${contract.start}`, previous = result.get(key) ?? { amount: 0, traces: [] }
  requireThat(Number.isSafeInteger(previous.amount + amount), 'Commission estimate exceeds the supported exact range', 409)
  result.set(key, { amount: previous.amount + amount, traces: [...previous.traces,
   `Commission planning estimate: contract ${contract.originId} (${contract.name}), booking ${contract.start}: ${formatMoney(contract.contractValueCents, currency)} × ${formatBps(rate)} = ${formatMoney(amount, currency)}, once half-away rounded to cents; no on-costs; ASC 340-40 capitalisation is not modelled.`] })
 }
 return result
}
