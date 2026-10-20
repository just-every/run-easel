import { Cursor, Heading, Mascot, Spark } from '../kit'
import { at, Plot, type Scale } from '../plot'
import { BOARD_2027, FLOOR, YEAR_2027 } from '../records'
import { Actions } from './Hero'
import '../styles/closing.css'

const board: Scale = { count: 12, min: 1_940_000, max: 2_520_000 }
const MAR = 2

/** 13: board day. The plan holds; run Easel yourself with one line. */
export function Closing() {
 return <section className="closing" aria-labelledby="closing-title">
  <div className="wrap">
   <div className="closing-copy">
    <Heading id="closing-title" className="center" lines={['Thursday, November 19.', 'The plan holds.']} />
    <p className="closing-free">100% free and open source. MIT licensed.</p>
    <Actions demo={false} />
    <p className="terminal"><code>npx -y @runeditrun/rer dev <span className="nowrap">just-every/run-easel</span></code></p>
   </div>
   <div className="scene">
    <article className="card cover" aria-label="FY2027 plan">
     <p className="muted">Tallgrass Software</p>
     <h3>FY2027 plan</h3>
     <p className="cover-meet">board meeting Thu Nov 19</p>
     <p className="cover-formats"><span>PDF</span><span>PowerPoint</span><span>Excel</span></p>
     <p className="muted">published Wed Nov 18, 5:10 pm</p>
    </article>
    <figure className="card slim">
     <figcaption><strong>Monthly cash · Jan – Dec 2027 · board forecast</strong></figcaption>
     <div className="slim-body" role="img" aria-label="Board forecast closing cash, Jan to Dec 2027: lowest $2,039,100 in March, above the $2,000,000 floor, ending December at $2,494,350.">
      <Plot scale={board} floor={FLOOR} className="slim-plot" lines={[{ values: BOARD_2027, className: 'line-picked', dots: true }]}>
       <span className="slim-floor" style={{ top: at(board, 0, FLOOR).top }} aria-hidden="true">$2,000,000 floor</span>
       <i className="slim-stem" style={{ left: at(board, MAR, 0).left, height: at(board, MAR, BOARD_2027[MAR]).top }} aria-hidden="true" />
       <span className="slim-chip-at" style={{ left: at(board, MAR, 0).left }}><p className="slim-chip">Lowest cash $2,039,100 · Mar 2027 · floor $2,000,000 <span className="ok">✓</span></p><Cursor name="Rachel" className="cur-slim" /></span>
      </Plot>
      <ol className="slim-x" aria-hidden="true">{YEAR_2027.map((m, i) => <li key={i} style={{ left: at(board, i, 0).left }}>{m[0]}</li>)}</ol>
     </div>
    </figure>
    <div className="peek"><Spark className="spark-peek" /><Mascot /></div>
   </div>
  </div>
 </section>
}
