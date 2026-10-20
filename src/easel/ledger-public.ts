// Allocation origins and accepted source rows are calculation inputs. Member
// projections expose their filtered schedules and aggregate statements instead.
export function publicLedger(value: any): any {
 if (Array.isArray(value)) return value.map(publicLedger)
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'ledgerAllocations').map(([key, item]) => [key, publicLedger(item)]))
 return value
}
