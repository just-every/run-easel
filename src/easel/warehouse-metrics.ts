// REPORT-007, REPORT-009: finance-approved monthly warehouse values by metric, read by
// usage revenue drivers bound to that metric (see warehouse.ts).
import { all, type Data, type State } from './types'

export function warehouseActuals(s: State, metric: string): Record<string, Data> {
 const out: Record<string, Data> = {}
 for (const m of all(s, 'warehouse-metric')) if (m.metric === metric) out[m.period] = { hundredths: m.hundredths, query: m.query, fetchedAt: m.fetchedAt }
 return out
}
