import { CompareCashDrawing } from './CompareCashDrawing'
import { Drawing } from './Drawing'

// The section drawings. Each copies a real Easel screen's labels (src/ui) with
// sample values from the browser journey's fixtures.

export function LicenceDrawing() {
 return <Drawing className="licence">
  <p className="licence-head"><span className="drawing-title">MIT License</span><i aria-hidden="true" /></p>
  <span className="licence-bars" aria-hidden="true"><i /><i /><i /><i /></span>
  <p className="licence-foot">free of charge</p>
 </Drawing>
}

const MONTHS = [['Oct 2026', '$88,800.00'], ['Nov 2026', '$94,400.00'], ['Dec 2026', '$100,800.00'], ['Jan 2027', '$105,600.00']]
export function TraceDrawing() {
 return <div className="trace-drawing">
  <Drawing className="pl-row">
   <table>
    <thead><tr><td />{MONTHS.map(([m], i) => <th key={m} scope="col" className={i === 2 ? 'chosen' : i === 1 ? undefined : 'wide-only'}>{m}</th>)}</tr></thead>
    <tbody><tr><th scope="row">Subscription revenue</th>{MONTHS.map(([m, v], i) => <td key={m} className={i === 2 ? 'chosen' : i === 1 ? undefined : 'wide-only'}>{v}</td>)}</tr></tbody>
   </table>
  </Drawing>
  <span className="pin" aria-hidden="true" />
  <div className="trace-card">
   <p className="drawing-title">Subscription revenue, Dec 2026</p>
   <p className="drawing-muted">Sales · Subscriptions</p>
   <p className="trace-sum">84.00 × $1,200.00 per customer = <strong>$100,800.00</strong></p>
  </div>
 </div>
}

export function CompareDrawing() {
 return <Drawing className="compare">
  <p className="drawing-title">FY2027 forecast → Downside: slower hiring</p>
  <p className="compare-change">Changed assumptions (1)<br /><span className="drawing-muted">Changed position: Engineer, start month Oct 2026 → Jan 2027</span></p>
  <CompareCashDrawing />
 </Drawing>
}

export function ActualsDrawing() {
 return <Drawing className="actuals">
  <p className="drawing-title">16 rows read · 14 can be accepted · 2 rejected</p>
  <table>
   <thead><tr><th scope="col">Line</th><th scope="col">Why</th></tr></thead>
   <tbody><tr className="rejected"><td>14</td><td>repeats line 13 exactly</td></tr></tbody>
  </table>
  <span className="drawn-button">Accept 14 rows</span>
 </Drawing>
}

export function CycleDrawing() {
 return <Drawing className="cycle">
  <p className="drawing-title">FY2027 budget · Approved (revision 7)</p>
  <table>
   <thead><tr><th scope="col">Department</th><th scope="col">Status</th><th scope="col">Last change</th></tr></thead>
   <tbody>
    <tr><td>Sales</td><td><span className="drawn-pill">submitted</span></td><td><span>sales ·</span> <span>2026-06-12 09:30</span></td></tr>
    <tr><td>Engineering</td><td><span className="drawn-pill">submitted</span></td><td><span>engineering ·</span> <span>2026-06-14 16:05</span></td></tr>
   </tbody>
  </table>
 </Drawing>
}

export function ReviewDrawing() {
 return <Drawing className="review">
  <p className="drawing-title">Aug 2026 review · published</p>
  <table>
   <thead><tr><th scope="col">Line</th><th scope="col" className="num">Variance</th><th scope="col">Explanation</th></tr></thead>
   <tbody><tr><td>Advertising · Marketing</td><td className="num">$7,500.00</td><td><span className="drawn-pill">explanation confirmed</span></td></tr></tbody>
  </table>
  <span className="drawn-button">Download pack (HTML)</span>
 </Drawing>
}

export function MoveInDrawing() {
 return <Drawing className="move-in">
  <div className="move-in-file">
   <p className="file-chip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h8l4.5 4.5v14.5H6z M14 2.5V7h4.5" /></svg><span>fy27-budget.xlsx</span></p>
   <span className="drawn-button">Import as a new scenario</span>
  </div>
  <span className="leader" aria-hidden="true" />
  <p className="cell-note">Budget!D7</p>
 </Drawing>
}
