import { requireThat } from './types'

/** An uploaded original. Call/version/sheet identify its export context, never credentials. */
export type MoveArtifact = { name: string; text?: string; base64?: string; call?: string; version?: string; sheet?: string }
export type MoveExport = {
 levels: { id: string; name: string; parent?: string }[]
 accounts: { id: string; name: string; type?: string }[]
 dimensions: { id: string; name: string; members: { id: string; name: string; parent?: string }[] }[]
 versions: { id: string; name: string }[]
 data: { version: string; account: string; level: string; month: string; amount: string; dimensions?: Record<string, string>; location: string }[]
 personnel: { id: string; version: string; level: string; account: string; values: Record<string, string>; structuralColumns: string[]; dimensions?: Record<string,string>; location: string }[]
 unmapped: { location: string; reason: string }[]
}

export const emptyMoveExport = (): MoveExport => ({ levels: [], accounts: [], dimensions: [], versions: [], data: [], personnel: [], unmapped: [] })

export function moveBytes(file: MoveArtifact): Uint8Array {
 requireThat(Boolean(file.text !== undefined) !== Boolean(file.base64 !== undefined), `${file.name}: supply exactly one original text or base64 file`)
 if (file.text !== undefined) return new TextEncoder().encode(file.text)
 let raw: string
 try { raw = atob(file.base64!) } catch { requireThat(false, `${file.name}: invalid base64 file`) }
 return Uint8Array.from(raw!, ch => ch.charCodeAt(0))
}

export function moveText(file: MoveArtifact): string {
 const bytes = moveBytes(file)
 requireThat(bytes.length <= 8_000_000, `${file.name}: export exceeds 8 MB`)
 try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '') }
 catch { requireThat(false, `${file.name}: export must be UTF-8`) }
}
