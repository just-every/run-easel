import type { CSSProperties } from 'react'
import { Check, Mascot, Spark } from '../kit'
import { at, Plot, type Scale, x, y } from '../plot'
import { FLOOR, PICKED_2027 } from '../records'
import '../styles/interlude.css'

const CAPS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const year: Scale = { count: 12, min: 1_960_000, max: 2_520_000 }
// The arrowhead follows the Nov → Dec slope on screen, so it is turned for each width's plot proportions.
const turn = (ratio: number) => {
 const dx = (x(year, 11) - x(year, 10)) * ratio, dy = y(year, PICKED_2027[11]) - y(year, PICKED_2027[10])
 return `${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2)}deg`
}
const head: CSSProperties = { ...at(year, 11, PICKED_2027[11]), ['--turn-wide' as string]: turn(2.4), ['--turn-phone' as string]: turn(1.35) }
const MOMENTS = [
 { i: 2, cls: 'm-mar', month: 'Mar 2027', title: 'Lowest cash $2,022,500', line: <>floor kept <span className="ok">✓</span></> },
 { i: 4, cls: 'm-may', month: 'May 2027', title: '3 account executives start', line: 'Ridgeway paid' },
 { i: 11, cls: 'm-dec', month: 'Dec 2027', title: '168 people', line: 'cash $2,477,750' },
]

/** 07: no heading. The mascot draws the picked plan's 2027 out of its canvas, over the floor, month by month. */
export function Interlude() {
 return <section className="interlude" aria-label="The year, drawn">
  <div className="wrap interlude-grid">
   <div className="mascot">
    <Spark className="spark-m1" /><Spark className="spark-m2" />
    <Mascot />
   </div>
   <div className="year">
    <Plot scale={year} className="year-plot" lines={[{ values: PICKED_2027, className: 'line-year', curve: 'monotone' }]}>
     <span className="floor-dots" style={{ top: at(year, 0, FLOOR).top }} aria-hidden="true" />
     <span className="floor-name" style={{ top: at(year, 0, FLOOR).top }}>floor $2,000,000</span>
     {MOMENTS.map(m => <i key={m.i} className="year-dot" style={at(year, m.i, PICKED_2027[m.i])} aria-hidden="true" />)}
     <i className="year-head" style={head} aria-hidden="true" />
     <Spark className="spark-head" />
     <ol className="caps" style={{ top: at(year, 0, FLOOR).top }} aria-hidden="true">
      <li className="caps-year">2027</li>
      {CAPS.map((m, i) => <li key={m} style={{ left: at(year, i, 0).left }}><span className="cap-wide">{m}</span><span className="cap-phone">{m[0]}</span></li>)}
     </ol>
    </Plot>
    <ol className="moments">
     {MOMENTS.map(m => <li key={m.i} className={`card moment ${m.cls}`} style={at(year, m.i, PICKED_2027[m.i])}>
      <Check />
      <p><span className="muted">{m.month}</span><strong>{m.title}</strong><span>{m.line}</span></p>
     </li>)}
    </ol>
    <p className="visually-hidden">Closing cash through 2027 on the picked plan: lowest $2,022,500 in March, above the $2,000,000 floor, then climbing to $2,477,750 in December.</p>
   </div>
  </div>
 </section>
}
