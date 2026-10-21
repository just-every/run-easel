// Dated file observations are compared with the scenario's planned inputs.
// Missing monthly observations stay unavailable; no carry-forward roster is invented.
import { requireMember, seesPayDetail } from './access'
import type { Context } from './context'
import { calculate } from './engine'
import { datePeriod } from './fiscal-calendar'
import { model } from './model'
import { addMonths } from './months'
import { frozenModel } from './reforecasts'
import { canSeeScenario } from './scenario-access'
import { all, get, requireThat, type Data } from './types'
import { mulDiv } from './units'

const active = (p: Data, month: string) => p.start <= month && (!p.end || month <= p.end)
const dayDifference = (actual: string, planned: string) => (Date.parse(`${actual}T00:00:00Z`) - Date.parse(`${planned}T00:00:00Z`)) / 86400000

export async function headcountView(c: Context, scenario: string) {
 requireMember(c.x)
 const sc = get(c.s,'scenario',scenario)
 requireThat(canSeeScenario(c.x,sc), 'Scenario not found',404)
 const m = sc.status === 'frozen' ? await frozenModel(c,sc) : model(c.s,scenario)
 // Compare planned cost, even where the working forecast now uses closed actuals.
 const calculation = calculate({...m,inputs:{...m.inputs,formula:[]},scenario:{...m.scenario,actualsThrough:null}})
 const positions = m.inputs.position
 const imports = all(c.s,'payroll-import').filter(i => i.scenario === scenario && i.status === 'imported')
 const roster = all(c.s,'roster-actual').filter(r => imports.some(i => i.destination === r.batch))
 const runs = all(c.s,'payroll-run').filter(r => imports.some(i => i.destination === r.batch))
 const history = roster.flatMap(r => {
  const p = positions.find(p => p.originId === r.positionOrigin)
  if (!r.positionOrigin || !seesPayDetail(c.x,r.department)) return []
  return [{department:r.department,provider:r.provider,asOf:r.asOf,employeeId:r.employeeId,name:r.name,position:r.plannedPosition || p?.id || null,title:r.plannedTitle || p?.title || 'Removed position',plannedStartDate:r.plannedStartDate || null,actualStartDate:r.start,slippageDays:r.plannedStartDate ? dayDifference(r.start,r.plannedStartDate) : null,backfillOrigin:r.backfillOrigin || null,batch:r.batch}]
 }).sort((a,b) => a.asOf.localeCompare(b.asOf) || a.employeeId.localeCompare(b.employeeId))
 const months = calculation.months.flatMap(month => {
  const observations = imports.filter(i => i.kind === 'roster' && datePeriod(m.workspace, i.asOf) === month)
  const latest = new Map<string,Data>()
  for (const i of observations) if (!latest.has(i.provider) || i.asOf > latest.get(i.provider)!.asOf) latest.set(i.provider,i)
  const selected = roster.filter(r => r.asOf === latest.get(r.provider)?.asOf)
  const monthlyRuns = runs.filter(r => datePeriod(m.workspace, r.payDate) === month)
  return m.departments.map(d => {
   const planned = positions.filter(p => p.department === d.id), current = planned.filter(p => active(p,month))
   const actual = selected.filter(r => r.department === d.id), pay = monthlyRuns.filter(r => r.department === d.id)
   const links = actual.map(r => r.positionOrigin).filter(Boolean)
   const ambiguous = new Set(links).size !== links.length
   const available = latest.size > 0 && !ambiguous
   const payrollLines = m.lines.filter(l => l.payroll).map(l => l.id)
   const plannedCostCents = calculation.cells.filter(cell => cell.month === month && cell.department === d.id).reduce((n,cell) => n+cell.sources.filter(source => payrollLines.includes(cell.line) || source.kind === 'position').reduce((v,source) => v+source.amount,0),0)
   const actualCostCents = pay.length ? pay.reduce((n,r) => n+r.totalCents,0) : null
   const actualHeadcount = available ? actual.filter(r => r.start <= r.asOf && (!r.termination || r.termination > r.asOf)).length : null
   return {month,department:d.id,name:d.name,observations:[...latest.values()].map(i => ({provider:i.provider,asOf:i.asOf})),issue:ambiguous ? 'Multiple providers link employees to the same planned position' : null,
    plannedHeadcount:current.length,actualHeadcount,headcountDifference:actualHeadcount === null ? null : actualHeadcount-current.length,
    plannedHires:planned.filter(p => p.start === month).length,actualHires:available ? actual.filter(r => datePeriod(m.workspace, r.start) === month && r.start <= r.asOf).length : null,
    plannedDepartures:planned.filter(p => p.end === addMonths(month,-1)).length,actualDepartures:available ? actual.filter(r => r.termination && datePeriod(m.workspace, r.termination) === month && r.termination <= r.asOf).length : null,
    plannedCostCents,actualCostCents,costDifferenceCents:actualCostCents === null ? null : actualCostCents-plannedCostCents,
    expectedAttritionHundredths:mulDiv(current.reduce((n,p) => n+(p.attritionBps ?? 0),0),100,10000),
    backfills:planned.filter(p => p.start === month && p.backfillOrigin).length,
   }
  })
 })
 return {scenario,currency:m.workspace.currency,source:'Reviewed roster and payroll-register files; connected provider roster pull unavailable',months,history,
  positions:positions.filter(p => seesPayDetail(c.x,p.department)).map(p => ({id:p.id,originId:p.originId,title:p.title,department:p.department,plannedStartDate:p.plannedStartDate || null,backfillOrigin:p.backfillOrigin || null,attritionBps:p.attritionBps ?? 0}))}
}
