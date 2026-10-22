// REPORT-003: a board pack template names which sections a pack contains.
// Finance edits templates; a draft pack binds the template it was created
// from, and the published snapshot keeps only those sections.
import { requireCapability } from './access'
import type { Context } from './context'
import { all, get, put, remove, requireThat, text, uid, type Data } from './types'

export const PACK_SECTIONS = ['statements', 'kpis', 'charts', 'commentary', 'decisions', 'appendix'] as const
export type PackSection = typeof PACK_SECTIONS[number]
export const SECTION_LABELS: Record<PackSection, string> = { statements: 'Statements', kpis: 'KPIs', charts: 'Charts', commentary: 'Variance commentary', decisions: 'Decisions', appendix: 'Appendix tables' }
export const DEFAULT_TEMPLATE = 'default'

/** The built-in template holds every section; saved templates may hold any non-empty subset. */
export function packTemplate(c: Context, id: unknown): Data {
 if (id === undefined || id === '' || id === DEFAULT_TEMPLATE) return { id: DEFAULT_TEMPLATE, name: 'Board pack', sections: [...PACK_SECTIONS], builtIn: true }
 return get(c.s, 'pack-template', id, 'template')
}
export const packTemplates = (c: Context) => [packTemplate(c, DEFAULT_TEMPLATE), ...all(c.s, 'pack-template').sort((a, b) => a.name.localeCompare(b.name))]

export function packTemplateCommands(c: Context, op: string, b: Data): Data | undefined {
 if (op === 'pack-template-save') {
  requireCapability(c.x, 'publishing', c.s)
  const sections = Array.isArray(b.sections) ? PACK_SECTIONS.filter(s => b.sections.includes(s)) : []
  requireThat(sections.length > 0 && b.sections.every((s: unknown) => PACK_SECTIONS.includes(s as PackSection)), `Choose at least one section: ${PACK_SECTIONS.join(', ')}`)
  const name = text(b.name, 'Template name')
  requireThat(!all(c.s, 'pack-template').some(t => t.id !== b.id && t.name.toLowerCase() === name.toLowerCase()), 'A template already has this name', 409)
  const id = typeof b.id === 'string' && b.id ? get(c.s, 'pack-template', b.id, 'template').id : uid()
  put(c.s, 'pack-template', id, { name, sections, savedBy: c.x.actor.email, savedAt: c.now })
  c.activity.push({ action: op, record: id, detail: { name, sections } })
  return get(c.s, 'pack-template', id)
 }
 if (op === 'pack-template-delete') {
  requireCapability(c.x, 'publishing', c.s)
  const t = get(c.s, 'pack-template', b.id, 'template')
  requireThat(!all(c.s, 'pack').some(p => p.template === t.id && p.status === 'draft'), 'A draft pack uses this template', 409)
  remove(c.s, 'pack-template', t.id)
  c.activity.push({ action: op, record: t.id, detail: { name: t.name } })
  return { deleted: t.id }
 }
 return undefined
}
