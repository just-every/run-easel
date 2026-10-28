import type { RunData } from '../base/run-site'
import { runPricing } from '../base/run-pricing'

/** Every string and command on the run site's Run page (run-easel.com/run); the header's and footer's Source link too. */
export const run: RunData = {
 name: 'Easel',
 repository: 'https://github.com/just-every/run-easel',
 clone: 'npx -y @runeditrun/rer dev just-every/run-easel',
 licence: 'MIT',
 docs: true,
 paths: { product: null },
 pricing: runPricing,
}
