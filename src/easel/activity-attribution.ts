import type { Data } from './types'

/** Use the recorded authority, including the sponsor's name at preparation time. */
export function activityAttribution(row: Data): string {
 const authority = row.detail?.authority
 if (authority?.type === 'agent') return authority.label || (authority.for?.name ? `${authority.name} for ${authority.for.name}` : authority.name) || 'Agent'
 return row.actorName || authority?.name || row.actor
}
