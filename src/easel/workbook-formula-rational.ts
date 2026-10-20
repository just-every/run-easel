import { requireThat } from './types'
import { FORMULA_LIMITS } from './workbook-formula-types'

export type Rational = { numerator: bigint; denominator: bigint }
const abs = (n: bigint): bigint => n < 0n ? -n : n
function gcd(a: bigint, b: bigint): bigint {
 a = abs(a); b = abs(b)
 while (b) { const next = a % b; a = b; b = next }
 return a
}
export function rational(numerator: bigint, denominator = 1n): Rational {
 requireThat(denominator !== 0n, 'Workbook formula divides by zero')
 const divisor = gcd(numerator, denominator)
 if (denominator < 0n) { numerator = -numerator; denominator = -denominator }
 numerator /= divisor; denominator /= divisor
 requireThat(abs(numerator).toString(2).length <= FORMULA_LIMITS.bits && denominator.toString(2).length <= FORMULA_LIMITS.bits, 'Workbook exact arithmetic exceeds the supported size')
 return { numerator, denominator }
}
export function decimalRational(value: string | number): Rational {
 if (typeof value === 'number') requireThat(Number.isFinite(value), 'Workbook contains a non-finite numeric value')
 const text = String(value)
 requireThat(text.length <= 1300, 'Workbook number is too large')
 const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text)
 requireThat(match && (match[2] || match[3]), `Invalid workbook decimal: ${text}`)
 const exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0)
 requireThat(Number.isSafeInteger(exponent) && Math.abs(exponent) <= 1200, 'Workbook decimal exponent is too large')
 const digits = BigInt((match[2] || '0') + (match[3] ?? '')) * (match[1] === '-' ? -1n : 1n)
 return exponent < 0 ? rational(digits, 10n ** BigInt(-exponent)) : rational(digits * 10n ** BigInt(exponent))
}
export function add(a: Rational, b: Rational): Rational {
 const shared = gcd(a.denominator, b.denominator)
 return rational(a.numerator * (b.denominator / shared) + b.numerator * (a.denominator / shared), a.denominator * (b.denominator / shared))
}
export const negate = (a: Rational): Rational => rational(-a.numerator, a.denominator)
export function multiply(a: Rational, b: Rational): Rational {
 const x = gcd(a.numerator, b.denominator), y = gcd(b.numerator, a.denominator)
 return rational((a.numerator / x) * (b.numerator / y), (a.denominator / y) * (b.denominator / x))
}
export const divide = (a: Rational, b: Rational): Rational => multiply(a, rational(b.denominator, b.numerator))
export function power(a: Rational, b: Rational): Rational {
 requireThat(b.denominator === 1n && abs(b.numerator) <= BigInt(FORMULA_LIMITS.exponent), `Workbook powers require an integer exponent between -${FORMULA_LIMITS.exponent} and ${FORMULA_LIMITS.exponent}`)
 const exponent = abs(b.numerator)
 requireThat(a.numerator !== 0n || b.numerator >= 0n, 'Workbook formula divides by zero')
 requireThat(BigInt(abs(a.numerator).toString(2).length - 1) * exponent <= BigInt(FORMULA_LIMITS.bits) && BigInt(a.denominator.toString(2).length - 1) * exponent <= BigInt(FORMULA_LIMITS.bits), 'Workbook power exceeds the supported exact arithmetic size')
 return b.numerator < 0n ? rational(a.denominator ** exponent, a.numerator ** exponent) : rational(a.numerator ** exponent, a.denominator ** exponent)
}
export function compareRationals(a: Rational, b: Rational): number {
 const difference = a.numerator * b.denominator - b.numerator * a.denominator
 return difference < 0n ? -1 : difference > 0n ? 1 : 0
}
export function integerValue(a: Rational, label: string): number {
 requireThat(a.denominator === 1n && abs(a.numerator) <= BigInt(Number.MAX_SAFE_INTEGER), `${label} must be a whole number`)
 return Number(a.numerator)
}
/** The only rounding in calculation: one half away from zero, at the final cell. */
export function rationalCents(a: Rational): number {
 const scaled = abs(a.numerator) * 100n
 const cents = (scaled / a.denominator + (scaled % a.denominator * 2n >= a.denominator ? 1n : 0n)) * (a.numerator < 0n ? -1n : 1n)
 requireThat(abs(cents) <= BigInt(Number.MAX_SAFE_INTEGER), 'Workbook numeric result is outside the supported cents range')
 return Number(cents)
}
/** Finite decimals stay decimals; repeating decimals are represented losslessly as n/d. */
export function rationalText(a: Rational): string {
 let denominator = a.denominator, twos = 0, fives = 0
 while (denominator % 2n === 0n) { denominator /= 2n; twos++ }
 while (denominator % 5n === 0n) { denominator /= 5n; fives++ }
 if (denominator !== 1n) return `${a.numerator}/${a.denominator}`
 const places = Math.max(twos, fives)
 if (!places) return String(a.numerator)
 const digits = (abs(a.numerator) * 2n ** BigInt(places - twos) * 5n ** BigInt(places - fives)).toString().padStart(places + 1, '0')
 const text = `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/0+$/, '').replace(/\.$/, '')
 return (a.numerator < 0n ? '-' : '') + text
}
