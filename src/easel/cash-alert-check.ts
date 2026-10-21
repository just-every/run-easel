// Scheduled cash alerts (REPORT-006). Enabled finance rules are checked after
// accepted or undone actuals refreshes, month closes, cash-constraint and rule
// saves, finance's explicit check and the daily company-zone scheduled check.
// A breach opens one alert that notifies active finance once; the alert sends
// again only when the breach worsens or after the rule's interval in company
// days. Unavailable inputs are visible reasons, never a zero or a conclusion.
import { workingCalculation } from './calculation'
import { cashHealth } from './cash-health'
import { addDays } from './calendar-time'
import { financeEmails } from './calendar'
import type { Context } from './context'
import type { Calculation, CashMonth } from './engine'
import { workspace } from './model'
import { monthLabel } from './months'
import { notify } from './notify'
import { snapshot } from './store'
import { Fault, all, put, uid, type Data } from './types'
import { formatHundredths, formatMoney, mulDiv } from './units'

const CAUSES: Record<string, (detail: Data) => string> = {
 'actuals-accepted': d => `accepted actuals file ${d.file}`,
 'actuals-undone': d => `undid actuals file ${d.file}`,
 'close-month': d => `closed ${monthLabel(d.month)}`,
 'cash-constraints': () => 'changed the agreed cash floor or runway minimum',
 'cash-alert-rule-save': () => 'saved a cash alert rule',
 'cash-alert-check': () => 'ran a cash alert check',
}
export const needsCashAlertCheck = (c: Context) => c.activity.some(e => e.action in CAUSES)

/** YYYY-MM-DD of an instant in the company zone. */
export const zoneDate = (instant: string, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant))

type Finding = { state: 'breach'; numbers: Data; headline: string; detail: string[] } | { state: 'clear' } | { state: 'blocked'; reason: string }
const blocked = (reason: string): Finding => ({ state: 'blocked', reason })
const clear: Finding = { state: 'clear' }

const forecastMonths = <T extends { month: string }>(rows: T[], through: string | null) => rows.filter(r => !through || r.month > through)

function floorFinding(c: Context, forecast: Data, calc: Calculation): Finding {
 const agreement = workspace(c.s).cashAgreement
 if (!agreement) return blocked('Record an agreed cash floor under Overview before this rule can be checked.')
 if (agreement.currency !== calc.currency) return blocked(`The agreed cash floor is in ${agreement.currency}; the ${calc.currency} forecast cannot be checked against it.`)
 const future = forecastMonths<CashMonth>(calc.cash, forecast.actualsThrough ?? null)
 if (!future.length) return blocked('No forecast months remain after the latest closed month.')
 if (future.some(m => m.incompleteReasons?.length)) return blocked('Forecast cash is incomplete until the contract receipt allocation is resolved.')
 const crossing = future.find(m => m.closing < agreement.floorCents)
 if (!crossing) return clear
 const lowest = future.reduce((best, m) => m.closing < best.closing ? m : best)
 const money = (n: number) => formatMoney(n, calc.currency)
 return { state: 'breach', numbers: { floorCents: agreement.floorCents, crossingMonth: crossing.month, crossingCents: crossing.closing, lowestMonth: lowest.month, lowestCents: lowest.closing, gapCents: agreement.floorCents - lowest.closing },
  headline: `forecast cash falls below the ${money(agreement.floorCents)} floor in ${monthLabel(crossing.month)}`,
  detail: [`Crossing month: ${monthLabel(crossing.month)}, closing cash ${money(crossing.closing)}.`, `Lowest forecast cash: ${money(lowest.closing)} in ${monthLabel(lowest.month)}, ${money(agreement.floorCents - lowest.closing)} below the agreed floor of ${money(agreement.floorCents)}.`] }
}

