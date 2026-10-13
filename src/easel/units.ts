// Decimal money and quantities. Money is integer minor units (cents); counts
// and volumes are integer hundredths; rates are basis points. Every division
// rounds half away from zero exactly once, with BigInt so no float enters.
import { requireThat } from './types'

const LIMIT = 10n ** 13n

/** Parses a decimal string with at most `places` decimals into an integer of that scale. */
export function decimal(v: unknown, label: string, places: number, { negative = false, max = LIMIT } = {}): number {
 const raw = typeof v === 'number' && Number.isFinite(v) ? String(v) : v
 requireThat(typeof raw === 'string', `${label} is required`)
 const s = raw.trim().replace(/,/g, '')
 const pattern = new RegExp(`^${negative ? '-?' : ''}\\d+(\\.\\d{1,${places}})?$`)
 requireThat(pattern.test(s), `${label} must be a number with at most ${places} decimal places${negative ? '' : ' and not negative'}`)
 const sign = s.startsWith('-') ? -1n : 1n
 const [whole, fraction = ''] = s.replace('-', '').split('.')
 const scaled = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0')
 requireThat(scaled <= BigInt(max), `${label} is too large`)
 return Number(sign * scaled)
}

export const cents = (v: unknown, label: string, options?: { negative?: boolean }) => decimal(v, label, 2, options)
export const hundredths = (v: unknown, label: string) => decimal(v, label, 2)
/** A percentage such as "12.5" stored as basis points (1250). */
export const percentBps = (v: unknown, label: string, max = 100) => decimal(v, label, 2, { max: BigInt(max * 100) })

/** round(a * b / d), half away from zero. */
export function mulDiv(a: number, b: number, d: number): number {
 const n = BigInt(a) * BigInt(b), q = BigInt(d)
 const sign = (n < 0n) !== (q < 0n) ? -1n : 1n
 const an = n < 0n ? -n : n, aq = q < 0n ? -q : q
 return Number(sign * ((an * 2n + aq) / (aq * 2n)))
}

/** Splits an amount across weights so the parts sum exactly (largest remainder, earliest wins ties). */
export function apportion(amount: number, weights: number[]): number[] {
 const total = weights.reduce((a, b) => a + b, 0)
 if (total <= 0) return weights.map(() => 0)
 const sign = amount < 0 ? -1 : 1, abs = BigInt(Math.abs(amount)), t = BigInt(total)
 const base = weights.map(w => (abs * BigInt(w)) / t)
 let rest = abs - base.reduce((a, b) => a + b, 0n)
 const order = weights.map((w, i) => ({ i, r: (abs * BigInt(w)) % t })).sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i))
 for (const { i } of order) { if (rest <= 0n) break; base[i] += 1n; rest -= 1n }
 return base.map(b => sign * Number(b))
}

export function formatMoney(minor: number, currency = 'AUD'): string {
 const sign = minor < 0 ? '-' : ''
 const abs = Math.abs(minor), whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
 return `${sign}${currency === 'AUD' ? '$' : currency + ' '}${whole}.${String(abs % 100).padStart(2, '0')}`
}

export const formatHundredths = (n: number) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`
export const formatBps = (n: number) => `${formatHundredths(n)}%`
