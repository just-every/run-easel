import { useState } from 'react'
import { command,Field,Form,type D } from './shared'

export function WorkbookDrivers({book,revision,onChange}: {book:D;revision:number;onChange:()=>Promise<void>}) {
 const cells=Object.entries(book.graph.cells).filter(([,cell]:[string,any])=>!cell.formula&&typeof cell.value==='number') as [string,D][]
 const [key,setKey]=useState(cells[0]?.[0] ?? '')
 if(!cells.length)return null
 const cell=book.graph.cells[key]
 return <section className="card">
  <h2>Workbook drivers: {book.name}</h2>
  <p className="muted">Change a numeric source assumption to recalculate translated formulas. Plan-row inputs are edited in the planning grid. Unsupported formulas keep their reported cached values.</p>
  <label className="inline">Source driver<select aria-label="Source driver" value={key} onChange={e=>setKey(e.target.value)}>{cells.map(([key,cell])=><option key={key} value={key}>{cell.sheet}!{cell.ref}</option>)}</select></label>
  <Form key={`${book.id}:${key}:${revision}`} submit="Save workbook driver" onSubmit={async v=>{await command('workbook-driver',{id:book.id,scenario:book.scenario,revision,cell:key,value:v.value});await onChange()}}>
   <Field label="Driver value" name="value" defaultValue={book.overrides?.[key] ?? String(cell.value)} hint="Exact source units; up to eight decimal places" />
  </Form>
 </section>
}
