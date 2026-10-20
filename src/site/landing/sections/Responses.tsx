import { Cursor, Heading, Spark, Sticky } from '../kit'
import { at, Plot, type Scale } from '../plot'
import { FLOOR, OLD_2027, PICKED_2027, short } from '../records'
import '../styles/responses.css'

const JAN_JUN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
const strip: Scale = { count: 6, min: 1_800_000, max: 2_400_000 }
const OPTIONS = [
 { n: 1, title: 'Draw $100,000 on the line of credit', sub: 'Mon Mar 1', low: '$2,010,000', cost: 'interest $791.67 a month at 9.5%' },
 { n: 2, title: '3 sales hires Feb → May', sub: 'account executives #4–6 start Mon May 3, not Mon Feb 1', low: '$2,022,500', cost: '$96,000 of FY2027 revenue later', picked: true },
 { n: 3, title: 'Events and paid media −$90,000', sub: 'Feb – Mar', low: '$2,000,000', cost: 'Q2 pipeline −$360,000' },
]

/** 04: the recovery. Three least-change responses; Rachel picks one and the forecast moves. */
export function Responses() {
 return <section className="responses" aria-labelledby="responses-title">
  <div className="wrap">
   <div className="heading-block center">
    <Heading id="responses-title" className="center" eyebrow="Responses · Tue Oct 13 – Wed Oct 14" lines={['Three ways back.', 'Rachel picked one.']} />
    <p className="lede">The agent returned three changes that each restore the floor with the least it takes. Rachel chose, and the forecast moved.</p>
    <p className="levers">Adjustable levers: hire starts (whole quarters) · discretionary spend · line of credit ($50,000 draws)</p>
   </div>
   <ol className="options">
    {OPTIONS.map(o => <li key={o.n} className={`card option${o.picked ? ' picked' : ''}`}>
     {o.picked ? <Spark className="spark-option" /> : null}
     <p className="option-n">Option {o.n}</p>
     {o.picked ? <span className="tag tag-green">✓ Picked</span> : null}
     <h3>{o.title}</h3>
     <p className="option-sub">{o.sub}</p>
     <p className="option-low">lowest cash {o.low} <span aria-hidden="true">✓</span></p>
     <p className="option-cost">{o.cost}</p>
     <p className="option-cells">12 cells moved · <span className="u">Open</span></p>
     <span className="pick" aria-hidden="true">Pick</span>
     {o.picked ? <Cursor name="Rachel" className="cur-pick" /> : null}
    </li>)}
   </ol>
   <p className="pill pill-green picked-pill"><span><strong>Rachel picked Option 2</strong> · Wed Oct 14, 8:40 am · forecast rev 213 · <strong>runway 31 months</strong> · floor kept <span className="ok">✓</span></span></p>
   <figure className="card strip">
    <figcaption className="strip-head">
     <span className="strip-title">Lowest months · Jan – Jun 2027</span>
     <span className="legend"><span className="key key-old">Old forecast</span><span className="key key-picked">Picked plan</span></span>
    </figcaption>
    <div className="strip-body" role="img" aria-label="Jan to Jun 2027 closing cash: the old forecast falls to $1,910,000 in March and $1,936,000 in April, under the $2,000,000 floor; the picked plan's March is $2,022,500.">
     <ol className="strip-y" aria-hidden="true">{[2_400_000, 2_200_000, 2_000_000, 1_800_000].map(t => <li key={t}>{short(t, 1)}</li>)}</ol>
     <Plot scale={strip} floor={FLOOR} className="strip-plot" lines={[{ values: OLD_2027.slice(0, 6), className: 'line-old', dots: true }, { values: PICKED_2027.slice(0, 6), className: 'line-picked', dots: true }]}>
      <i className="ring ring-red" style={at(strip, 2, OLD_2027[2])} />
      <span className="strip-floor" style={{ top: at(strip, 0, FLOOR).top }} aria-hidden="true">$2,000,000 floor</span>
     </Plot>
     <ol className="strip-x" aria-hidden="true">{JAN_JUN.map((m, i) => <li key={m} style={{ left: at(strip, i, 0).left }}>{m}</li>)}</ol>
     <Sticky className="strip-sticky">No debt, pipeline intact.</Sticky>
     <svg className="connector c-strip" viewBox="0 0 100 60" aria-hidden="true"><path d="M96 8C70 6 44 22 22 52" /><path className="head" d="M20 41 21 53 31 49" /></svg>
    </div>
   </figure>
  </div>
 </section>
}
