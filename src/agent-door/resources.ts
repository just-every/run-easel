import type { ResourceDefinition } from '../modules/agent-door/index.ts'
import { nativeAction, recordClasses } from './native.ts'
import type { Data } from '../easel/types'

const families = ['scenarios', 'proposals'] as const

export function scenarioLink(record: Data) {
 const family = record.kind === 'proposal' ? 'proposals' : 'scenarios'
 return { uri: `easel://${family}/${encodeURIComponent(record.id)}`, name: String(record.name ?? 'Scenario') }
}

/** Resource contents use the native view, erasure projection and live read fence. */
export function planningResources(): ResourceDefinition[] {
 return families.map(family => ({
  uriTemplate: `easel://${family}/{id}`, name: family === 'proposals' ? 'Planning proposal' : 'Planning scenario',
  description: 'Current native scenario view under the sponsoring person’s live grants.',
  mimeType: 'application/json', scope: 'planning:read', classes: ['standard', 'sensitive'],
  classify: record => recordClasses(record.json),
  async read(uri, ctx) {
   const encoded = uri.slice(`easel://${family}/`.length)
   let id: string
   try { id = decodeURIComponent(encoded) } catch { return null }
   if (!id || encodeURIComponent(id) !== encoded) return null
   const { result } = await nativeAction('scenario', { scenario: id }, ctx, true)
   if (family === 'proposals' && result.scenario?.kind !== 'proposal') return null
   return { json: result, untrusted: true }
  },
 }))
}
