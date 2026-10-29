import { validateDestination } from '@runeditrun/rer/internal/modules/integrations/core/destination.ts'

/** Shared by owner registration, delivery rechecks and the enforcing gateway.
 * Base supplies HTTPS/IP/public-DNS policy; these additional local namespaces
 * must be refused even if allowlisted or answered with a public address. */
export function webhookDestination(value: string): URL {
 const url = validateDestination(value)
 if (url.search || !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/.test(url.hostname) || /(?:^|\.)(?:lan|home|onion|alt|example|home\.arpa)$/.test(url.hostname)) throw new Error('Use a public HTTPS receiver hostname without query parameters')
 return url
}
