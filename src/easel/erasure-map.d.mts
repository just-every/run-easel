export type ErasureMap = { pseudonym: string; matchers: {length: number; sha256: string}[] }
export function erasedHash(value: unknown): string
export function erasureMatchers(values: unknown[]): {length: number; sha256: string}[]
export function transformErased<T>(value:T,maps:ErasureMap[]):T
