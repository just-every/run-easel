export type MoveIdentityOriginal = {
 sha256: string
 jobId?: string
 file: string
 columns: { employeeId: string; name?: string }
 sheet?: string
 xmlCdata?: boolean
 envelope?: 'export-api' | 'planful-dimension'
 delimiter?: ';' | ','
}
export type MoveErasureScope = {
 providerHash: string
 employeeHash: string
 positionHashes: string[]
 originals: MoveIdentityOriginal[]
}
export function moveErasureScopes(records: any[], email: string): MoveErasureScope[]
export function moveOriginalScopes<T extends { moveScopes?: MoveErasureScope[] }>(maps: T[], records: any[], jobs?: { id: string; destination: string }[]): (T & { moveScopes: MoveErasureScope[] })[]
