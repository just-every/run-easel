import { Check, Cursor, Heading, Lock, Spark } from '../kit'
import { DEPARTMENTS } from '../records'
import '../styles/headcount.css'

const ROWS: [role: string, start: string, pay: string][] = [
 ['Marcus Hale · Account executive', '', 'base $120,000'],
 ['Account executive #4', 'start Mon May 3', '$18,750 a month'],
 ['Account executive #5', 'start Mon May 3', '$18,750 a month'],
 ['Account executive #6', 'start Mon May 3', '$18,750 a month'],
]

function Panel({ who, role, access, pay }: { who: string; role: string; access: string; pay: boolean }) {
 return <article className="card hc-panel" aria-label={`${who}'s view`}>
  <p className="hc-who"><strong>{who}</strong> · {role} · {access}</p>
  <Cursor name={who} className="cur-hc" />
  <h3>Sales · 22 → 30</h3>
  <ul>
   {ROWS.map(([name, start, amount]) => <li key={name}><span>{name}{start ? <> · {start}</> : null}</span>{pay ? <span className="amt">{amount}</span> : <Lock />}</li>)}
  </ul>
  <p className="hc-total"><strong>Sales FY2027</strong><strong>$4,620,000</strong></p>
 </article>
}

/** 10: one headcount plan seen by Rachel with pay and by Owen without it; Gusto keeps the roster current. */
export function Headcount() {
 return <section className="headcount" aria-labelledby="headcount-title">
  <div className="wrap">
   <div className="heading-block center">
    <Heading id="headcount-title" className="center" eyebrow="Headcount · Tue Oct 20" lines={['One plan, two views.', 'Salaries stay restricted.']} />
    <p className="lede">Gusto keeps the roster current. Owen plans every position without seeing pay; detail goes only to the people Rachel grants.</p>
   </div>
   <div className="hc-bridge">
    <p className="card gusto">
     <span className="people-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2" /><circle cx="16.5" cy="9" r="2.6" /><path d="M3 19c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6zM14.6 13.7c3.4-.6 6.4 1.2 6.4 4.8h-4.6" /></svg></span>
     <span><strong>Gusto</strong> · 142 people · 142 matched · 0 unplanned · 2 salaries changed Oct 1 · synced 6:00 am Tue Oct 20</span>
     <Check label="synced" />
    </p>
    <svg className="connector c-hc-l" viewBox="0 0 100 60" aria-hidden="true"><path d="M96 8C50 4 20 20 14 52" /><path className="head" d="M7 44 14 54 21 44" /></svg>
    <svg className="connector c-hc-r" viewBox="0 0 100 60" aria-hidden="true"><path d="M4 8C50 4 80 20 86 52" /><path className="head" d="M79 44 86 54 93 44" /></svg>
   </div>
   <div className="hc-panels">
    <Panel who="Rachel" role="finance" access="pay access" pay />
    <Panel who="Owen" role="FP&A" access="no pay access" pay={false} />
   </div>
   <article className="card hc-strip">
    <Spark className="spark-hc-l" /><Spark className="spark-hc-r" />
    <p><strong>FY2027 headcount</strong> <strong className="hc-n">142 → 168</strong> · Gusto roster synced · salaries restricted</p>
    <ul>{DEPARTMENTS.map(([name, now, planned]) => <li key={name}><strong>{name}</strong><span>{now} → {planned}</span></li>)}</ul>
   </article>
  </div>
 </section>
}
