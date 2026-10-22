import type { MoveErasureScope } from './move-erasure.mjs'
export type ErasureMap = { moveScopes?: MoveErasureScope[]; pseudonym: string; matchers: {length: number; sha256: string}[]; payrollScopes?: {providerHash:string; employeeHash:string; originals:any[]; positionHashes?:string[]}[] }
export function erasedHash(value: unknown): string
export function erasureMatchers(values: unknown[]): {length: number; sha256: string}[]
export function transformErased<T>(value:T,maps:ErasureMap[]):T

export function transformPayrollIdentity<T>(value:T,maps:ErasureMap[]):T
