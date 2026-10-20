import type { CSSProperties } from 'react'
import { Check, Cursor, Heading, Spark } from '../kit'
import { FLOOR, WEEKS, netK, short, usd } from '../records'
import '../styles/weekcash.css'

const TOP = 2_750_000
const share = (value: number) => (value / (TOP - FLOOR)).toFixed(4)
const CALLOUTS = [
 { week: 'Oct 19', title: 'Week of Oct 19', lines: [`closes ${usd(WEEKS[0].close)}`, `in ${usd(WEEKS[0].cashIn)} · out ${usd(WEEKS[0].cashOut)}`] },
 { week: 'Oct 26', title: 'Week of Oct 26', lines: ['payroll Fri Oct 30 $548,300', <>Oct 31 {usd(WEEKS[1].close)} = monthly forecast <span className="ok">✓</span></>] },
 { week: 'Nov 2', title: 'Ozark Physical Therapy', lines: ['$18,200 due Mon Nov 2', <>pays on time <span className="ok">✓</span></>] },
 { week: 'Nov 9', title: 'Heartland Dental Partners', lines: ['$64,800 due Fri Oct 30', 'averages 12 days late → Wed Nov 11'] },
]
const nov9 = WEEKS[3]

/** 09: thirteen weeks of direct cash from the bank balance, each payroll on its run date. */
export function WeekCash() {
 return <section className="weeks" aria-labelledby="weeks-title">
  <div className="wrap">
   <div className="weeks-head">
    <Spark className="spark-weeks-h" />
    <Heading id="weeks-title" eyebrow="13-week cash · Mon Oct 19" lines={['Thirteen weeks,', 'payroll to the day.']} />
    <p className="lede">Each invoice lands when that customer really pays, and every Gusto payroll lands on its run date.</p>
    <p className="card bank"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg><span>Bank balance Mon Oct 19 · $2.45M · read-only</span></p>
   </div>
   <figure className="card wk">
    <figcaption className="wk-head">
     <span className="wk-title"><strong>Closing cash by week</strong> · net in and out · weeks of Oct 19 – Jan 11</span>
     <span className="legend"><span className="sw sw-in">net in</span><span className="sw sw-out">net out</span><span className="sw sw-pay">payroll</span><span className="key key-floor">$2,000,000 floor</span></span>
    </figcaption>
    <div className="wk-chart">
     <ol className="wk-y" aria-hidden="true">{[2_600_000, 2_400_000, 2_200_000].map(t => <li key={t} style={{ ['--at' as string]: share(t - FLOOR) }}>{short(t, 1)}</li>)}<li className="floor" style={{ ['--at' as string]: 0 }}>$2.0M</li></ol>
     <p className="wk-of" aria-hidden="true">Week of</p>
     <ol className="wk-cols">
      {WEEKS.map((w, i) => <li key={w.week} className={`wk-col${w.net >= 0 ? ' in' : ' out'}${w.payroll ? ' pay' : ''}${w.week === 'Nov 9' ? ' hover' : ''}`}
       style={{ ['--base' as string]: share(Math.min(w.open, w.close) - FLOOR), ['--net' as string]: share(Math.abs(w.net)), ['--close' as string]: share(w.close - FLOOR) } as CSSProperties}>
       <span className="wk-label">{w.week}</span>
       <span className="wk-track" aria-hidden="true"><i className="wk-base" /><i className="wk-net" />{i < WEEKS.length - 1 ? <i className="wk-step" /> : null}</span>
       <span className={`wk-delta ${w.net >= 0 ? 'ok' : 'down'}`}>{netK(w.net)}</span>
       {i === 0 || i === WEEKS.length - 1 ? <span className="wk-value">{short(w.close)}</span> : null}
       {w.payroll ? <span className="wk-pin"><span>{w.payroll}</span>{w.note ? <small>{w.note}</small> : null}</span> : null}
       <span className="visually-hidden">: closes {usd(w.close)}, in {usd(w.cashIn)}, out {usd(w.cashOut)}{w.payroll ? `, payroll ${w.payroll}` : ''}</span>
      </li>)}
     </ol>
     <p className="wk-tip" aria-hidden="true"><strong>Week of Nov 9 · closes {usd(nov9.close)}</strong><span>in {usd(nov9.cashIn)} · out {usd(nov9.cashOut)} · payroll $548,300</span></p>
     <Cursor name="Owen" className="cur-nov9" />
    </div>
    <p className="kicker wk-matter">The weeks that matter</p>
    <svg className="wk-stems" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
     {CALLOUTS.map((_, i) => { const from = (i + .5) / 13 * 100, to = (i + .5) / 4 * 100, turnAt = 78 - i * 20; return <path key={i} d={`M${from} 0V${turnAt}H${to}V100`} /> })}
    </svg>
    <ol className="wk-callouts">
     {CALLOUTS.map(c => <li key={c.title} className="card callout"><h3>{c.title}</h3>{c.lines.map((line, i) => <p key={i}>{line}</p>)}</li>)}
    </ol>
    <p className="wk-moved">Thu Dec 24 payroll moved from Fri Dec 25.</p>
    <p className="pill pill-green wk-pill"><Check /><span><strong>Dec 31 {usd(WEEKS[10].close)} = monthly forecast <span className="ok">✓</span></strong> · week 13 closes {usd(WEEKS[12].close)}</span></p>
   </figure>
  </div>
 </section>
}
