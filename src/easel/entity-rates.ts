import type { Context } from './context'
import { RATE_KINDS, type RateRow, type RateTable } from './currency-rates'
import { month } from './months'
import { decimal } from './units'
import { find, get, put, requireThat, text, type Data } from './types'

export function entityRate(c: Context, b: Data) {
 const entity = get(c.s, 'entity', b.entity)
 const group = get(c.s, 'entity-group', entity.group)
 const existing = find(c.s, 'entity-fx', entity.id)
 const reporting = text(b.reporting ?? group.reporting, 'Reporting currency').toUpperCase()
 requireThat(reporting === group.reporting, 'The entity rate must use its consolidation reporting currency')
 requireThat(entity.currency !== reporting, 'This entity already uses the reporting currency; no translation rate is needed')
 const m = month(b.month, 'Rate month')
 const keep = existing?.local === entity.currency && existing?.reporting === reporting ? existing.rates : {}
 const row: RateRow = { ...keep[m] }
 let given = false
 for (const kind of RATE_KINDS) if (b[kind] !== undefined) {
  given = true
  if (b[kind] === '' || b[kind] === null) delete row[kind]
  else {
   row[kind] = decimal(b[kind], `${kind} rate`, 6, { max: 10n ** 9n })
   requireThat(row[kind]! > 0, `${kind} rate must be above zero`)
  }
 }
 requireThat(given, 'Send at least one of budget, average or monthEnd')
 const rates = { ...keep }
 if (Object.keys(row).length) rates[m] = row; else delete rates[m]
 const table: RateTable = { local: entity.currency, reporting, rates, by: c.x.actor.email, at: c.now }
 put(c.s, 'entity-fx', entity.id, table)
 c.activity.push({ action: 'entity-rate', record: entity.id, scenario: entity.scenario, detail: { month: m, reporting, row: rates[m] ?? null } })
 return table
}
