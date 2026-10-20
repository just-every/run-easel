import { Check, Cursor, Dots, Heading, Spark } from '../kit'
import '../styles/actuals.css'

const FRESH: [string, string][] = [['QuickBooks Online', '6:00 am'], ['Gusto', '6:00 am'], ['HubSpot', '2:00 am'], ['Stripe', '6:00 am']]
const ROWS: [vendor: string, bill: string, date: string, amount: string][] = [
 ['AWS', 'Bill 4392', 'Sep 30', '$79,180'], ['Datadog', 'Bill 4388', 'Sep 28', '$16,240'], ['Sentry', 'Bill 4371', 'Sep 15', '$1,000'],
]

/** 02: September's actuals arrive overnight and trace to the transaction. */
export function Actuals() {
 return <section className="actuals" aria-labelledby="actuals-title">
  <div className="wrap">
   <Heading id="actuals-title" eyebrow="Actuals · Mon Oct 5" lines={['September in by 6:00 am.', 'Down to the transaction.']} />
   <p className="lede wide">QuickBooks refreshed overnight and tied to the trial balance. Every cell opens to the rows behind it.</p>
   <ul className="card fresh" aria-label="Last refresh">
    {FRESH.map(([source, time]) => <li key={source}><strong>{source}</strong> {time} <span className="ok">✓</span></li>)}
    <li className="muted">nightly</li>
   </ul>
   <div className="zoom">
    <article className="card zoom-source">
     <div className="source-head">
      <span className="doc-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z M14 3v4h4 M9.5 11h6 M9.5 14h6 M9.5 17h4" /></svg></span>
      <div>
       <h3>QuickBooks Online</h3>
       <p><Dots>September closed · 1,284 transactions</Dots><span className="line">ties to trial balance <span className="ok">✓</span></span><span className="line">refreshed 6:00 am Mon Oct 5</span></p>
      </div>
     </div>
     <p className="chip"><Dots>Trial balance Sep 30 · sums to $0.00 <span className="ok">✓</span></Dots></p>
     <p className="chip"><Dots>2 new accounts · 6155 AI tools, 6160 Security tools · mapped by rule 6000–6999 → Software{'\u00a0'}&amp;{'\u00a0'}tools <span className="ok">✓</span></Dots></p>
    </article>
    <svg className="connector c-one" viewBox="0 0 100 60" aria-hidden="true"><path d="M2 6C48 2 82 18 92 50" /><path className="head" d="M85 44 92 52 97 42" /></svg>
    <article className="card zoom-cell">
     <Spark className="spark-cell" />
     <h3>P&amp;L · Sep 2026</h3>
     <table>
      <tbody>
       <tr><th scope="row">Revenue</th><td>$1,457,600</td></tr>
       <tr className="picked"><th scope="row"><Dots>Cloud hosting · Engineering</Dots></th><td>$96,420<Cursor name="Rachel" className="cur-cell" /></td></tr>
      </tbody>
     </table>
    </article>
    <svg className="connector c-two" viewBox="0 0 100 60" aria-hidden="true"><path d="M2 6C48 2 82 18 92 50" /><path className="head" d="M85 44 92 52 97 42" /></svg>
    <article className="card zoom-rows">
     <Spark className="spark-rows" />
     <h3><Dots>Cloud hosting · Engineering · Sep 2026</Dots></h3>
     <ul className="bills">
      {ROWS.map(([vendor, bill, date, amount], i) => <li key={bill}><Dots>{vendor} · {bill} · {date} · {amount}</Dots>{i === 0 ? <span className="ql">Open in QuickBooks ↗</span> : null}</li>)}
     </ul>
     <p className="bills-total"><span>Total</span><strong>$96,420 <span className="ok">✓</span></strong></p>
    </article>
    <p className="pill pill-green zoom-pill"><Check /><Dots><strong>September closed in Easel</strong> · 8:12 am · forecast kept · now Oct 2026 – Dec 2027</Dots></p>
   </div>
  </div>
 </section>
}
