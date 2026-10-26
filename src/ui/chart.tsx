import { money, monthLabel } from './shared'

// The Closing cash chart: twelve months of closing cash on graph paper, the
// first series solid green with its last value boxed, a comparison grey dotted,
// closed months under a pale band. The plot stretches to any width: lines are
// an SVG drawn in percent with non-scaling strokes, while dots and labels are
// HTML placed at the same percentages, so text never scales. A visually hidden
// table carries every value. The app's Overview and Compare and every landing
// drawing use this one component.

export type ChartSeries = { name: string; values: number[] }
type Props = {
 months: string[]
 /** Closing cash in cents: the first series solid, an optional second dashed. */
 series: ChartSeries[]
 actualsThrough?: string | null
 currency?: string
 /** The accessible name of the drawing. */
 label: string
 title?: string
 /** Month labels under the plot: every month, each quarter's first and the last, or the first two and the last. */
 axis?: 'every' | 'quarters' | 'ends' | 'years'
 ticks?: boolean
 size?: 'app' | 'hero' | 'small'
 /** Decorative: hidden from assistive technology, no series needed. */
 decorative?: boolean
 /** The visually hidden table of every value; a landing drawing's accessible name stands in for it. */
 table?: boolean
}

const EDGE = 3
const x = (i: number, n: number) => (n < 2 ? 50 : EDGE + (i * (100 - 2 * EDGE)) / (n - 1))

function niceStep(range: number) {
 const raw = range / 4, power = 10 ** Math.floor(Math.log10(raw)), unit = raw / power
 return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power
}
const tickText = (cents: number) => { const dollars = cents / 100, abs = Math.abs(dollars); return abs >= 1e6 ? `${+(dollars / 1e6).toFixed(1)}M` : abs >= 1e3 ? `${+(dollars / 1e3).toFixed(0)}K` : String(dollars) }

