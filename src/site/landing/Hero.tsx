import { ClosingCashDrawing } from './ClosingCashDrawing'
import { Drawing } from './Drawing'

export function Hero() {
 return <section className="hero site-wrap" id="top" aria-labelledby="hero-title">
  <div className="hero-text">
   <h1 id="hero-title"><span>Know what</span> <span>you can afford.</span></h1>
   <p className="subhead">Easel builds your twelve-month plan from real actuals and shows the arithmetic behind every number.</p>
   <p className="alternatives">100% free, open source alternative to <strong>Jirav</strong>, <strong>Runway</strong> and <strong>Cube</strong></p>
   <Actions />
  </div>
  <Drawing className="hero-drawing"><ClosingCashDrawing /></Drawing>
 </section>
}

export function Actions() {
 return <div className="actions"><a className="btn" href="/run">Run Easel</a><a className="link" href="/docs">Read the docs</a></div>
}
