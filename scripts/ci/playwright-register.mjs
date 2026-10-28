import { register } from 'node:module';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const playwright = process.env.EASEL_PLAYWRIGHT_MODULE;
if (!playwright || !isAbsolute(playwright)) throw Error('CI requires an absolute EASEL_PLAYWRIGHT_MODULE');
// Legacy journeys import the package directly, including from fresh clones.
register('./playwright-loader.mjs', import.meta.url, { data: { playwright: pathToFileURL(playwright).href } });
