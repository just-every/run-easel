import { ClosingCashChart } from '../../ui/chart'
import { addMonths } from '../../ui/shared'

// Public API capture of the seeded forecast and its sole change: delaying the
// Engineer's start from Oct 2026 to Jan 2027. Closed months share actuals.
const months = Array.from({ length: 12 }, (_, i) => addMonths('2026-07', i))
const forecast = { name: 'FY2027 forecast', values: [79080000, 77264950, 80289950, 82742750, 86051150, 89142750, 91628484, 94272618, 97132752, 100264086, 103661820, 107319950] }
const downside = { name: 'Downside: slower hiring', values: [79080000, 77264950, 80289950, 84142750, 88851150, 93342750, 95828484, 98472618, 101332752, 104464086, 107861820, 111519950] }
const label = 'Closing cash by month, actuals through Aug 2026: FY2027 forecast closes June 2027 at $1,073,199.50; Downside: slower hiring closes at $1,115,199.50 after delaying the Engineer start from Oct 2026 to Jan 2027, increasing cash by $42,000.00.'

export function CompareCashDrawing() {
 return <ClosingCashChart size="small" ticks axis="quarters" table={false} label={label} months={months} actualsThrough="2026-08" series={[forecast, downside]} />
}
