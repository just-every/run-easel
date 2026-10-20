import { Avatar, Cursor, Heading, Spark } from '../kit'
import '../styles/excel.css'

const CELLS: [col: string, month: string, value: string, was: string][] = [
 ['B', 'Jan 2027', '$1,512,400', '$1,535,650'], ['C', 'Feb 2027', '$1,534,900', '$1,558,150'], ['D', 'Mar 2027', '$1,559,700', '$1,582,950'],
]

/** 05: Owen's board model pulls straight from Easel; one refresh brings the slip's three months and his SUM follows. */
export function Excel() {
 return <section className="excel" aria-labelledby="excel-title">
  <div className="wrap">
   <Heading id="excel-title" eyebrow="Excel · Wed Oct 14, 9:14 am" lines={["Owen's workbook,", 'live from Easel.']} />
   <p className="lede wide">Owen's board model pulls straight from Easel. One refresh brought the new forecast, and his own formulas followed.</p>
   <div className="card xl" role="group" aria-label="Tallgrass FY27 board model.xlsx, sheet Revenue">
    <Spark className="spark-xl" />
    <p className="xl-title"><span className="lights" aria-hidden="true"><i /><i /><i /></span>Tallgrass FY27 board model.xlsx</p>
    <div className="xl-main">
     <div className="xl-sheet">
      <p className="xl-formula"><span className="namebox">B4</span><span className="fx" aria-hidden="true">fx</span><code>=EASEL.VALUE("Revenue","Sales","2027-01","Forecast")</code></p>
      <div className="xl-scroll" tabIndex={0} aria-label="Sheet Revenue, scrolls sideways">
       <div className="xl-inner">
       <table className="xl-grid">
        <thead><tr><td className="rn" /><th scope="col">A</th><th scope="col">B</th><th scope="col">C</th><th scope="col">D</th><th scope="col">E</th></tr></thead>
        <tbody>
         <tr><th scope="row" className="rn">1</th><td /><td /><td /><td /><td /></tr>
         <tr><th scope="row" className="rn">2</th><td /><td /><td /><td /><td /></tr>
         <tr className="months"><th scope="row" className="rn">3</th><td />{CELLS.map(([col, month]) => <td key={col}>{month}</td>)}<td>Q1 2027</td></tr>
         <tr className="values"><th scope="row" className="rn">4</th><td className="label">Revenue · Sales</td>{CELLS.map(([col, , value], i) => <td key={col} className={`changed${i === 0 ? ' active' : ''}`}>{value}</td>)}<td className="sum">$4,607,000<span className="sum-tip">=SUM(B4:D4)</span></td></tr>
         <tr className="was"><th scope="row" className="rn">5</th><td className="label"><span className="visually-hidden">was</span></td>{CELLS.map(([col, , , was]) => <td key={col}><s>{was}</s></td>)}<td><s>$4,676,750</s></td></tr>
         <tr><th scope="row" className="rn">6</th><td /><td /><td /><td /><td /></tr>
        </tbody>
       </table>
       <p className="hand sum-note">my SUM updated too</p>
       </div>
      </div>
      <p className="xl-tabs"><span className="tab-nav" aria-hidden="true">‹ ›</span><span className="tab">Revenue</span><span className="tab-add" aria-hidden="true">+</span></p>
     </div>
     <aside className="xl-panel" aria-label="Easel panel">
      <p className="panel-head"><Avatar /><strong>Easel</strong></p>
      <p>refreshed 9:14 am Wed Oct 14</p>
      <p>3 cells changed since Mon 4:10 pm</p>
      <p>plan access · no pay access</p>
      <span className="refresh-wrap" aria-hidden="true"><span className="refresh">Refresh</span><Cursor name="Owen" className="cur-refresh" /></span>
     </aside>
    </div>
   </div>
  </div>
 </section>
}
