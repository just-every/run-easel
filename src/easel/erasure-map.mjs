import { createHash } from 'node:crypto'

export const erasedHash = value => createHash('sha256').update(String(value).normalize('NFKC').toLowerCase()).digest('hex')
/** Match identity spellings without retaining their plaintext in the erasure map. */
export function erasureMatchers(values) {
 return [...new Set(values.filter(value => typeof value === 'string' && value.trim()))].map(value => ({ length: value.length, sha256: erasedHash(value) }))
}
/** Transform only explicitly associated provider fields and mapping keys. */
export function transformPayrollIdentity(item, maps) {
 if (!item || Array.isArray(item) || typeof item !== 'object') return item
 let result = item
 for (const map of maps) for (const scope of [...(map.payrollScopes ?? []), ...(map.moveScopes ?? [])]) {
  if (typeof item.originId === 'string' && 'holder' in item && (scope.positionHashes ?? []).includes(erasedHash(item.originId))) result = {...result,holder:map.pseudonym}
  if (typeof item.provider !== 'string' || erasedHash(item.provider) !== scope.providerHash) continue
  if (typeof item.employeeId === 'string' && erasedHash(item.employeeId) === scope.employeeHash) {
   result = { ...result, employeeId:map.pseudonym, ...('name' in item ? {name:map.pseudonym} : {}) }
  }
  for (const field of ['positionMap', 'memberMap']) if (item[field] && typeof item[field] === 'object') {
   result = { ...result, [field]:Object.fromEntries(Object.entries(result[field]).map(([key,value]) => erasedHash(key) === scope.employeeHash ? [map.pseudonym, field === 'memberMap' ? map.pseudonym : value] : [key,value])) }
  }
 }
 return result
}
export function transformErased(value, maps) {
 const matchers = maps.flatMap(map => (map.matchers ?? []).map(matcher => ({ ...matcher, pseudonym: map.pseudonym }))).sort((a, b) => b.length - a.length)
 const string = raw => {
  const text = raw; let output = ''
  for (let at = 0; at < text.length;) {
   const match = matchers.find(matcher => at + matcher.length <= text.length && (at === 0 || !/[\p{L}\p{N}_]/u.test(text[at - 1])) && (at + matcher.length === text.length || !/[\p{L}\p{N}_]/u.test(text[at + matcher.length])) && erasedHash(text.slice(at, at + matcher.length)) === matcher.sha256)
   if (match) { output += match.pseudonym; at += match.length } else output += text[at++]
  }
  return output
 }
 const visit = item => {
  if (typeof item === 'string') {
   // Rows may carry serialized JSON; recurse into it so escaped spellings do not leak.
   if (/^\s*[\[{]/.test(item)) { try { return JSON.stringify(visit(JSON.parse(item))) } catch {} }
   return string(item)
  }
  if (Array.isArray(item)) return item.map(visit)
  if (item && typeof item === 'object') return Object.fromEntries(Object.entries(transformPayrollIdentity(item, maps)).map(([key, child]) => [string(key), typeof item.provider === 'string' && typeof item.employeeId === 'string' && ['name','employeeId'].includes(key) ? child : visit(child)]))
  return item
 }
 return maps.length ? visit(value) : value
}
