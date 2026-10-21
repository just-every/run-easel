// PEOPLE-004: entered compensation planning assumptions, never payroll execution.
import { cents, hundredths, percentBps, formatMoney, formatHundredths, formatBps, mulDiv } from './units'
import { periodForKey, type CalendarWorkspace } from './fiscal-calendar'
import { choice, requireThat, type Data } from './types'

export function compensationInput(b: Data): Data {
 const payBasis = choice(b.payBasis ?? 'salary', ['salary', 'hourly'] as const, 'a pay basis')
 const hourlyRateCents = cents(payBasis === 'hourly' ? b.hourlyRate : b.hourlyRate || '0', 'Hourly pay rate')
 const expectedHours = hundredths(payBasis === 'hourly' ? b.expectedHours : b.expectedHours || '0', 'Expected hours per period')
 const annualSalaryCents = cents(b.annualSalary, 'Annual salary')
 requireThat(payBasis === 'hourly' ? annualSalaryCents === 0 : hourlyRateCents === 0 && expectedHours === 0, 'Choose salary or hourly pay, without inputs for the other basis')
 const benefitsCents = cents(b.benefits || '0', 'Benefits per person per period')
 const retirementMatchBps = percentBps(b.retirementMatchPercent || '0', '401(k) employer match estimate %')
 const meritBps = percentBps(b.meritPercent || '0', 'Merit increase %')
 const meritDate = String(b.meritDate || '')
 if (meritDate) {
  const date = new Date(`${meritDate}T00:00:00Z`)
  requireThat(/^\d{4}-\d{2}-\d{2}$/.test(meritDate) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === meritDate, 'Use a real ISO merit date')
 }
 requireThat(Boolean(meritDate) === Boolean(meritBps), 'Enter both a merit date and a positive increase, or neither')
 const bonusBps = percentBps(b.bonusPercent || '0', 'Position bonus %')
 const bonusMonth = String(b.bonusMonth || '')
 requireThat(!bonusMonth || /^\d{4}-(0[1-9]|1[0-2])$/.test(bonusMonth), 'Use YYYY-MM for the bonus payment period')
 requireThat(Boolean(bonusMonth) === Boolean(bonusBps), 'Enter both a bonus payment period and a positive percentage, or neither')
 requireThat(!bonusBps || payBasis === 'salary', 'Percent-of-salary bonus requires annual salary pay')
 requireThat(!bonusMonth || b.start <= bonusMonth && (!b.end || bonusMonth <= b.end), 'Bonus payment period must be active')
 const result = { meritBps, meritDate, bonusBps, bonusMonth, payBasis, hourlyRateCents, expectedHours, annualSalaryCents, benefitsCents, retirementMatchBps }
 // Refuse an unsafe product before saving it, even if no active period is read yet.
 compensation({ ...result, onCostBps: percentBps(b.onCostPercent ?? '0', 'On-costs %') }, Math.floor(annualSalaryCents / 12), 'USD')
 return result
}

/** salaryWages is the existing cent-conserving monthly salary, before on-costs.
 * Benefits and retirement are entered employer-cost estimates, not taxable wages.
 * The match base excludes commission; no eligibility or employee election is inferred. */
export function compensation(p: Data, salaryWages: number, currency: string) {
 const hourly = p.payBasis === 'hourly'
 const wages = hourly ? mulDiv(p.hourlyRateCents, p.expectedHours, 100) : salaryWages
 requireThat(wages <= 10 ** 13, 'Base wages exceed the supported money amount', 409)
 const onCosts = hourly ? mulDiv(wages, p.onCostBps, 10000) : 0
 const benefits = p.benefitsCents ?? 0
 const match = mulDiv(wages, p.retirementMatchBps ?? 0, 10000)
 const money = (n: number) => formatMoney(n, currency)
 const extra = benefits + match
 requireThat([wages, onCosts, extra, wages + onCosts + extra].every(Number.isSafeInteger), 'Compensation estimate exceeds the supported exact range', 409)
 const trace = `${hourly ? `Hourly pay planning estimate: ${money(p.hourlyRateCents)} × ${formatHundredths(p.expectedHours)} expected hours per period = ${money(wages)}, once half-away rounded to cents; on-costs ${formatBps(p.onCostBps)} × hourly wages = ${money(onCosts)}, separately once half-away rounded. ` : ''}${benefits || match || p.retirementMatchBps ? `Compensation planning estimates: benefits per person per period ${money(benefits)}; 401(k) employer match ${formatBps(p.retirementMatchBps ?? 0)} × base ${money(wages)} = ${money(match)}, once half-away rounded; match base is salary or hourly wages, excluding commission. Benefits and match are additional employer cost, excluded from taxable wages and on-costs; eligibility, employee deferrals and statutory limits are not inferred. ` : ''}`
 return { wages, onCosts, benefits, match, extra, trace }
}

