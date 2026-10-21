import type { Context } from './context'
import { get, requireThat, type Data } from './types'
import { scenarioView } from './views'
import { reportDimensionSource } from './saved-report-dimensions'

export function reportVersionDefinition(c: Context, value: unknown) {
 if (value === undefined) return []
 requireThat(Array.isArray(value) && value.length <= 50, 'Choose at most 50 comparison versions')
 return [...new Set(value.map(id => get(c.s, 'scenario', id).id))]
}

export async function reportVersions(c: Context, definition: Data, source: Awaited<ReturnType<typeof scenarioView>>) {
 return Promise.all((definition.comparisons ?? []).filter((id: string) => id !== definition.comparison).map(async (id: string) => {
  const view = await scenarioView(c, id)
  requireThat(!view.scenario.sandbox && view.scenario.kind !== 'proposal', 'Choose company-visible comparison versions', 409)
  requireThat(view.workspace.currency === source.workspace.currency, 'Report versions must use the same currency', 409)
  requireThat(JSON.stringify(view.fiscal.periods.map(p => [p.key, p.fromDate, p.throughDate])) === JSON.stringify(source.fiscal.periods.map(p => [p.key, p.fromDate, p.throughDate])), 'Report versions must use the same accounting periods', 409)
  return { id, name: view.scenario.name, view, ...await reportDimensionSource(c, id) }
 }))
}
