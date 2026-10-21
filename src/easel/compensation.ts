// PEOPLE-004: entered compensation planning assumptions, never payroll execution.
import { cents, hundredths, percentBps, formatMoney, formatHundredths, formatBps, mulDiv } from './units'
import { choice, requireThat, type Data } from './types'

export function compensationInput(b: Data): Data {
 const payBasis = choice(b.payBasis ?? 'salary', ['salary', 'hourly'] as const, 'a pay basis')
 const hourlyRateCents = cents(payBasis === 'hourly' ? b.hourlyRate : b.hourlyRate || '0', 'Hourly pay rate')
 const expectedHours = hundredths(payBasis === 'hourly' ? b.expectedHours : b.expectedHours || '0', 'Expected hours per period')
 const annualSalaryCents = cents(b.annualSalary || '0', 'Annual salary')
 requireThat(payBasis === 'hourly' ? annualSalaryCents === 0 : hourlyRateCents === 0 && expectedHours === 0, 'Choose salary or hourly pay, without inputs for the other basis')
 // Preserve the existing requirement for explicit salary on the salary door.
 if (payBasis === 'salary') cents(b.annualSalary, 'Annual salary')
 const benefitsCents = cents(b.benefits || '0', 'Benefits per person per period')
 const retirementMatchBps = percentBps(b.retirementMatchPercent || '0', '401(k) employer match estimate %')
 return { payBasis, hourlyRateCents, expectedHours, annualSalaryCents, benefitsCents, retirementMatchBps }
}

/** salaryWages is the existing cent-conserving monthly salary, before on-costs.
 * Benefits and retirement are entered employer-cost estimates, not taxable wages.
 * The match base excludes commission; no eligibility or employee election is inferred. */
export function compensation(p: Data, salaryWages: number, currency: string) {
 const hourly = p.payBasis === 'hourly'
 const wages = hourly ? mulDiv(p.hourlyRateCents, p.expectedHours, 100) : salaryWages
 const onCosts = hourly ? mulDiv(wages, p.onCostBps, 10000) : 0
 const benefits = p.benefitsCents ?? 0
 const match = mulDiv(wages, p.retirementMatchBps ?? 0, 10000)
 const money = (n: number) => formatMoney(n, currency)
 const extra = benefits + match
 requireThat([wages, onCosts, extra, wages + onCosts + extra].every(Number.isSafeInteger), 'Compensation estimate exceeds the supported exact range', 409)
 const trace = `${hourly ? `Hourly pay planning estimate: ${money(p.hourlyRateCents)} × ${formatHundredths(p.expectedHours)} expected hours per period = ${money(wages)}, once half-away rounded to cents; on-costs ${formatBps(p.onCostBps)} × hourly wages = ${money(onCosts)}, separately once half-away rounded. ` : ''}${benefits || match || p.retirementMatchBps ? `Compensation planning estimates: benefits per person per period ${money(benefits)}; 401(k) employer match ${formatBps(p.retirementMatchBps ?? 0)} × base ${money(wages)} = ${money(match)}, once half-away rounded; match base is salary or hourly wages, excluding commission. Benefits and match are additional employer cost, excluded from taxable wages and on-costs; eligibility, employee deferrals and statutory limits are not inferred. ` : ''}`
 return { wages, onCosts, benefits, match, extra, trace }
}
