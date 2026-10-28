import { entityLedger } from './entity-ledger'
import { entityLedgerEvidence } from './entity-ledger-evidence'
import { entityCalculation } from './entity-calculation'
import { boundEntity } from './entity-scope'
import { INPUT_KINDS } from './model'
import { requireFinance, requireMember, requirePayDetail } from './access'
import type { Context } from './context'
import { dimensionCommands } from './dimensions'
import { entityAllowed } from './entity-access'
import { entityEliminations } from './entity-eliminations'
import { entityRate } from './entity-rates'
import { bump } from './plan'
import { scenarioAccess } from './scenario-access'
import { all, find, get, put, requireThat, text, uid, type Data } from './types'

export function requireEntityFinance(c: Context) {
 requireFinance(c.x)
 requireThat(!c.x.actor.token && ['owner', 'admin'].includes(c.x.actor.baseRole), 'Entity configuration requires the native owner or administrator session', 403)
}

export async function entityCommands(c: Context, op: string, b: Data): Promise<Data | undefined> {
 if (!['entity-save', 'entity-rate', 'entity-elimination-save', 'entity-elimination-delete'].includes(op)) return undefined
 requireEntityFinance(c)
 if (op === 'entity-rate') return entityRate(c, b)
 if (op.startsWith('entity-elimination-')) return entityEliminations(c, op, b)
 const prior = b.id ? get(c.s, 'entity', b.id) : undefined
 const id = prior?.id ?? uid(), name = text(b.name, 'Entity name')
 const scenario = scenarioAccess(c.s, c.x, b.scenario ?? prior?.scenario)
 requireThat(scenario.status === 'working' && !scenario.sandbox && scenario.kind !== 'proposal', 'Bind an entity to an official working plan', 409)
 requireThat(!prior || prior.scenario === scenario.id, 'An entity plan cannot be replaced; create another entity for another plan', 409)
 requireThat(!all(c.s, 'entity').some(e => e.id !== id && e.scenario === scenario.id), 'Each entity needs its own source plan', 409)
 const inherited = boundEntity(c.s, scenario)
 const inputs = [...c.s.values()].filter(r => INPUT_KINDS.includes(r.kind as any) && r.value.scenario === scenario.id)
 if (!prior && inputs.some(r => r.kind === 'position' || r.value.line && find(c.s, 'line', r.value.line)?.payroll)) requirePayDetail(c.x)
 requireThat(prior || !inherited || !all(c.s, 'scenario').some(sc => sc.parent === scenario.id), 'Bind this source plan before creating its derived versions', 409)
 requireThat(!all(c.s, 'entity').some(e => e.id !== id && e.name.toLowerCase() === name.toLowerCase()), 'An entity with this name exists')
 const currency = text(b.currency ?? prior?.currency, 'Local currency').toUpperCase()
 requireThat(/^[A-Z]{3}$/.test(currency), 'Use a three-letter currency code')
 requireThat(!prior || prior.currency === currency, 'The local currency is fixed after creating an entity; create a separate entity plan for another currency', 409)
 const groupId = text(b.group ?? prior?.group ?? scenario.id, 'Consolidation scenario')
 const groupScenario = scenarioAccess(c.s, c.x, groupId)
 requireThat(!groupScenario.sandbox && groupScenario.kind !== 'proposal', 'Choose an official plan for the consolidation group', 409)
 requireThat(!prior || prior.group === groupId, 'An entity cannot move between consolidation groups', 409)
 const group = find(c.s, 'entity-group', groupId)
 const reporting = text(b.reporting ?? group?.reporting ?? 'USD', 'Reporting currency').toUpperCase()
 requireThat(/^[A-Z]{3}$/.test(reporting), 'Use a three-letter reporting currency code')
 requireThat(!group || group.reporting === reporting, 'The reporting currency is fixed for this consolidation group', 409)
 if (!group) put(c.s, 'entity-group', groupId, { reporting, name: get(c.s, 'scenario', groupId).name })
 let dimension = find(c.s, 'entity-settings', 'main')?.dimension
 if (!dimension) {
  const existing = all(c.s, 'dimension').find(d => d.name.toLowerCase() === 'entity')
  dimension = existing?.id ?? dimensionCommands(c, 'dimension', { name: 'Entity' })!.id
  put(c.s, 'entity-settings', 'main', { dimension })
 }
 const member = prior?.member ?? dimensionCommands(c, 'dimension-member', { dimension, name })!.id
 if (prior && prior.name !== name) dimensionCommands(c, 'dimension-member', { id: member, dimension, name })
 put(c.s, 'entity', id, { ...prior, name, scenario: scenario.id, group: groupId, currency, dimension, member })
 put(c.s, 'scenario', scenario.id, { ...scenario, currency, entity: id })
 if (!prior) for (const row of inputs) {
  const dimensions = { ...row.value.dimensions }
  if (inherited) {
   requireThat(dimensions[inherited.dimension] === undefined || dimensions[inherited.dimension] === inherited.member, 'Review the source plan entity tags before binding it', 409)
   delete dimensions[inherited.dimension]
  }
  put(c.s, row.kind, row.id, { ...row.value, dimensions: { ...dimensions, [dimension]: member } })
 }
 bump(c, get(c.s, 'scenario', scenario.id), op, id, { name, currency, group: groupId })
 c.activity.push({ action: op, record: id, scenario: scenario.id, detail: { name, currency, group: groupId, dimension, member } })
 return get(c.s, 'entity', id)
}

export async function entitiesView(c: Context) {
 requireMember(c.x)
 const entities = all(c.s, 'entity').filter(e => entityAllowed(c.s, c.x, e))
 const finance = c.x.role === 'finance' && !c.x.actor.token && ['owner', 'admin'].includes(c.x.actor.baseRole)
 const origins = finance ? entities.flatMap(entity => ['revenue', 'expense', 'schedule', 'formula'].flatMap(kind => all(c.s, kind).filter(input => input.scenario === (entity.forecast??entity.scenario)).flatMap(input => {
  const line = find(c.s, 'line', input.line)
  return line && !line.payroll && !line.nonCash ? [{ entity: entity.id, origin: input.originId, name: input.name, type: line.type, line: line.name }] : []
 }))) : []
 const ledgerSources=finance&&c.x.payDetail?Object.fromEntries(await Promise.all(entities.map(async e=>[e.id,(await entityLedger(c,e.id)).filter(r=>!find(c.s,'line',r.target)?.payroll).map(({rows,...r})=>r)]))):{}
 const ledgerEvidence=finance&&c.x.payDetail?await Promise.all(entities.filter(e=>e.forecast).map(async e=>{const {calculation}=await entityCalculation(c,e);return {entity:e.id,through:calculation.actualsThrough,...(calculation.actualsThrough?await entityLedgerEvidence(c,e,calculation.actualsThrough):{rows:[],fingerprint:null})}})):[]
 return { ledgerSources, ledgerEvidence, entities, groups: all(c.s, 'entity-group').filter(g => entities.some(e => e.group === g.id)), rates: finance ? Object.fromEntries(entities.map(e => [e.id, find(c.s, 'entity-fx', e.id) ?? null])) : {}, rules: finance ? all(c.s, 'entity-elimination').filter(r => entities.some(e => e.group === r.group)) : [], origins, finance }
}
