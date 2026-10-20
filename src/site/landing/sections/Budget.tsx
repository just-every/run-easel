import { Check, Cursor, Dots, Heading, Spark, Sticky } from '../kit'
import '../styles/budget.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ROWS: { name: string; value: string; note?: string; sub?: boolean; pasted?: boolean }[] = [
 { name: 'Contractors', value: '42,000', pasted: true },
 { name: 'Software tools', value: '31,500', pasted: true },
 { name: 'Cloud hosting', value: '95,000', pasted: true },
 { name: 'AWS', value: '78,000', sub: true },
 { name: 'Datadog', value: '17,000', sub: true },
 { name: 'Conference travel', value: '5,000', note: '$60,000 spread\u00a0evenly' },
]
const DEPTS: [dept: string, head: string, date: string][] = [
 ['Support', 'Tasha Greene', 'Thu Oct 8'], ['People', 'Carla Jensen', 'Fri Oct 9'], ['G&A', 'Rachel Kim', 'Mon Oct 12'], ['Product', 'Sam Whitaker', 'Tue Oct 13'],
 ['Customer Success', 'Derek Okafor', 'Wed Oct 14'], ['Sales', 'Luis Moreno', 'Thu Oct 15'], ['Marketing', 'Hannah Cole', 'Fri Oct 16, 11:30 am'], ['Engineering', 'Priya Raman', 'Fri Oct 16, 3:42 pm'],
]

/** 08: budget season. Engineering's FY2027 grid (36 cells pasted) beside the eight-department checklist. */
export function Budget() {
 return <section className="budget" aria-labelledby="budget-title">
  <div className="wrap budget-layout">
   <div className="budget-copy">
    <Heading id="budget-title" eyebrow="FY2027 budget · Fri Oct 16" lines={['Eight departments,', 'all in by Friday.']} />
    <p className="lede">Department heads typed and pasted into the same grid finance plans in. Each one saw only their own numbers.</p>
   </div>
   <article className="card plan" aria-labelledby="plan-title">
    <Spark className="spark-plan" />
    <h3 id="plan-title"><Dots><strong>Engineering</strong> · FY2027 budget · Jan – Dec 2027</Dots><span className="swipe">swipe for more →</span></h3>
    <div className="plan-scroll" tabIndex={0} aria-label="Engineering FY2027 budget grid, scrolls sideways">
     <div className="plan-inner">
      <table className="plan-grid">
       <thead><tr><th scope="col" className="item">Item</th>{MONTHS.map(m => <th key={m} scope="col">{m}</th>)}</tr></thead>
       <tbody>
        {ROWS.map(r => <tr key={r.name} className={[r.sub ? 'sub' : '', r.pasted ? 'pasted' : ''].join(' ').trim() || undefined}>
         <th scope="row">{r.name}{r.note ? <small>{r.note}</small> : null}</th>
         {MONTHS.map(m => <td key={m} className={r.name === 'Cloud hosting' && m === 'Jul' ? 'flag' : undefined}>{r.value}</td>)}
        </tr>)}
       </tbody>
      </table>
      <p className="paste-tag">Pasted 36 cells <span aria-hidden="true">✓</span> · from eng-budget-27.xlsx</p>
      <span className="paste-box" aria-hidden="true" />
     </div>
    </div>
    <div className="plan-foot">
     <p className="note-chip"><span className="note-icon" aria-hidden="true" /><span><strong>Cloud hosting · Jul<span className="swipe-note"> (swipe)</span>:</strong> Database move done Sep 28; usage{'\u00a0'}flat.</span></p>
     <Cursor name="Priya" tone="gold" className="cur-priya" />
     <Sticky className="budget-sticky sticky-card">Sales moved its<br />3 starts to May.</Sticky>
    </div>
   </article>
   <div className="rail">
    <article className="card reminder">
     <Spark className="spark-reminder" />
     <span className="bell" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0" /></svg></span>
     <p><strong>Reminder</strong><Dots>Thu Oct 15, 8:00 am · 3 departments open · Slack and email</Dots></p>
    </article>
    <article className="card checklist" aria-labelledby="requested-title">
     <h3 id="requested-title"><Dots><strong>Requested</strong> Mon Oct 5 · due Fri Oct 16</Dots></h3>
     <ol>
      {DEPTS.map(([dept, head, date]) => <li key={dept} className={dept === 'Sales' ? 'sales' : undefined}>
       <Check />
       <p className="dept-row"><strong>{dept}</strong><Dots className="who">{head} · {date}</Dots></p>
       {dept === 'Sales' ? <>
        <Sticky className="budget-sticky sticky-row">Sales moved its<br />3 starts to May.</Sticky>
        <svg className="connector c-sales" viewBox="0 0 104 190" aria-hidden="true"><path d="M4 186C46 172 66 92 92 12" /><path className="head" d="M82 15 93 9 97 21" /></svg>
       </> : null}
      </li>)}
     </ol>
     <p className="pill pill-green rail-pill"><Check /><span><Dots><strong>FY2027 budget</strong> · 8 of 8 departments in</Dots><Dots>Fri Oct 16 <span className="ok">✓</span> · $19,600,000</Dots></span></p>
    </article>
   </div>
  </div>
 </section>
}
