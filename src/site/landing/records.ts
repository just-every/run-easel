// The homepage's sample company, Tallgrass Software (Kansas City, Missouri), and every figure its drawings plot. One
// source for every chart, so the hero, the strip chart (04), the year line (07), the 13-week view (09) and the closing
// line (13) always agree. Whole US dollars; all times Central.

export const FLOOR = 2_000_000

/** Closing cash by month, Oct 2026 – Dec 2027: the forecast after Ridgeway slipped, and Rachel's pick (Option 2). */
export const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const OLD_FORECAST = [2_402_000, 2_331_000, 2_262_000, 2_196_000, 2_084_000, 1_910_000, 1_936_000, 2_128_000, 2_097_000, 2_141_000, 2_118_000, 2_166_000, 2_230_000, 2_301_000, 2_389_000]
/** Option 2 moves three account-executive starts Feb → May: +$18,750 a hire a month saved, $96,000 of revenue later. */
const OPTION_2 = [0, 0, 0, 0, 56_250, 112_500, 168_750, 168_750, 168_750, 168_750, 152_750, 136_750, 120_750, 104_750, 88_750]
export const PICKED = OLD_FORECAST.map((value, i) => value + OPTION_2[i])

/** 2027 alone (Jan – Dec), for the strip chart, the year line and the board forecast. */
export const YEAR_2027 = MONTHS.slice(3)
export const PICKED_2027 = PICKED.slice(3)
export const OLD_2027 = OLD_FORECAST.slice(3)
/** October closed $16,600 ahead of forecast, so the board forecast (Thu Nov 19) is the pick plus $16,600 a month. */
export const BOARD_2027 = PICKED_2027.map(value => value + 16_600)

/** The 13-week direct cash view from Mon Oct 19, 2026: each week's money in and out, payroll on its run date. */
export const OPENING_BANK = 2_450_000
const WEEK_FLOWS: [week: string, cashIn: number, cashOut: number, payroll?: string, note?: string][] = [
 ['Oct 19', 412_000, 268_000],
 ['Oct 26', 402_300, 594_300, 'Fri Oct 30'],
 ['Nov 2', 391_200, 241_600],
 ['Nov 9', 371_800, 604_500, 'Fri Nov 13'],
 ['Nov 16', 362_700, 214_400],
 ['Nov 23', 341_400, 601_900, 'Fri Nov 27'],
 ['Nov 30', 436_100, 244_300],
 ['Dec 7', 352_600, 592_700, 'Fri Dec 11'],
 ['Dec 14', 398_900, 222_500],
 ['Dec 21', 387_000, 600_500, 'Thu Dec 24', 'moved from Fri Dec 25'],
 ['Dec 28', 318_900, 178_200],
 ['Jan 4', 452_600, 594_100, 'Fri Jan 8'],
 ['Jan 11', 318_200, 207_300],
]
export type Week = { week: string; open: number; close: number; cashIn: number; cashOut: number; net: number; payroll?: string; note?: string }
export const WEEKS: Week[] = WEEK_FLOWS.reduce<Week[]>((weeks, [week, cashIn, cashOut, payroll, note]) => {
 const open = weeks.length ? weeks[weeks.length - 1].close : OPENING_BANK
 return [...weeks, { week, open, close: open + cashIn - cashOut, cashIn, cashOut, net: cashIn - cashOut, payroll, note }]
}, [])

// The four anchors every 13-week drawing states: Oct 31 and Dec 31 equal the monthly forecast, week 13 and the lowest week.
const anchors: [string, number, number][] = [
 ['Oct 31', WEEKS[1].close, OLD_FORECAST[0]],
 ['Dec 31', WEEKS[10].close, OLD_FORECAST[2]],
 ['week 13', WEEKS[12].close, 2_231_400],
 ['lowest week', Math.min(...WEEKS.map(w => w.close)), 2_120_500],
]
for (const [name, actual, expected] of anchors) if (actual !== expected) throw Error(`13-week cash: ${name} closes ${actual}, the records say ${expected}`)

/** HubSpot Q1 2027 pipeline: $2.4M open, $860,000 weighted, by stage. */
export const PIPELINE = [
 { stage: 'Contract sent', probability: 90, open: 310_000 },
 { stage: 'Proposal', probability: 60, open: 380_000 },
 { stage: 'Demo', probability: 30, open: 910_000 },
 { stage: 'Discovery', probability: 10, open: 800_000 },
]

/** Headcount by department, now (Gusto, Tue Oct 20) and planned for Dec 2027. */
export const DEPARTMENTS: [name: string, now: number, planned: number][] = [
 ['Sales', 22, 30], ['Marketing', 10, 12], ['Customer Success', 14, 17], ['Engineering', 48, 56],
 ['Product', 12, 14], ['Support', 16, 18], ['People', 6, 6], ['G&A', 14, 15],
]

export const usd = (value: number) => `$${value.toLocaleString('en-US')}`
/** $2.45M, $860K style, for axis ticks and short labels. */
export const short = (value: number, digits = 2) => value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(digits).replace(/\.?0+$/, '')}M` : `$${Math.round(value / 1000)}K`
/** $2.0M style, one decimal always: axis ticks that step by $0.1M or more. */
export const tick = (value: number) => `$${(value / 1_000_000).toFixed(1)}M`
/** +$144.0K / −$192.0K: a week's net movement. */
export const netK = (value: number) => `${value < 0 ? '−' : '+'}$${(Math.abs(value) / 1000).toFixed(1)}K`
