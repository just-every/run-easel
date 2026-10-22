// Finance's explicit association is authoritative. Source names never establish
// membership, and receipts carry only provider/employee/position hashes.
import { erasedHash } from './erasure-map.mjs'

const mappingsOf = records => records.filter(record => record.kind === 'move-personnel-mapping').map(record => record.value)
const origins = (mapping, employeeHash) => Object.entries(mapping.positionMap ?? {})
 .filter(([employee]) => erasedHash(employee) === employeeHash)
 .flatMap(([, value]) => Array.isArray(value) ? value : [value])
 .filter(value => typeof value === 'string' && value)
 .map(erasedHash)

// Select the supported configuration fields rather than copying a source row or
// arbitrary mapping fields into the durable erasure receipt.
function originalOf(original, jobId) {
 if (typeof original.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(original.sha256) || typeof original.file !== 'string' || typeof original.columns?.employeeId !== 'string') throw new Error('Move-in identity original needs a digest, file and mapped employee ID column')
 if (original.columns.name !== undefined && typeof original.columns.name !== 'string') throw new Error('Move-in original name column must be a heading')
 if (original.delimiter !== undefined && ![',',';'].includes(original.delimiter)) throw new Error('Move-in original delimiter must be comma or semicolon')
 if (original.envelope !== undefined && !['export-api','planful-dimension'].includes(original.envelope)) throw new Error('Unsupported move-in identity original envelope')
 return {
  sha256: original.sha256, file: original.file,
  columns: { employeeId: original.columns.employeeId, ...(original.columns.name === undefined ? {} : { name: original.columns.name }) },
  ...(jobId ? { jobId } : {}),
  ...(original.sheet === undefined ? {} : { sheet: original.sheet }),
  ...(original.xmlCdata ? { xmlCdata: true } : {}),
  ...(original.envelope === undefined ? {} : { envelope: original.envelope }),
  ...(original.delimiter === undefined ? {} : { delimiter: original.delimiter }),
 }
}
const distinct = values => [...new Map(values.map(value => [JSON.stringify(value), value])).values()]

export function moveErasureScopes(records, email) {
 const mappings = mappingsOf(records), scopes = new Map()
 for (const mapping of mappings) for (const [employee, member] of Object.entries(mapping.memberMap ?? {})) {
  if (member !== email) continue
  if (typeof mapping.provider !== 'string' || !mapping.provider.startsWith('move:')) throw new Error('Move-in identity association needs its explicit move: provider namespace')
  const providerHash = erasedHash(mapping.provider), employeeHash = erasedHash(employee)
  scopes.set(`${providerHash}:${employeeHash}`, { providerHash, employeeHash })
 }
 return [...scopes.values()].map(scope => {
  const sameProvider = mappings.filter(mapping => erasedHash(mapping.provider) === scope.providerHash)
  return { ...scope, positionHashes: [...new Set(sameProvider.flatMap(mapping => origins(mapping, scope.employeeHash)))], originals: distinct(sameProvider.flatMap(mapping => (mapping.originals ?? []).map(original => originalOf(original)))) }
 })
}

/** Reconcile later originals and recorded mapping images with an established
 * hashed provider/employee association. Each destination can have several jobs
 * after undo/reimport; retain every job binding, never an arbitrary first one. */
export function moveOriginalScopes(maps, records, jobs = []) {
 const mappings = mappingsOf(records)
 return maps.map(map => ({ ...map, moveScopes: (map.moveScopes ?? []).map(scope => {
  const selected = mappings.filter(mapping => erasedHash(mapping.provider) === scope.providerHash)
  const originals = selected.flatMap(mapping => {
   const matches = jobs.filter(job => job.destination === mapping.destination)
   return (mapping.originals ?? []).flatMap(original => matches.length ? matches.map(job => originalOf(original, job.id)) : [originalOf(original)])
  })
  return { ...scope,
   positionHashes: [...new Set([...(scope.positionHashes ?? []), ...selected.flatMap(mapping => origins(mapping, scope.employeeHash))])],
   originals: distinct([...(scope.originals ?? []), ...originals]),
  }
 }) }))
}