export function ClosingCashChart({ months, series, actualsThrough, currency = 'AUD', label, title = 'Closing cash', axis: asked = 'every', ticks = false, size = 'app', decorative = false, table = true }: Props) {
 const n = months.length
 // A rolling forecast longer than a year labels every third month: every month would collide.
 const axis = asked === 'every' && n > 13 ? 'quarters' : asked
 const all = series.flatMap(s => s.values)
 const low = Math.min(0, ...all), high = Math.max(1, ...all)
 const step = all.length ? niceStep(high - low) : 20000000
 const bottom = Math.floor(low / step) * step, top = all.length ? Math.ceil(high / step) * step : step * 4
 const y = (v: number) => 100 - ((v - bottom) / (top - bottom)) * 100
 const tickValues = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => bottom + i * step)
 const closed = actualsThrough ? months.filter(m => m <= actualsThrough).length : 0
 const bandEnd = closed === 0 ? 0 : closed >= n ? 100 : (x(closed - 1, n) + x(closed, n)) / 2
 const shown = (axis === 'every' ? months.map((_, i) => i) : axis === 'years' ? [...months.map((_, i) => i).filter(i => i % 12 === 0), n - 1] : axis === 'quarters' ? months.map((_, i) => i).filter(i => i % 3 === 0 || i === n - 1) : [0, 1, n - 1]).filter((i, k, list) => i >= 0 && i < n && list.indexOf(i) === k)
 // Every month sits under its point. The short axes mark edges instead: the first month at the plot's left, the
 // last closed month at the band's end, the last month at the plot's right.
 const axisPlace = (i: number) => axis === 'every' || (i > 0 && i < n - 1 && !(axis === 'ends' && bandEnd > 0)) ? { className: axis !== 'every' ? 'cc-axis-mid' : (n - 1 - i) % 2 ? 'cc-axis-odd' : i === n - 1 ? 'cc-axis-end' : undefined, style: { left: `${x(i, n)}%` } }
  : i === 0 ? { className: 'cc-axis-start', style: { left: '0%' } }
  : i === n - 1 ? { className: 'cc-axis-end', style: { left: '100%' } }
  : { className: 'cc-axis-end cc-axis-mid', style: { left: `${bandEnd}%` } }
 const [solid, dashed] = series
 const path = (values: number[]) => values.map((v, i) => `${x(i, n).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
 const last = solid?.values.length ? solid.values.length - 1 : -1
 return <figure className={`cc cc-${size} cc-axis-${axis}`} aria-hidden={decorative || undefined}>
  {!decorative && <figcaption className="cc-head">
   <span className="cc-title">{title}</span>
   <span className="cc-legend">{series.map((s, i) => <span key={s.name} className={i ? 'cc-key cc-key-dashed' : 'cc-key'}>{s.name}</span>)}</span>
  </figcaption>}
  <div className={ticks ? 'cc-frame cc-with-ticks' : 'cc-frame'}>
   {ticks && <div className="cc-ticks" aria-hidden="true">{tickValues.map(v => <span key={v} style={{ top: `${y(v)}%` }}>{tickText(v)}</span>)}</div>}
   <div className="cc-plot">
    {bandEnd > 0 && <div className="cc-band" style={{ width: `${bandEnd}%` }}><span className="cc-band-label">← Actuals →</span></div>}
    <svg className="cc-lines" viewBox="0 0 100 100" preserveAspectRatio="none" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label}>
     {!decorative && <title>{label}</title>}
     {dashed && <polyline className="cc-line cc-line-dashed" points={path(dashed.values)} vectorEffect="non-scaling-stroke" />}
     {solid && <polyline className="cc-line" points={path(solid.values)} vectorEffect="non-scaling-stroke" />}
    </svg>
    {series.map((s, k) => s.values.map((v, i) => <i key={`${k}-${i}`} className={k ? 'cc-dot cc-dot-dashed' : i === last ? 'cc-dot cc-dot-last' : 'cc-dot'} style={{ left: `${x(i, n)}%`, top: `${y(v)}%` }} aria-hidden="true" />))}
    {last >= 0 && <span className="cc-value" style={{ right: `${100 - x(last, n)}%`, top: `${y(solid.values[last])}%` }}>{money(solid.values[last], currency)}</span>}
   </div>
   <div className="cc-axis" aria-hidden={decorative || undefined}>{shown.map(i => { const [month, year] = monthLabel(months[i]).split(' '); return <span key={i} {...axisPlace(i)}><span>{month}</span> <span>{year}</span></span> })}</div>
  </div>
  {!decorative && table && <div className="visually-hidden"><table>
   <caption>{title} by month</caption>
   <thead><tr><th scope="col">Month</th>{series.map(s => <th key={s.name} scope="col">{s.name}</th>)}</tr></thead>
   <tbody>{months.map((m, i) => <tr key={m}><th scope="row">{monthLabel(m)}</th>{series.map(s => <td key={s.name}>{money(s.values[i], currency)}</td>)}</tr>)}</tbody>
  </table></div>}
 </figure>
}

/** The chart's style, on Easel's tokens (tokens.ts); the app and the run site both include it. */
export const chartStyle = `
.cc{margin:0;font-variant-numeric:tabular-nums}
.cc-head{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:flex-start;justify-content:space-between;margin:0 0 16px}
.cc-title{font-family:var(--display);font-size:21px;line-height:1.2;font-weight:800;letter-spacing:-.025em;color:var(--ink)}
.cc-legend{display:grid;gap:4px;font-size:14px;color:var(--ink)}
.cc-key{display:flex;align-items:center;gap:10px}
.cc-key::before{content:"";width:30px;border-top:3px solid var(--green)}
.cc-key-dashed::before{border-top:3px dotted #a6a9b3}
.cc-frame{position:relative;padding-bottom:28px}
.cc-with-ticks{padding-left:44px}
.cc-plot{position:relative;height:220px;background:var(--graph-paper);border-bottom:1px solid var(--hair-strong)}
.cc-hero .cc-plot{height:340px}
.cc-small .cc-plot{height:180px}
.cc-band{position:absolute;left:0;top:0;bottom:0;background:#f4f4f7;opacity:.9;border-right:1px dashed var(--hair-strong)}
.cc-band-label{position:absolute;left:50%;top:14px;transform:translateX(-50%);white-space:nowrap;font-size:13px;color:var(--muted)}
.cc-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cc-line{fill:none;stroke:var(--green);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round}
.cc-line-dashed{stroke:#a6a9b3;stroke-dasharray:1 6}
.cc-dot{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:var(--green)}
.cc-dot-dashed{width:6px;height:6px;margin:-3px 0 0 -3px;background:#b3b6bf}
.cc-dot-last{width:11px;height:11px;margin:-5.5px 0 0 -5.5px}
.cc-value::after{content:"";position:absolute;right:-1px;bottom:-18px;height:18px;border-left:1px solid var(--green);transform:rotate(34deg);transform-origin:top}
.cc-value{position:absolute;transform:translate(-8px,calc(-100% - 15px));padding:3px 10px;border:1px solid var(--green-line);border-radius:8px;background:var(--green-soft);color:var(--green-ink);font-size:14px;font-weight:700;line-height:1.3;white-space:nowrap}
.cc-ticks{position:absolute;left:0;top:0;bottom:28px;width:36px}
.cc-ticks span{position:absolute;right:0;transform:translateY(-50%);font-size:13px;color:var(--muted);white-space:nowrap;overflow-wrap:normal}
.cc-axis{position:absolute;left:0;right:0;bottom:0;height:22px}
.cc-with-ticks .cc-axis{left:44px}
.cc-axis>span{position:absolute;top:6px;transform:translateX(-50%);white-space:nowrap;font-size:12px;color:var(--muted)}
.cc-axis>span.cc-axis-start{transform:none}
.cc-axis>span.cc-axis-end{transform:translateX(-100%)}
/* In the app every axis label stacks month over year, so neighbouring months never meet. */
.cc-app .cc-frame{padding-bottom:40px}.cc-app .cc-axis{height:34px}.cc-app .cc-ticks{bottom:40px}
.cc-app .cc-axis>span>span{display:block;text-align:center;line-height:1.25}
.cc-app .cc-axis>span.cc-axis-end>span{text-align:right}.cc-app .cc-axis>span.cc-axis-start>span{text-align:left}
.cc-hero .cc-axis>span,.cc-small .cc-axis>span{font-size:13px;color:var(--ink)}
.cc-axis-ends .cc-frame{padding-bottom:44px}.cc-axis-ends .cc-axis{height:40px}
.cc-axis-ends .cc-axis>span>span{display:block;line-height:1.3}
.cc-axis-ends .cc-axis>span.cc-axis-end{text-align:right}
.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (max-width:760px){
 .cc-plot{height:200px}.cc-hero .cc-plot{height:260px}
 .cc-frame{padding-bottom:40px}.cc-axis{height:34px}.cc-ticks{bottom:40px}
 .cc-app .cc-axis>span{font-size:11px}
 .cc-value{font-size:13px}
 .cc-band-label{left:6px;transform:none;font-size:12px}
 .cc-axis>span.cc-axis-mid,.cc-axis>span.cc-axis-odd{display:none}
 .cc-axis-ends .cc-frame{padding-bottom:28px}.cc-axis-ends .cc-axis{height:22px}
 .cc-axis-ends .cc-axis>span>span{display:inline}
}
`
