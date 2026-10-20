import { Check, Cursor, Heading, Spark } from '../kit'
import '../styles/close.css'

/** 11: the October close. The agent drafts each variance from the ledger rows; each department head confirms their own. */
export function Close() {
 return <section className="close" aria-labelledby="close-title">
  <div className="wrap">
   <Heading id="close-title" eyebrow="October close · Mon Nov 2" lines={['Every variance explained,', 'confirmed by noon.']} />
   <p className="lede wide">The agent drafted why each department missed, citing the ledger rows. Each department head confirmed their own.</p>
   <div className="vt">
    <span className="card vt-card" aria-hidden="true" />
    <p className="vt-source">October 2026 · actual vs FY2026 budget · QuickBooks Online · 1,311 transactions · ties <span className="ok">✓</span> · 6:00 am Mon Nov 2</p>
    <p className="vt-row vt-cols" aria-hidden="true"><span>Department</span><span>Actual</span><span>Budget</span><span>Variance</span></p>
    <div className="vt-row vt-mkt">
     <h3>Marketing</h3><p><span className="vt-k">Actual</span>$171,300</p><p><span className="vt-k">Budget</span>$149,900</p><p className="vt-var"><span className="vt-k">Variance</span>+$21,400 (+14.3%)</p>
     <Cursor name="Rachel" className="cur-mkt" />
    </div>
    <article className="card draft draft-mkt" aria-label="Marketing draft">
     <Spark className="spark-draft" />
     <p className="draft-by">Drafted by Easel</p>
     <p>Bill 4471 · Heartland HR Expo booth deposit · $18,900 · Oct 8 <span className="tag tag-green">evidence</span></p>
     <p>for the Nov 12 show, so November should land under <span className="tag tag-amber">hypothesis</span></p>
     <p className="confirmed">Confirmed by Hannah Cole · 10:12 am <span aria-hidden="true">✓</span></p>
    </article>
    <div className="vt-row vt-eng">
     <h3>Engineering</h3><p><span className="vt-k">Actual</span>$498,700</p><p><span className="vt-k">Budget</span>$512,300</p><p className="vt-var"><span className="vt-k">Variance</span>−$13,600 (−2.7%)</p>
    </div>
    <article className="card draft draft-eng" aria-label="Engineering draft">
     <Spark className="spark-draft" />
     <p className="draft-by">Drafted by Easel</p>
     <p>AWS · Bill 4519 · $76,400 vs $90,000 planned <span className="tag tag-green">evidence</span></p>
     <p>usage down after the Sep 28 database move <span className="tag tag-amber">hypothesis</span></p>
     <p className="confirmed">Confirmed by Priya Raman · 11:40 am <span aria-hidden="true">✓</span></p>
    </article>
    <div className="vt-row vt-sales">
     <h3>Sales</h3><p><span className="vt-k">Actual</span>$389,200</p><p><span className="vt-k">Budget</span>$384,500</p><p className="vt-var"><span className="vt-k">Variance</span>+$4,700 (+1.2%) <span className="tag tag-grey">under threshold</span></p>
    </div>
   </div>
   <ul className="close-pills">
    <li className="pill pill-green"><Check /><span>Cash Oct 31 · $2,418,600 · $16,600 ahead of forecast</span></li>
    <li className="pill pill-white"><span>Forecast kept · extended to Jan 2028</span></li>
    <li className="pill pill-white"><span>8 department statements emailed · 2:00 pm <span className="ok">✓</span></span></li>
   </ul>
  </div>
 </section>
}