function runwayFinding(rule: Data, forecast: Data, calc: Calculation): Finding {
 const health = cashHealth(calc.cash, forecast.actualsThrough ?? null, calc.currency, { floorCents: 0, runwayMinimumHundredths: rule.runwayHundredths, currency: calc.currency, by: rule.updatedBy, at: rule.updatedAt })
 const future = forecastMonths(health.months, forecast.actualsThrough ?? null)
 if (!future.length) return blocked('No forecast months remain after the latest closed month.')
 if (future.some(m => m.incompleteReasons?.length)) return blocked('Forecast cash is incomplete until the contract receipt allocation is resolved.')
 const r = future.find(m => m.runwayBreached)
 if (!r) return clear
 const money = (n: number) => formatMoney(n, calc.currency)
 const runway = r.runwayHundredths === null ? 'cash exhausted' : `${formatHundredths(r.runwayHundredths)} months`
 return { state: 'breach', numbers: { month: r.month, closingCents: r.closing, trailingNetBurnCents: r.trailingNetBurnCents, trailingMonths: r.trailingMonths, runwayHundredths: r.runwayHundredths, runwayBasis: r.runwayBasis, thresholdHundredths: rule.runwayHundredths },
  headline: `runway is ${runway} in ${monthLabel(r.month)}, below ${formatHundredths(rule.runwayHundredths)} months`,
  detail: [`First forecast month below the minimum: ${monthLabel(r.month)}.`, `Closing cash ${money(r.closing)}; net burn ${money(r.trailingNetBurnCents)} over ${r.trailingMonths} month${r.trailingMonths === 1 ? '' : 's'}; runway ${runway} (minimum ${formatHundredths(rule.runwayHundredths)} months).`] }
}

async function belowPlanFinding(c: Context, rule: Data, forecast: Data, calc: Calculation): Promise<Finding> {
 const month: string | null = forecast.actualsThrough ?? null
 if (!month) return blocked('No month is closed yet; actual cash starts with the first closed month.')
 const budget = await snapshot(c.db, forecast.budgetSnapshot)
 const planned = budget.body.calculation as Calculation
 if (planned.currency !== calc.currency) return blocked('The approved budget has a different currency; its cash cannot be compared.')
 const plan = planned.cash.find(m => m.month === month), actual = calc.cash.find(m => m.month === month)
 if (!plan) return blocked(`The approved budget has no plan for ${monthLabel(month)}.`)
 if (!actual || actual.incompleteReasons?.length || plan.incompleteReasons?.length) return blocked(`Cash for ${monthLabel(month)} is incomplete until the contract receipt allocation is resolved.`)
 const shortfall = plan.closing - actual.closing
 if (rule.basis === 'percent' && plan.closing <= 0) return blocked(`Planned cash for ${monthLabel(month)} is not positive, so a percentage shortfall has no value.`)
 const breached = rule.basis === 'amount' ? shortfall > rule.amountCents : BigInt(shortfall) * 10000n > BigInt(plan.closing) * BigInt(rule.percentBps)
 if (!breached) return clear
 const money = (n: number) => formatMoney(n, calc.currency)
 const shortfallBps = plan.closing > 0 ? mulDiv(shortfall, 10000, plan.closing) : null
 const threshold = rule.basis === 'amount' ? money(rule.amountCents) : `${formatHundredths(rule.percentBps)}%`
 return { state: 'breach', numbers: { month, actualCents: actual.closing, planCents: plan.closing, shortfallCents: shortfall, shortfallBps, budgetSnapshot: budget.id, budgetSha256: budget.sha256 },
  headline: `actual cash is ${money(shortfall)} below plan in ${monthLabel(month)}`,
  detail: [`${monthLabel(month)} closing cash: actual ${money(actual.closing)} against the approved budget's ${money(plan.closing)}, ${money(shortfall)}${shortfallBps === null ? '' : ` (${formatHundredths(shortfallBps)}%)`} below plan; this rule alerts above ${threshold}.`, 'Actual cash is the forecast closing cash on accepted actuals (ledger figures, not bank balances).', `Approved budget snapshot SHA-256 ${budget.sha256}.`] }
}

/** Worsening is an earlier crossing or breach month, lower cash, a larger shortfall or lower runway than at the last send. */
function worse(kind: string, now: Data, last: Data) {
 if (kind === 'floor') return now.crossingMonth < last.crossingMonth || now.lowestCents < last.lowestCents
 if (kind === 'below-plan') return now.shortfallCents > last.shortfallCents
 const rank = (n: Data) => n.runwayHundredths ?? Number.NEGATIVE_INFINITY
 return now.month < last.month || rank(now) < rank(last)
}

function causeOf(c: Context) {
 const causes = [...new Set(c.activity.filter(e => e.action in CAUSES).map(e => CAUSES[e.action](e.detail ?? {})))]
 return `${c.x.actor.email} ${causes.join('; ')}`
}

