import { monthLabel } from '../shared'

// The root card's monthly closing cash: the forecast grey and dotted, the chosen option green, the agreed floor a red
// dashed line. Lines are an SVG in percent with non-scaling strokes; dots and labels are HTML at the same percentages
// so text never scales.
type Props = { months: string[]; forecast: number[]; option: number[] | null; floor: number | null; label: string }

const tick = (cents: number) => { const d = cents / 100; return Math.abs(d) >= 1e6 ? `${+(d / 1e6).toFixed(1)}M` : Math.abs(d) >= 1e3 ? `${Math.round(d / 1e3)}K` : String(d) }

export function Sparkline({ months, forecast, option, floor, label }: Props) {
 const all = [...forecast, ...(option ?? []), ...(floor === null ? [] : [floor])]
 const span = Math.max(...all) - Math.min(0, ...all) || 1, raw = span / 2, power = 10 ** Math.floor(Math.log10(raw)), unit = raw / power
 const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
 const top = Math.max(step, Math.ceil(Math.max(...all) / step) * step), bottom = Math.min(0, Math.floor(Math.min(...all) / step) * step)
 const n = months.length
 const x = (i: number) => (n < 2 ? 50 : 2 + (i * 96) / (n - 1))
 const y = (v: number) => 100 - ((v - bottom) / (top - bottom)) * 100
 const path = (values: number[]) => values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
 const ticks = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => bottom + i * step)
 const marks = months.map((m, i) => ({ m, i })).filter(({ m, i }) => i === 0 || ['01', '04', '07', '10'].includes(m.slice(5)))
 return <figure className="t-spark">
  <div className="t-spark-ticks" aria-hidden="true">{ticks.map(v => <span key={v} style={{ top: `${y(v)}%` }}>{tick(v)}</span>)}</div>
  <div className="t-spark-plot">
   <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}>
    <title>{label}</title>
    {floor !== null && <line className="t-spark-floor" x1="0" x2="100" y1={y(floor)} y2={y(floor)} vectorEffect="non-scaling-stroke" />}
    <polyline className={option ? 't-spark-old' : 't-spark-now'} points={path(forecast)} vectorEffect="non-scaling-stroke" />
    {option && <polyline className="t-spark-new" points={path(option)} vectorEffect="non-scaling-stroke" />}
   </svg>
   {forecast.map((v, i) => <i key={`f${i}`} className={option ? 't-dot t-dot-old' : 't-dot t-dot-now'} style={{ left: `${x(i)}%`, top: `${y(v)}%` }} />)}
   {option?.map((v, i) => <i key={`o${i}`} className="t-dot t-dot-new" style={{ left: `${x(i)}%`, top: `${y(v)}%` }} />)}
  </div>
  <div className="t-spark-axis" aria-hidden="true">{marks.map(({ m, i }) => { const [month, year] = monthLabel(m).split(' '); return <span key={m} style={{ left: `${x(i)}%` }}>{month}{(i === 0 || month === 'Jan') && <><br />{year}</>}</span> })}</div>
 </figure>
}
