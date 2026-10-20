// One private source graph per imported workbook. Ordinary schedules retain
// only their cell links; complete workbook sources use the import's pay grant.
import { requireFinance, requirePayDetail } from './access'
import type { Context } from './context'
import { requireEditable } from './model'
import { bump } from './plan'
import { scenarioAccess } from './scenario-access'
import { get, put, requireThat, text, type Data } from './types'
import { evaluateWorkbook } from './workbook-formula'

export async function workbookDrivers(c: Context, op: string, b: Data): Promise<Data|undefined> {
 if (op !== 'workbook-driver') return
 requireFinance(c.x);requirePayDetail(c.x)
 const book=get(c.s,'workbook-model',b.id,'workbook model'),sc=scenarioAccess(c.s,c.x,book.scenario)
 requireThat(sc.id === b.scenario,'This driver belongs to another scenario')
 requireEditable(c.s,c.x,sc,null)
 requireThat(Number(b.revision)===sc.revision,'The workbook plan changed; reload before editing a driver',409)
 const key=text(b.cell,'Workbook driver cell',500),cell=book.graph.cells[key]
 requireThat(cell && !cell.formula && typeof cell.value === 'number','Choose a numeric input cell, not a formula')
 const value=text(b.value,'Driver value',40)
 requireThat(/^-?\d+(?:\.\d{1,8})?$/.test(value) && Math.abs(Number(value))<=1e13,'Use an exact decimal with at most eight places')
 // A plan-row constant is edited in the planning grid, which supplies its override.
 requireThat(![...c.s.values()].some(r=>r.kind==='schedule'&&r.value.scenario===sc.id&&r.value.workbookOrigin===book.originId&&Object.values(r.value.workbookCells ?? {}).includes(key)),'Edit this plan cell in the planning grid')
 const updated: Data={...book,overrides:{...book.overrides,[key]:value}}
 evaluateWorkbook(updated.graph,updated.overrides)
 put(c.s,'workbook-model',book.id,updated)
 bump(c,sc,'workbook-driver-changed',book.id,{cell:key})
 return updated
}
