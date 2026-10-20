import type { Model } from './engine'
import { requireThat } from './types'
import { evaluateWorkbook } from './workbook-formula'

export function workbookScheduleValues(inputs: Model['inputs']) {
 const result = new Map<string,Record<string,number>>()
 for (const book of inputs['workbook-model'] ?? []) {
  const schedules = inputs.schedule.filter(s => s.workbookOrigin === book.originId)
  const overrides: Record<string,number|string> = {...book.overrides}
  for (const s of schedules) for (const [month,key] of Object.entries(s.workbookCells ?? {})) {
   const cell = book.graph.cells[key as string]
   if (cell && !cell.formula) overrides[key as string] = s.values[month]
  }
  const evaluated = evaluateWorkbook(book.graph,overrides)
  for (const s of schedules) result.set(s.originId,Object.fromEntries(Object.entries(s.workbookCells).map(([month,key]) => {
   requireThat(Number.isSafeInteger(evaluated.cents[key as string]), 'A translated workbook cell has no numeric result',409)
   return [month,evaluated.cents[key as string]]
  })))
 }
 return result
}

