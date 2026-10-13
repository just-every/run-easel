import { ClosingCashChart } from '../../ui/chart'
import { addMonths } from '../../ui/shared'

// The hero's drawing: the app's own Closing cash chart over a sample year. The
// two plans share the closed months (both carry the same actuals) and part
// after them; the forecast closes June 2027 at $604,450.00.
export const months = Array.from({ length: 12 }, (_, i) => addMonths('2026-07', i))
export const forecast = { name: 'FY2027 forecast', values: [18420000, 20910000, 23610000, 26588556, 29845667, 33381334, 37195556, 41288334, 45659667, 50309556, 55238000, 60445000] }
export const downside = { name: 'Downside: slower hiring', values: [18420000, 20910000, 22180000, 23720000, 25430000, 27440000, 29610000, 32050000, 34680000, 37520000, 41260000, 45630000] }
const label = 'Closing cash by month, FY2027 forecast and the downside with slower hiring; both stay above zero; $604,450.00 at June 2027.'

export function ClosingCashDrawing({ size = 'hero', ticks = false, axis = 'ends' }: { size?: 'hero' | 'small'; ticks?: boolean; axis?: 'ends' | 'quarters' }) {
 return <ClosingCashChart size={size} ticks={ticks} axis={axis} table={false} label={label} months={months} actualsThrough="2026-08" series={[forecast, downside]} />
}
