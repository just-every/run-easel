import { ClosingCashDrawing } from './ClosingCashDrawing'
import { Drawing } from './Drawing'
import { Actions } from './Hero'

export function Closing() {
 return <section className="closing site-wrap" id="run" aria-labelledby="run-title">
  <div className="closing-text">
   <h2 id="run-title">Plan the year with a clear head.</h2>
   <p className="body">Open-source financial planning you run yourself.</p>
   <Actions />
   <p className="small">Free and open source, MIT licensed.</p>
  </div>
  <Drawing className="hero-drawing"><ClosingCashDrawing /></Drawing>
 </section>
}
