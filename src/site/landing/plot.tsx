import type { CSSProperties, ReactNode } from 'react'

// A plot area whose lines are SVG and whose dots, notes and labels are HTML placed at the same coordinates, so the
// drawing stretches to any width while every word stays type at its own size.

export type Scale = { count: number; min: number; max: number }
export const x = ({ count }: Scale, i: number) => count < 2 ? 50 : (i / (count - 1)) * 100
export const y = ({ min, max }: Scale, value: number) => (1 - (value - min) / (max - min)) * 100
/** The CSS position of point `i` at `value`, in percent of the plot area. */
export const at = (scale: Scale, i: number, value: number): CSSProperties => ({ left: `${x(scale, i)}%`, top: `${y(scale, value)}%` })

export type Line = { values: number[]; className: string; curve?: 'linear' | 'monotone'; dots?: boolean }

function points(scale: Scale, values: number[]) { return values.map((value, i) => [x(scale, i), y(scale, value)] as const) }

function linear(scale: Scale, values: number[]) { return points(scale, values).map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(3)} ${py.toFixed(3)}`).join('') }

/** A monotone cubic (Fritsch–Carlson): passes through every point and never overshoots between them. */
function monotone(scale: Scale, values: number[]) {
 const p = points(scale, values)
 const n = p.length
 const d = p.slice(1).map(([px, py], i) => (py - p[i][1]) / (px - p[i][0]))
 const m = p.map((_, i) => i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
 for (let i = 0; i < n - 1; i++) {
  if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
  const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b
  if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i] }
 }
 let path = `M${p[0][0].toFixed(3)} ${p[0][1].toFixed(3)}`
 for (let i = 0; i < n - 1; i++) {
  const h = (p[i + 1][0] - p[i][0]) / 3
  path += `C${(p[i][0] + h).toFixed(3)} ${(p[i][1] + m[i] * h).toFixed(3)} ${(p[i + 1][0] - h).toFixed(3)} ${(p[i + 1][1] - m[i + 1] * h).toFixed(3)} ${p[i + 1][0].toFixed(3)} ${p[i + 1][1].toFixed(3)}`
 }
 return path
}

export function Plot({ scale, lines, floor, className, children }: { scale: Scale; lines: Line[]; floor?: number; className?: string; children?: ReactNode }) {
 return <div className={`plot${className ? ` ${className}` : ''}`}>
  <svg className="plot-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
   {floor === undefined ? null : <path className="plot-floor" d={`M0 ${y(scale, floor).toFixed(3)}H100`} />}
   {lines.map(line => <path key={line.className} className={line.className} d={line.curve === 'monotone' ? monotone(scale, line.values) : linear(scale, line.values)} />)}
  </svg>
  {lines.filter(line => line.dots).flatMap(line => line.values.map((value, i) => <i key={`${line.className}-${i}`} className={`plot-dot ${line.className}`} style={at(scale, i, value)} aria-hidden="true" />))}
  {children}
 </div>
}
