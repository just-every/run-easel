import { Check, Cursor, Dots, Lock, Spark, Sticky } from '../kit'
import { at, Plot, type Scale } from '../plot'
import { DEPARTMENTS, FLOOR, MONTHS, OLD_FORECAST, PICKED, PIPELINE, WEEKS, short } from '../records'
import '../styles/hero.css'

export function Actions({ demo = true }: { demo?: boolean }) {
 return <div className="actions">
  <a className="cta" href="/run">Run Easel →</a>
  {demo ? <a className="cta-link" href="https://demo.run-easel.com/">Try the demo</a> : null}
  <a className="cta-link" href="/docs">Read the docs</a>
 </div>
}

const cash: Scale = { count: MONTHS.length, min: 1_500_000, max: 2_700_000 }
const TICKS = [2_700_000, 2_400_000, 2_100_000, 1_800_000, 1_500_000]
const MAR = 5, MAY = 7

function MonthlyCash() {
 return <figure className="mc">
  <figcaption className="mc-head">
   <Dots className="mc-title"><strong>Monthly cash</strong> · Oct 2026 – Dec 2027</Dots>
   <span className="legend"><span className="key key-picked">Picked plan</span><span className="key key-old">Old forecast</span></span>
  </figcaption>
  <div className="mc-body" role="img" aria-label="Closing cash by month, Oct 2026 to Dec 2027. The old forecast falls to $1,910,000 in Mar 2027, below the $2,000,000 floor; the picked plan's lowest month is $2,022,500 in Mar 2027.">
   <ol className="mc-y" aria-hidden="true">{TICKS.map(t => <li key={t}>{short(t, 1)}</li>)}</ol>
   <Plot scale={cash} floor={FLOOR} className="mc-plot" lines={[{ values: OLD_FORECAST, className: 'line-old', dots: true }, { values: PICKED, className: 'line-picked', dots: true }]}>
    <i className="ring" style={at(cash, MAR, OLD_FORECAST[MAR])} />
    <i className="ring" style={at(cash, MAY, PICKED[MAY])} />
    <span className="hand note-slipped" style={{ left: at(cash, MAR, 0).left }}>Ridgeway slipped</span>
    <span className="hand note-kept" style={{ left: at(cash, MAR, 0).left }}>floor kept</span>
    <span className="hand note-hires" style={{ left: at(cash, MAY, 0).left }}>3 hires moved to May</span>
    <i className="pointer up" style={{ left: at(cash, MAR, 0).left, top: '70%', height: '9%' }} />
    <i className="pointer down" style={{ left: at(cash, MAR, 0).left, top: '21%', height: '31%' }} />
    <i className="pointer down" style={{ left: at(cash, MAY, 0).left, top: '12%', height: '17.5%' }} />
   </Plot>
   <span className="mc-floor" aria-hidden="true"><span style={{ top: at(cash, 0, FLOOR).top }}>$2,000,000 floor</span></span>
   <ol className="mc-x" aria-hidden="true">{MONTHS.map((m, i) => <li key={i} style={{ left: at(cash, i, 0).left }}>{m}{i === 0 ? <small>2026</small> : i === 3 ? <small>2027</small> : null}</li>)}</ol>
  </div>
 </figure>
}

const HEADS_NOW = DEPARTMENTS.reduce((n, [, now]) => n + now, 0), HEADS_PLANNED = DEPARTMENTS.reduce((n, [, , planned]) => n + planned, 0)
const maxWeighted = Math.max(...PIPELINE.map(s => s.open * s.probability))
const minClose = 2_000_000, maxClose = Math.max(...WEEKS.map(w => w.close))

export function Hero() {
 return <section className="hero" aria-labelledby="hero-title">
  <div className="wrap hero-grid">
   <div className="hero-copy">
    <h1 id="hero-title"><span className="h-ink">Plan the year.</span> <span className="h-glow">Protect the cash.</span></h1>
    <p className="hero-sub">Easel connects your ledger, payroll and CRM, forecasts P&amp;L, balance sheet and cash, keeps Excel live and flags any month below your cash floor.</p>
    <p className="hero-alt">100% free, open source alternative to <strong>Workday Adaptive Planning</strong>, <strong>Planful</strong> and{'\u00a0'}<strong>Anaplan</strong></p>
    <Actions />
   </div>
   <div className="hero-stage">
    <div className="hero-top">
    <article className="card h-exception" aria-label="Exception">
     <Spark className="spark-ex" />
     <ol className="chain">
      <li><Check tone="red" /><p><Dots aside={<span className="tag tag-red">exception</span>}>Lowest cash $1,910,000 · Mar 2027 · below $2,000,000 floor · Ridgeway Logistics slipped Dec → Mar · Tue Oct 13</Dots></p></li>
      <li><span className="chain-step" aria-hidden="true">↓</span><p><Dots>3 responses · Option 2: 3 sales hires Feb → May · lowest cash $2,022,500 <span className="ok">✓</span></Dots></p></li>
      <li><Check /><p><Dots>Rachel picked Option 2 · Wed Oct 14</Dots></p></li>
     </ol>
     <Cursor name="Rachel" className="cur-ex" />
    </article>
    <article className="card h-runway" aria-label="Runway">
     <Spark className="spark-run" />
     <p className="card-label">Runway</p>
     <p className="big">31 months</p>
     <p className="muted"><Dots>lowest cash $2,022,500 · floor $2,000,000 <span className="ok">✓</span></Dots></p>
     <Check label="floor kept" />
    </article>
    </div>
    <article className="card h-cash">
     <MonthlyCash />
     <Sticky className="h-sticky">FY27 plan to the board Nov 19!</Sticky>
    </article>
    <article className="card h-mini h-pipe">
     <Spark className="spark-pipe" />
     <p className="mini-title"><Dots><strong>HubSpot</strong> · Q1 2027</Dots></p>
     <p className="mini-line"><Dots>$2.4M open · weighted $860,000 · probability by stage</Dots></p>
     <ol className="stage-bars" aria-label="Weighted pipeline by stage">
      {PIPELINE.map(s => <li key={s.stage} style={{ ['--h' as string]: `${(s.open * s.probability / maxWeighted) * 100}%` }}><i /><span>{s.probability}%</span></li>)}
     </ol>
    </article>
    <article className="card h-mini h-heads">
     <p className="mini-title"><strong>FY2027 headcount</strong></p>
     <p className="mini-line"><Dots>142 → 168 · Gusto roster synced · salaries restricted <Lock /></Dots></p>
     <ol className="people" aria-label="Each figure is 12 people: 142 now, 26 planned hires">
      {Array.from({ length: Math.round(HEADS_PLANNED / 12) }, (_, i) => <li key={i} className={i < Math.round(HEADS_NOW / 12) ? undefined : 'hire'} />)}
     </ol>
    </article>
    <article className="card h-mini h-weeks">
     <Spark className="spark-weeks" />
     <p className="mini-title"><Dots><strong>13-week cash</strong> · week of Mon Oct 19</Dots></p>
     <p className="mini-line"><Dots>$2.45M · payroll Fri Oct 30</Dots></p>
     <ol className="week-bars" aria-label="Closing cash for each of the 13 weeks, highest the week of Oct 19 and $2.23M the week of Jan 11">
      {WEEKS.map(w => <li key={w.week} className={w.payroll ? 'pay' : undefined} style={{ ['--h' as string]: `${((w.close - minClose) / (maxClose - minClose)) * 100}%` }} />)}
     </ol>
     <Cursor name="Owen" className="cur-weeks" />
    </article>
   </div>
  </div>
 </section>
}
