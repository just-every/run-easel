import { register } from 'node:module';

// rer deliberately filters project environment names from isolated tool probes.
// Carry this CI-only dependency in the inherited import URL itself.
const playwright = new URL(import.meta.url).searchParams.get('playwright');
if (!playwright || new URL(playwright).protocol !== 'file:') throw Error('CI requires an absolute Playwright file URL');
// Legacy journeys import the package directly, including from fresh clones.
register('./playwright-loader.mjs', import.meta.url, { data: { playwright } });
