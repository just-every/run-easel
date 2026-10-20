// Owner-entered outbound destinations (ct EGRESS RULE, 19 Oct 20:50Z). Until
// Base's resolved-address egress door is adopted, a destination is checked by
// its literal host and name only: HTTPS, no credentials or fragment, no
// loopback/private/link-local/reserved IP literal and no local-only name.
// Redirects are refused at fetch time. Resolved-address pinning is the Gap.
import { Fault, requireThat } from './types'

const LOCAL_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|localdomain)$/i

function privateIPv4(host: string) {
 const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
 if (!m) return null
 const [a, b] = [Number(m[1]), Number(m[2])]
 return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
}

/** Returns the normalized URL or refuses with a reason the owner can act on. */
export function ownerDestination(raw: unknown, label: string) {
 let url: URL
 try { url = new URL(String(raw ?? '').trim()) } catch { throw new Fault(400, `${label} must be a full https:// URL`) }
 requireThat(url.protocol === 'https:', `${label} must use https`, 400)
 requireThat(!url.username && !url.password, `${label} must not carry credentials in the URL`, 400)
 requireThat(!url.hash, `${label} must not have a fragment`, 400)
 const host = url.hostname.toLowerCase()
 requireThat(!host.startsWith('['), `${label} must use a public host name, not an IPv6 literal`, 400)
 const v4 = privateIPv4(host)
 requireThat(v4 !== true, `${label} points at a private, loopback or reserved address`, 400)
 requireThat(v4 === false || (host.includes('.') && !LOCAL_NAMES.test(host)), `${label} must use a public host name`, 400)
 return url
}

/** Workers fetch with redirects refused and a bounded wait. */
export const egressFetch = (url: URL, init: RequestInit) => fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
