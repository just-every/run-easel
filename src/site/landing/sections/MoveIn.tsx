import { Check, Cursor, Heading, Spark } from '../kit'
import '../styles/movein.css'

const LINES: [line: string, adaptive: string, easel: string, kind?: string, note?: string][] = [
 ['Subscription revenue', '$1,412,300', '$1,412,300'],
 ['Services revenue', '$27,400', '$27,400'],
 ['Salaries and wages', '$1,021,400', '$1,021,400'],
 ['Payroll taxes', '$78,140', '$78,140'],
 ['Software subscriptions', '$38,920', '$43,130', 'mapping', "account 6150 sat in Adaptive's Other G&A · +$4,210"],
 ['Cloud hosting', '$94,180', '$94,180'],
 ['Deferred revenue release', '$118,400', '$105,800', 'timing', 'booked Aug in Adaptive, Sep in the ledger · −$12,600'],
 ['Rent', '$36,500', '$36,500'],
]

function Ledger({ name, side }: { name: string; side: 'adaptive' | 'easel' }) {
 return <article className={`card ledger ledger-${side}`} aria-labelledby={`ledger-${side}`}>
  <h3 id={`ledger-${side}`}>{name} · August 2026</h3>
  <ul>
   {LINES.map(([line, adaptive, easel, kind, note]) => <li key={line} className={note ? 'differs' : undefined}>
    <span>{line}</span><span className="amt">{side === 'adaptive' ? adaptive : easel}</span>
    {note ? (side === 'easel' ? <span className="card diff"><strong>{kind}:</strong> {note}</span> : <span className="diff-gap" aria-hidden="true" />) : <Check label="matches" />}
   </li>)}
  </ul>
 </article>
}

/** 12: the flashback. The move-in from Adaptive Planning and its parallel month, line by line. */
export function MoveIn() {
 return <section className="movein" aria-labelledby="movein-title">
  <div className="wrap">
   <div className="heading-block center">
    <Heading id="movein-title" className="center" eyebrow="Before the switch · Thu Oct 1 – Fri Oct 2" lines={['August, side by side.', 'Two differences, both explained.']} />
    <p className="lede">Easel brought in Tallgrass's Adaptive Planning model and two years of QuickBooks. Rachel compared one month line by line before switching.</p>
   </div>
   <div className="mi-chips">
    <div className="card mi-count">
     <p><strong>From Adaptive Planning</strong> · 286 accounts · 142 positions · totals reconcile <span className="ok">✓</span> · 3 items to map</p>
     <p className="mi-mapped">mapped Fri Oct 2, 10:15 am: Commission % formula → kept as values · 'Laptop refresh' column → expense schedule · Board access → viewers</p>
    </div>
    <p className="card mi-qbo"><strong>QuickBooks Online connected</strong> Thu Oct 1, 2:30 pm · 24 months backfilled, Sep 2024 – Aug 2026 · each tied to its trial balance <span className="ok">✓</span></p>
   </div>
   <div className="ledgers">
    <Ledger name="Adaptive Planning" side="adaptive" />
    <p className="match">62 of 64 match to the cent</p>
    <Ledger name="Easel" side="easel" />
   </div>
   <div className="mi-foot">
    <Spark className="spark-mi-l" /><Spark className="spark-mi-r" />
    <p className="pill pill-green signoff"><span><strong>Signed off by Rachel Kim</strong> · Fri Oct 2, 4:30 pm · first close in Easel Mon Oct 5</span></p>
    <Cursor name="Rachel" className="cur-signoff" />
    <p className="mi-also">Also moves in from Planful, Anaplan, Runway and Pigment.</p>
   </div>
  </div>
 </section>
}
