import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {deploymentSpec} from './delivery/base/spec.mjs';
const config = JSON.parse(await readFile(new URL('../packaging.json', import.meta.url)));
const bytes = JSON.stringify(await deploymentSpec(process.cwd(), config.artifact.specInputs), null, 2) + '\n';
const destination = new URL('../management/integration/deployment-spec.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== bytes) throw Error('Deployment specification differs from the real build and source policy. Run pnpm delivery:spec.');
  console.log('Deployment specification matches the real build and source policy.');
} else {
  await mkdir(new URL('.', destination), {recursive: true});
  await writeFile(destination, bytes);
  console.log('Wrote management/integration/deployment-spec.json');
}
