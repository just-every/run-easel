// One fixed endpoint, one attempt. An unknown outcome consumes its allowance.
import type { Bindings } from '../../auth.server'
import { commentaryKey } from './commentary-settings'
import { requireThat, type Data } from '../types'

export type CommentaryClaim = { text: string; label: 'evidence' | 'hypothesis'; citationIds: string[] }
export type CommentaryResult = { status: 'received'; claims: CommentaryClaim[] } | { status: 'refused' | 'unknown'; reason: string }

function claims(value: unknown): CommentaryClaim[] {
 const v = value as Data
 requireThat(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && Array.isArray(v.claims) && v.claims.length > 0 && v.claims.length <= 12, 'Invalid commentary structure')
 let length = 0
 return v.claims.map((claim: Data) => {
  requireThat(claim && typeof claim === 'object' && !Array.isArray(claim) && Object.keys(claim).sort().join(',') === 'citationIds,label,text', 'Invalid claim structure')
  requireThat(typeof claim.text === 'string' && claim.text.trim().length > 0 && claim.text.length <= 1500, 'Invalid claim text')
  requireThat(claim.label === 'evidence' || claim.label === 'hypothesis', 'Unknown claim label')
  requireThat(Array.isArray(claim.citationIds) && claim.citationIds.length <= 100 && claim.citationIds.every((id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 300), 'Invalid claim citations')
  const citationIds = [...new Set<string>(claim.citationIds)]
  requireThat(claim.label !== 'evidence' || citationIds.length > 0, 'An evidence claim needs accepted-row citations')
  length += claim.text.trim().length
  requireThat(length <= 3000, 'Commentary is too long')
  return { text: claim.text.trim(), label: claim.label, citationIds }
 })
}
async function responseJson(response: Response) {
 const reader = response.body?.getReader()
 requireThat(reader, 'Empty model response')
 const chunks: Uint8Array[] = []; let size = 0
 try {
  while (true) {
   const next = await reader.read()
   if (next.done) break
   size += next.value.length
   requireThat(size <= 64_000, 'Model response is too large')
   chunks.push(next.value)
  }
 } finally { await reader.cancel().catch(() => {}) }
 const bytes = new Uint8Array(size); let offset = 0
 for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
 return JSON.parse(new TextDecoder().decode(bytes)) as Data
}
export async function performCommentary(env: Bindings, intent: Data): Promise<CommentaryResult> {
 try {
  const key = await commentaryKey(env)
  const response = await fetch('https://api.openai.com/v1/responses', {
   method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
   headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(intent.request),
  })
  if (!response.ok) { await response.body?.cancel(); return { status: 'refused', reason: `OpenAI refused the request (HTTP ${response.status}); allowance retained` } }
  const result = await responseJson(response)
  if (result.status !== 'completed' || !Array.isArray(result.output)) return { status: 'unknown', reason: 'OpenAI did not return a completed draft; allowance retained' }
  const content = result.output.filter((item: Data) => item.type === 'message').flatMap((item: Data) => Array.isArray(item.content) ? item.content : [])
  if (content.some((item: Data) => item.type === 'refusal')) return { status: 'refused', reason: 'OpenAI declined to draft commentary; allowance retained' }
  const text = content.filter((item: Data) => item.type === 'output_text')
  requireThat(text.length === 1 && typeof text[0].text === 'string', 'Missing structured model output')
  try { return { status: 'received', claims: claims(JSON.parse(text[0].text)) } }
  catch { return { status: 'refused', reason: 'OpenAI returned invalid structured commentary; allowance retained' } }
 } catch {
  // Never retain raw provider errors or bodies: they may echo input or credentials.
  return { status: 'unknown', reason: 'No usable model result was received; allowance retained. Review Activity before making another request.' }
 }
}
