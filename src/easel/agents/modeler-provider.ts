import type { Bindings } from '../../auth.server'
import { requireThat, type Data } from '../types'
import { commentaryKey } from './commentary-settings'
import { modelerOutput } from './modeler-schema'

export type ModelerResult = { status: 'received'; proposal: Data } | { status: 'refused' | 'unknown'; reason: string }
async function body(response: Response) {
 const reader = response.body?.getReader(); requireThat(reader, 'Empty response')
 const chunks: Uint8Array[] = []; let size = 0
 try {
  for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; requireThat(size <= 96_000, 'Model output is too large'); chunks.push(next.value) }
 } finally { await reader.cancel().catch(() => {}) }
 const bytes = new Uint8Array(size); let at = 0
 for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length }
 return JSON.parse(new TextDecoder().decode(bytes)) as Data
}
/** One call, no tools, no redirects and no retry or fallback. */
export async function performModeler(env: Bindings, intent: Data): Promise<ModelerResult> {
 try {
  const key = await commentaryKey(env)
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(60_000), headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(intent.request) })
  if (!response.ok) { await response.body?.cancel(); return { status: 'refused', reason: `OpenAI refused the request (HTTP ${response.status}); allowance retained` } }
  const value = await body(response)
  if (value.status !== 'completed' || !Array.isArray(value.output)) return { status: 'unknown', reason: 'No completed modeler result was received; allowance retained' }
  const content = value.output.filter((item: Data) => item.type === 'message').flatMap((item: Data) => Array.isArray(item.content) ? item.content : [])
  if (content.some((item: Data) => item.type === 'refusal')) return { status: 'refused', reason: 'OpenAI declined the modeler request; allowance retained' }
  const texts = content.filter((item: Data) => item.type === 'output_text')
  if (texts.length !== 1 || typeof texts[0].text !== 'string') return { status: 'refused', reason: 'The model returned no single structured proposal; allowance retained' }
  try { return { status: 'received', proposal: modelerOutput(JSON.parse(texts[0].text)) } }
  catch { return { status: 'refused', reason: 'The model returned unsupported proposal structure; allowance retained' } }
 } catch { return { status: 'unknown', reason: 'No usable modeler response was received; allowance retained. Review Activity before another request.' } }
}
