import { Avatar, Check, Dots, Heading, Spark, Sticky } from '../kit'
import '../styles/slip.css'

/** 03: the page's one failure. Ridgeway's close date moves; the agent finds the month it breaks, traces it and asks. */
export function Slip() {
 return <section className="slip" aria-labelledby="slip-title">
  <div className="wrap">
   <Heading id="slip-title" eyebrow="The slip · Mon Oct 12 – Tue Oct 13" lines={['Ridgeway slipped a quarter.', 'Easel caught it by 2:04 am.']} />
   <p className="lede">One close date moved in HubSpot. Overnight, the agent found the month it breaks, traced the cause, and asked the deal owner.</p>
   <div className="slip-panes">
    <article className="card decision" aria-labelledby="decision-title">
     <Spark className="spark-decision" />
     <div className="decision-head">
      <Check tone="red" />
      <div>
       <h3 id="decision-title"><Dots>Cash floor broken · Mar 2027</Dots></h3>
       <p className="muted">opened Tue Oct 13, 2:04 am</p>
      </div>
      <span className="tag tag-red">exception</span>
     </div>
     <p className="decision-low">Lowest cash $1,910,000</p>
     <p className="decision-short"><Dots>floor $2,000,000 · short $90,000</Dots></p>
     <p className="decision-shift"><span className="before"><Dots><strong className="ok">Before:</strong> lowest $2,097,000 · Jun 2027 <span className="ok">✓</span></Dots></span><span className="shift-arrow" aria-hidden="true">→</span><span className="after"><Dots><strong>After:</strong> $1,910,000 · Mar 2027</Dots><i className="after-link" aria-hidden="true" /></span></p>
     <dl>
      <div><dt>Cause, traced</dt><dd><Dots>HubSpot deal 18842 · Ridgeway Logistics · $310,000 annual upfront · Contract sent (90%) · close Fri Dec 18 → Fri Mar 19 · changed by Marcus Hale, Mon Oct 12, 4:47 pm</Dots></dd></div>
      <div><dt>Effect</dt><dd><Dots>Weighted cash $279,000 moves from Jan to May · revenue $23,250 a month moves from Jan to Apr</Dots></dd></div>
     </dl>
     <p className="decision-foot"><Dots>Plan unchanged · rev 212 · owner: Rachel Kim</Dots></p>
     <Sticky className="slip-sticky">Caught 5 months out!</Sticky>
    </article>
    <article className="card thread" aria-labelledby="thread-title">
     <h3 id="thread-title"><span aria-hidden="true">#</span> finance-forecast</h3>
     <ol>
      <li className="msg">
       <Avatar />
       <div>
        <p className="who"><strong>Easel</strong> · 8:00 am</p>
        <p className="to">to Marcus Hale:</p>
        <p>Is Mar 19 firm for Ridgeway Logistics ($310,000)?</p>
        <p className="choices"><span>Yes</span><span>No</span><span>New date</span></p>
       </div>
      </li>
      <li className="msg">
       <span className="initials" aria-hidden="true">MH</span>
       <div>
        <p className="who"><strong>Marcus Hale</strong> · 9:06 am</p>
        <p>Yes. Their budget year starts Mar 1.</p>
       </div>
      </li>
      <li className="msg">
       <Avatar />
       <div>
        <p className="who"><strong>Easel</strong> · 9:06 am</p>
        <p className="recorded"><Dots>Recorded: close Fri Mar 19 · source Marcus Hale, Slack, 9:06 am <span className="ok">✓</span></Dots></p>
       </div>
      </li>
     </ol>
    </article>
   </div>
  </div>
 </section>
}