export function endAlert(c: Context, alert: Data, reason: string) {
 put(c.s, 'cash-alert', alert.id, { ...alert, status: 'ended', endedAt: c.now, endedReason: reason, revision: alert.revision + 1 })
 c.activity.push({ action: 'cash-alert-ended', record: alert.id, detail: { rule: alert.rule, reason } })
}

/** Checks every enabled rule against the operating forecast and records any sends. */
export async function evaluateCashAlerts(c: Context, scheduled?: { cause: string }) {
 const w = workspace(c.s), zone = w.timeZone ?? 'America/New_York'
 const forecast = all(c.s, 'scenario').find(s => s.kind === 'forecast' && !s.alternativeBudget)
 const pending = all(c.s, 'batch').some(b => ['importing', 'undoing'].includes(b.status))
 const cause = scheduled?.cause ?? causeOf(c)
 const sent: string[] = [], blockedRules: Data[] = [], notifications: string[] = []
 let calc: Calculation | null = null, calcError = ''
 for (const rule of all(c.s, 'cash-alert-rule').filter(r => r.enabled)) {
  let finding: Finding
  if (!forecast) finding = blocked('Approve the operating budget before cash alerts can be checked.')
  else if (pending) finding = blocked('Complete the in-progress actuals import before cash alerts can be checked.')
  else if (rule.currency !== w.currency) finding = blocked('The reporting currency changed; review and save this rule in the new currency.')
  else {
   if (!calc && !calcError) try { calc = await workingCalculation(c, forecast.id) } catch (e) { if (e instanceof Fault && e.status === 409) calcError = e.message; else throw e }
   finding = calcError || !calc ? blocked(calcError) : rule.kind === 'floor' ? floorFinding(c, forecast, calc) : rule.kind === 'runway' ? runwayFinding(rule, forecast, calc) : await belowPlanFinding(c, rule, forecast, calc)
  }
  put(c.s, 'cash-alert-rule', rule.id, { ...rule, lastCheckedAt: c.now, blocked: finding.state === 'blocked' ? finding.reason : '' })
  const open = all(c.s, 'cash-alert').find(a => a.rule === rule.id && a.status === 'open')
  if (finding.state === 'blocked') { blockedRules.push({ rule: rule.id, reason: finding.reason }); continue }
  if (finding.state === 'clear') { if (open) endAlert(c, open, `Cash no longer breaches this rule (${cause})`); continue }
  const last = open?.sends.at(-1)
  const reason = !open ? 'breach' : worse(rule.kind, finding.numbers, last.numbers) ? 'worse' : zoneDate(c.now, zone) >= addDays(zoneDate(last.at, zone), rule.intervalDays) ? 'interval' : null
  const id = open?.id ?? uid()
  if (!reason) { put(c.s, 'cash-alert', id, { ...open, current: finding.numbers, lastCheckedAt: c.now }); continue }
  const recipients = await financeEmails(c.db), n = (open?.sends.length ?? 0) + 1
  const why = reason === 'breach' ? 'New breach.' : reason === 'worse' ? 'The breach worsened since the last alert.' : `Still breached ${rule.intervalDays} company-zone day${rule.intervalDays === 1 ? '' : 's'} after the last alert.`
  const body = [why, ...finding.detail, `Cause: ${cause}.`, `Forecast ${forecast!.name} revision ${forecast!.revision}.`].join('\n')
  const ids = notify(c, 'cash-alert', recipients, { title: `${rule.name}: ${finding.headline}`, tab: 'overview', record: id, department: '', body }, { includeActor: true })
  const send = { n, at: c.now, reason, numbers: finding.numbers, headline: finding.headline, detail: finding.detail, cause, forecast: forecast!.id, forecastRevision: forecast!.revision, recipients, notifications: ids }
  put(c.s, 'cash-alert', id, open
   ? { ...open, current: finding.numbers, lastCheckedAt: c.now, sends: [...open.sends, send], revision: open.revision + 1 }
   : { rule: rule.id, ruleName: rule.name, ruleRevision: rule.revision, kind: rule.kind, currency: rule.currency, status: 'open', openedAt: c.now, current: finding.numbers, lastCheckedAt: c.now, sends: [send], acknowledgments: [], revision: 1 })
  c.activity.push({ action: 'cash-alert-sent', record: id, scenario: forecast!.id, detail: { rule: rule.id, ruleRevision: rule.revision, n, reason, recipients: recipients.length } })
  sent.push(id); notifications.push(...ids)
 }
 return { sent, blocked: blockedRules, notifications }
}
