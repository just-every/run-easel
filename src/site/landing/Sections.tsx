import type { ReactNode } from 'react'
import { ActualsDrawing, CompareDrawing, CycleDrawing, LicenceDrawing, MoveInDrawing, ReviewDrawing, TraceDrawing } from './drawings'

/** One section: eyebrow, heading, one line, one drawing; `flip` puts the drawing on the left. */
function Section({ id, eyebrow, title, body, drawing, flip }: { id: string; eyebrow: string; title: string; body: string; drawing: ReactNode; flip?: boolean }) {
 return <section className={flip ? 'feature flip' : 'feature'} id={id} aria-labelledby={`${id}-title`}>
  <div className="feature-text">
   <p className="eyebrow">{eyebrow}</p>
   <h2 id={`${id}-title`}>{title}</h2>
   <p className="body">{body}</p>
  </div>
  <div className="feature-drawing">{drawing}</div>
 </section>
}

/** The product, two sections to a band with a hairline between them. */
export function Sections() {
 return <>
  <div className="pair site-wrap">
   <Section id="free" eyebrow="Open source" title="100% free. Yours to keep." body="Easel is MIT open source. Run it on your own computer, change anything, and keep every number." drawing={<LicenceDrawing />} />
   <Section id="every-number" eyebrow="Every number" title="Every number shows its work." body="Choose any amount to see how it was calculated: the driver, the rate and the month." drawing={<TraceDrawing />} />
  </div>
  <div className="pair site-wrap">
   <Section id="scenarios" eyebrow="Scenarios" title="The downside, side by side." body="Branch any plan, change an assumption, and compare profit and closing cash month by month." drawing={<CompareDrawing />} />
   <Section id="actuals" flip eyebrow="Actuals" title="Your actuals, reconciled." body="Upload your general-ledger CSV, map each account, and check every row before you accept it." drawing={<ActualsDrawing />} />
  </div>
  <div className="pair site-wrap">
   <Section id="budget-cycle" eyebrow="Budget cycle" title="Approved means approved." body="Departments submit their own numbers. Approval keeps exactly what was approved, and by whom." drawing={<CycleDrawing />} />
   <Section id="review" flip eyebrow="Monthly review" title="Every month, explained." body="Close the month with actuals, confirm why each number moved, and publish the review pack." drawing={<ReviewDrawing />} />
  </div>
 </>
}

export function MoveIn() {
 return <Section id="move-in" eyebrow="Move in" title="Try it beside your spreadsheet." body="Move in your Excel budget as its own scenario, every cell address and formula kept. Compare it, adopt it or undo it." drawing={<MoveInDrawing />} />
}
