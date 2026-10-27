import type { Data } from './types'
import type { Sheet } from './xlsx-write'

export function gaugeFreshnessSheet(rows: Data[] = [], prefix = ''): Sheet {
 return { name: `${prefix}Gauge freshness`, rows: [
  ['Live observation health; accepted values and frozen captures remain unchanged.'],
  ['Source', 'Month', 'Version', 'Last successful observation', 'Cadence', 'Stale', 'Error', 'Accepted at', 'Accepted source as of', 'Accepted digest', 'Observation comparison'],
  ...rows.map(r => [r.source, r.month, r.version ?? '', r.lastSuccess, r.cadence, r.stale ? 'Stale' : 'Current', r.error, r.acceptedAt, r.acceptedObservedAt, r.acceptedDigest ?? '', r.observationStatus]),
 ] }
}
