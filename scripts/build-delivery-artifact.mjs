import { readFile, rm } from 'node:fs/promises';
import { produceSeedArtifact } from './delivery/base/package.mjs';

const config = JSON.parse(await readFile(new URL('./delivery/base/packaging.json', import.meta.url)));
await rm('delivery-artifact', { recursive: true, force: true });
const output = await produceSeedArtifact({ config });
console.log('Delivery artifact prepared: delivery-artifact/rer-worker-artifact.json');
