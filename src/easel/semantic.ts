/** Compare JSON-like assumptions by value. Object keys are unordered; arrays are ordered. */
export function semanticEqual(a: unknown, b: unknown): boolean {
 if (a === b) return true
 if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
 if (Array.isArray(a) || Array.isArray(b)) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => semanticEqual(value, b[i]))
 }
 const left = a as Record<string, unknown>, right = b as Record<string, unknown>
 const keys = Object.keys(left)
 return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && semanticEqual(left[key], right[key]))
}
