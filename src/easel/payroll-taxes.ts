// Employer payroll taxes on salary before owner-supplied on-costs.
import { formatBps, formatMoney, mulDiv } from './units'
import { requireThat, type Data } from './types'
import { periodForKey, type CalendarWorkspace } from './fiscal-calendar'

export type PayrollTaxRow = {
 originId: string; month: string; line: string; department: string
 wagesCents: number; socialSecurityCents: number; medicareCents: number
 futaCents: number; sutaCents: number; totalCents: number; ytdWagesCents: number; trace: string
}
export type PayrollTaxCalculation = { rows: PayrollTaxRow[]; issues: Data[] }
const active = (p: Data, month: string) => p.start <= month && (!p.end || month <= p.end)
const sum = (...amounts: number[]) => {
 const total = amounts.reduce((n, amount) => n + BigInt(amount), 0n)
 requireThat(total >= 0n && total <= BigInt(Number.MAX_SAFE_INTEGER), 'Payroll tax calculation exceeds the supported exact range')
 return Number(total)
}

/** Rates and wage bases are validated employer assumptions supplied by the caller.
 * Opening YTD is explicit for pre-existing employees in a partial first year;
 * subsequent calendar years start at zero. Retail periods use the calendar year
 * of their end date for all wages in the period. No prior wages are estimated here. */
export function payrollTaxes(positions: Data[], months: string[], settings: Data, currency: string, workspace?: CalendarWorkspace): PayrollTaxCalculation {
 const rows: PayrollTaxRow[] = []
 if (!months.length) return { rows, issues: [] }
 const yearFor = (month: string) => (workspace ? periodForKey(workspace, month).endDate : month).slice(0, 4)
 const firstYear = yearFor(months[0]), assumptionYear = settings.year ?? 2026
 const retail = workspace?.calendar === '4-4-5' || workspace?.calendar === '5-4-4'
 const money = (n: number) => formatMoney(n, currency)
 for (const p of positions) {
  const positionMonths = months.filter(month => active(p, month))
  if (!positionMonths.length) continue
  const monthly = Number(BigInt(p.annualSalaryCents) / 12n)
  const target = mulDiv(p.annualSalaryCents, positionMonths.length, 12)
  let year = '', ytd = 0
  for (const [index, month] of positionMonths.entries()) {
   const calendarYear = yearFor(month)
   if (year !== calendarYear) {
    year = calendarYear
    ytd = year === firstYear ? p.taxYtdWagesCents ?? 0 : 0
   }
   const last = index === positionMonths.length - 1
   const wagesCents = last ? target - monthly * (positionMonths.length - 1) : monthly
   const opening = ytd, contractor = p.employmentType === '1099'
   const capped = (base: number) => contractor ? 0 : Math.min(wagesCents, Math.max(0, base - opening))
   const ssWages = capped(settings.socialSecurityBaseCents)
   const futaWages = capped(settings.futaBaseCents), sutaWages = capped(settings.sutaBaseCents)
   // Difference of rounded cumulative liabilities conserves cents at every
   // annual cap; independently rounding each month can exceed the maximum.
   const liability = (rate:number,base=Number.MAX_SAFE_INTEGER) => contractor ? 0 : mulDiv(Math.min(base,sum(opening,wagesCents)),rate,10000)-mulDiv(Math.min(base,opening),rate,10000)
   const socialSecurityCents = liability(settings.socialSecurityBps,settings.socialSecurityBaseCents)
   const medicareCents = liability(settings.medicareBps)
   const futaCents = liability(settings.futaBps,settings.futaBaseCents)
   const sutaCents = liability(settings.sutaBps,settings.sutaBaseCents)
   const totalCents = sum(socialSecurityCents, medicareCents, futaCents, sutaCents)
   ytd = sum(opening, wagesCents)
   const wageTrace = `Salary before on-costs: ${money(p.annualSalaryCents)} a year ÷ 12, ordinary months rounded down to ${money(monthly)}; ${positionMonths.length} active plan months target ${money(target)}${last ? `; final active month receives the remainder, wages ${money(wagesCents)}` : `; wages ${money(wagesCents)}`}. ${year} opening YTD wages ${money(opening)} + wages ${money(wagesCents)} = YTD ${money(ytd)}; ${retail ? `retail planning convention assigns all period wages to the calendar year of the period end (${periodForKey(workspace!, month).endDate}); annual wage caps reset with the first period ending in a new calendar year` : 'annual wage caps reset in January'}.`
   const taxTrace = contractor ? '1099 contractor: employer Social Security, Medicare, FUTA and SUTA are zero.'
    : `Employer tax assumptions for ${assumptionYear}, applied to ${year}: Social Security taxable wages ${money(ssWages)} (annual base ${money(settings.socialSecurityBaseCents)}) × ${formatBps(settings.socialSecurityBps)} = ${money(socialSecurityCents)}; Medicare uncapped wages ${money(wagesCents)} × ${formatBps(settings.medicareBps)} = ${money(medicareCents)}; FUTA taxable wages ${money(futaWages)} (annual base ${money(settings.futaBaseCents)}) × entered ${formatBps(settings.futaBps)} = ${money(futaCents)}, without an automatically applied state credit; SUTA taxable wages ${money(sutaWages)} (annual base ${money(settings.sutaBaseCents)}) × ${formatBps(settings.sutaBps)} = ${money(sutaCents)}. Each cumulative component rounds half away from zero once; this month is the change in cumulative liability, preserving the annual cap exactly; employer Medicare has no additional Medicare tax. Employer taxes total ${money(totalCents)}, added separately from salary and on-costs.`
   rows.push({ originId: p.originId, month, line: p.line, department: p.department, wagesCents, socialSecurityCents, medicareCents, futaCents, sutaCents, totalCents, ytdWagesCents: ytd, trace: `${wageTrace} ${taxTrace}` })
  }
 }
 return { rows, issues: [] }
}
