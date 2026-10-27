import type { D } from './shared'

export function GaugeFreshness({ rows = [], department = '' }: { rows?: D[]; department?: string }) {
 const visible = rows.filter(row => !department || row.department === department)
 if (!visible.length) return null
 return <section className="card" aria-label="Gauge source freshness"><h2>Gauge source freshness</h2>
  {visible.map((row, index) => <div className="card-row" key={index}>
   <p><strong>Gauge · {row.month}{row.version ? ` · ${row.version}` : ''}</strong> · {row.stale ? 'Stale observation' : 'Current observation'} · {row.cadence}</p>
   <p>Last successful observation: {row.lastSuccess ?? 'Unavailable'}. Accepted into this model: {row.acceptedAt}. Accepted source as of: {row.acceptedObservedAt}.</p>
   {row.error && <p role="alert" className="error">{row.error}</p>}
   <p>{row.observationStatus === 'changed-since-acceptance' ? 'The latest successful observation differs from the accepted source. Model values still use the accepted observation.' : row.observationStatus === 'unavailable' ? 'No successful observation is available for this source month.' : 'The latest successful observation matches the accepted source.'}</p>
   {row.acceptedDigest && <details><summary>Accepted provenance</summary><p className="wrap" style={{ overflowWrap: 'anywhere' }}>{row.name} · {row.acceptedDigest}</p></details>}
  </div>)}
 </section>
}
