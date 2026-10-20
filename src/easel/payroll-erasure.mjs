// Finance's explicit provider/employee associations are the only employee
// identity authority. Durable receipts keep hashes, never source identifiers.
import { erasedHash } from './erasure-map.mjs'

export function payrollErasureScopes(records, email) {
 const mappings = records.filter(r=>r.kind === 'payroll-file-mapping').map(r=>r.value)
 const scopes = new Map()
 for (const mapping of mappings) for (const [employee, member] of Object.entries(mapping.memberMap ?? {})) {
  if (member !== email) continue
  const providerHash = erasedHash(mapping.provider), employeeHash = erasedHash(employee)
  scopes.set(`${providerHash}:${employeeHash}`, { providerHash, employeeHash, originals:[] })
 }
 return [...scopes.values()].map(scope=>({...scope, positionHashes:[...new Set(mappings.filter(m=>erasedHash(m.provider)===scope.providerHash).flatMap(m=>Object.entries(m.positionMap ?? {}).filter(([id])=>erasedHash(id)===scope.employeeHash).map(([,origin])=>erasedHash(origin))))]}))
}

/** Include later retained files in the same provider scope. A source digest
 * binds each column definition to its original; short IDs never become a
 * global string matcher. Undone imports still retain originals and journals. */
export function payrollOriginalScopes(maps, records, jobs = []) {
 const mappings = records.filter(r => r.kind === 'payroll-file-mapping').map(r => r.value)
 const imports = records.filter(r => r.kind === 'payroll-import').map(r => r.value)
 return maps.map(map => ({ ...map, payrollScopes:(map.payrollScopes ?? []).map((scope) => ({ ...scope, originals: [
  ...(scope.originals ?? []),
  ...mappings.filter(m => erasedHash(m.provider) === scope.providerHash).flatMap(m => imports.filter(i => i.destination === m.batch).map(i => ({ sha256:i.sha256, jobId:jobs.find(j=>j.destination===i.destination)?.id, columns:m.config.columns, ...(m.config.sheet ? {sheet:m.config.sheet} : {}) }))),
 ] })) }))
}