/** PEOPLE-004: one explicit dated raise and one explicitly dated salary bonus.
 * Inclusive UTC calendar-day proration; no inferred eligibility or pay execution. */
export function compensationSchedule(p: Data, months: string[], currency: string, workspace?: CalendarWorkspace) {
 const active = months.filter(m => p.start <= m && (!p.end || m <= p.end))
 const monthly = Number(BigInt(p.annualSalaryCents) / 12n)
 const target = mulDiv(p.annualSalaryCents, active.length, 12)
 const costMonthly = Number(BigInt(p.annualSalaryCents) * BigInt(10000 + p.onCostBps) / 120000n)
 const costTarget = mulDiv(p.annualSalaryCents, (10000 + p.onCostBps) * active.length, 120000)
 return new Map(active.map((m, i) => {
  const last = i === active.length - 1
  const salary = last ? target - monthly * (active.length - 1) : monthly
  const base = compensation(p, salary, currency)
  const period = periodForKey(workspace ?? { planStart: months[0], horizon: months.length }, m)
  const day = (v: string) => Date.parse(v + 'T00:00:00Z') / 86400000
  const days = day(period.endDate) - day(period.startDate) + 1
  const affected = p.meritDate && p.meritDate <= period.endDate ? day(period.endDate) - day(p.meritDate > period.startDate ? p.meritDate : period.startDate) + 1 : 0
  const merit = mulDiv(base.wages, (p.meritBps ?? 0) * affected, 10000 * days)
  const wages = base.wages + merit
  const onCosts = (p.payBasis === 'hourly' ? base.onCosts : (last ? costTarget - costMonthly * (active.length - 1) : costMonthly) - salary) + mulDiv(merit, p.onCostBps, 10000)
  const match = mulDiv(wages, p.retirementMatchBps ?? 0, 10000)
  // Bonus uses the annual salary rate in force at the end of its explicit pay period.
  const bonus = p.bonusMonth === m ? mulDiv(p.annualSalaryCents, (10000 + (p.meritDate && p.meritDate <= period.endDate ? p.meritBps : 0)) * p.bonusBps, 100000000) : 0
  const extra = base.benefits + match + bonus
  const trace = `${base.trace}${p.meritBps ? `Merit planning estimate: ${p.meritDate}, ${formatBps(p.meritBps)} × base wages ${formatMoney(base.wages,currency)} × ${affected}/${days} inclusive UTC days = ${formatMoney(merit,currency)}, once half-away rounded; merit on-costs ${formatMoney(mulDiv(merit,p.onCostBps,10000),currency)}; match on base plus merit ${formatMoney(match,currency)}, excluding bonus and commission. ` : ''}${bonus ? `Position bonus planning estimate: annual salary ${formatMoney(p.annualSalaryCents,currency)} × effective merit factor × ${formatBps(p.bonusBps)} = ${formatMoney(bonus,currency)}, once half-away rounded; expensed and paid in ${m}, without on-costs or match. ` : ''}${p.onCostSource === 'department' ? `On-cost default captured from department at position save: ${formatBps(p.onCostBps)}. ` : ''}`
  const total = wages + onCosts + extra
  requireThat([wages,onCosts,extra,total].every(Number.isSafeInteger) && total <= 10 ** 13, 'Compensation estimate exceeds the supported exact range',409)
  return [m, { wages, onCosts, benefits: base.benefits, match, bonus, extra, merit, total, trace }]
 }))
}
