import { Check, Cursor, Dots, Heading, Spark, Sticky } from '../kit'
import '../styles/boardpack.css'

/** 06: the Q3 board pack, published once as PDF, PowerPoint and Excel. Art left, copy right. */
export function BoardPack() {
 return <section className="pack" aria-labelledby="pack-title">
  <div className="wrap pack-grid">
   <div className="fan" role="group" aria-label="The Q3 2026 board pack in three formats">
    <Spark className="spark-fan-a" /><Spark className="spark-fan-b" /><Spark className="spark-fan-c" />
    <article className="card doc doc-pdf">
     <span className="tag tag-grey">PDF</span>
     <p className="doc-co">Tallgrass Software</p>
     <h3>Q3 2026 board pack</h3>
     <p className="muted">published Thu Oct 15, 3:30 pm</p>
    </article>
    <article className="card doc doc-ppt">
     <span className="tag tag-grey">PowerPoint</span>
     <h3>Q3 at a glance</h3>
     <dl className="kpis">
      <div><dt>Revenue</dt><dd>$4,318,600</dd><dd className="ok-soft">+$28,600 vs{'\u00a0'}budget</dd></div>
      <div><dt>ARR</dt><dd>$17.64M</dd></div>
      <div><dt>Net burn</dt><dd>$243,000</dd></div>
      <div><dt>Runway</dt><dd>31 months</dd></div>
     </dl>
     <Cursor name="Rachel" className="cur-ppt" />
    </article>
    <article className="card doc doc-xls">
     <span className="tag tag-grey">Excel</span>
     <p className="sheet-tabs"><span>P&amp;L</span><span>Balance sheet</span><span>Cash flow</span><span>Variances</span><span className="on">Decisions</span></p>
     <div className="sheet-grid"><span className="sheet-row" aria-hidden="true" /><p className="decision-line"><Dots>3 account executive starts Feb 1 → May 3, 2027 · owner Luis{'\u00a0'}Moreno · keeps Mar 2027 cash above $2,000,000</Dots></p><span className="sheet-row" aria-hidden="true" /></div>
    </article>
    <p className="card folder"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h6l2 2h10v10.5H3z" /></svg><Dots>Saved to Google Drive · Board / 2026 Q3 <span className="ok">✓</span></Dots></p>
   </div>
   <div className="pack-copy">
    <Heading id="pack-title" eyebrow="Board pack · Thu Oct 15" lines={['Q3 to the board', 'in three formats.']} />
    <p className="lede">One pack, published once, as PDF, PowerPoint and Excel. The numbers never change after publishing.</p>
    <p className="pill pill-green"><Check /><Dots>Q3 board pack · PDF · PowerPoint · Excel · Thu Oct 15 <span className="ok">✓</span></Dots></p>
    <Sticky className="pack-sticky">Same numbers in all three!</Sticky>
   </div>
  </div>
 </section>
}
