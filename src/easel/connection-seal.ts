// Provider-key custody. A domain-separated key binds ciphertext to this
// installation's session secret; authenticated data binds it to its provider.
import { requireThat } from './types'

async function key(secret: string) {
 requireThat(secret.length >= 32, 'Installation secret is not configured', 503)
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`easel:provider-custody:v1:${secret}`))
 return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const decode = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))
const GAUGE = 'easel:gauge:utilization:read:v1'
export async function sealConnection(secret: string, token: string, purpose = GAUGE) {
 const aad = new TextEncoder().encode(purpose)
 const iv = crypto.getRandomValues(new Uint8Array(12))
 const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await key(secret), new TextEncoder().encode(token))
 return `${encode(iv)}.${encode(new Uint8Array(ciphertext))}`
}
export async function openConnection(secret: string, sealed: string, purpose = GAUGE, provider = 'Gauge') {
 const aad = new TextEncoder().encode(purpose)
 try {
  const [iv, data] = sealed.split('.')
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: aad }, await key(secret), decode(data)))
 } catch { throw new Error(`${provider} credential could not be opened; reconnect in Connections`) }
}
