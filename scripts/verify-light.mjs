import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const documents = new Set(['CONTRACT.md', 'ACCEPTANCE.md', 'CLAIMS.md', 'docs/CLAIMS.md', 'HANDOVER.md', 'STATUS.md']);
const allowed = path => documents.has(path) || path === 'sources.lock.json'
 || /^(?:evidence|\.artifacts)\/.+\.(?:md|txt|png|jpe?g|pdf)$/.test(path);
const relative = path => typeof path === 'string' && path.length > 0 && !path.startsWith('/')
 && !path.includes('\\') && !path.split('/').some(part => !part || part === '.' || part === '..');
const checks = new Set(['node scripts/contract-docs.mjs check', 'node scripts/edition-authoring/cli.mjs check',
 'pnpm exec rer check', 'pnpm typecheck', 'pnpm exec rer build', 'pnpm exec rer build --site']);

// The reader table records reviewed dependencies on the light allowlist. A new
// reader, wildcard member or command shape requires review before light CI.
export async function lightReaders(files, { cwd = process.cwd(), plan } = {}) {
 if (!files.length || !files.every(allowed) || !plan.readers || typeof plan.readers !== 'object' || Array.isArray(plan.readers)) return;
 for (const [path, dependencies] of Object.entries(plan.readers)) {
  if (!/^tests\/[A-Za-z0-9_./-]+\.mjs$/.test(path) || !relative(path)
   || !Array.isArray(dependencies) || !dependencies.every(relative)) return;
 }
 for (const path of ['edition.json', 'sources.lock.json', 'scripts/edition-authoring/cli.mjs', 'scripts/contract-docs.mjs']) await access(join(cwd, path));
 const changed = new Set(files), commands = new Set();
 for (const shard of [...plan.push, ...plan.nightly]) for (const command of shard.commands) {
  if (checks.has(command)) continue;
  const normalized = command.replace(/^EASEL_EVIDENCE="\$RUNNER_TEMP\/[A-Za-z0-9_/-]+" /, '')
   .replace(/^perl -e 'setpgrp\(0,0\); exec @ARGV' -- /, '');
  const match = /^node(?: --test --test-concurrency=1 --test-shard=[12]\/2)? (tests\/[A-Za-z0-9_./*-]+\.mjs)(?: --existing-build| "nightly-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}")?$/.exec(normalized);
  if (!match) return;
  const path = match[1];
  const paths = path === 'tests/*.test.mjs' ? (await readdir(join(cwd, 'tests'))).filter(name => name.endsWith('.test.mjs')).map(name => `tests/${name}`) : [path];
  if (!paths.length || path.includes('*') && path !== 'tests/*.test.mjs') return;
  for (const reader of paths) {
   if (!Object.hasOwn(plan.readers, reader)) return;
   await access(join(cwd, reader));
   if (plan.readers[reader].some(dependency => changed.has(dependency))) {
    // Browser readers need the browser shard's setup, so retain full coverage.
    if (shard.browser) return;
    // Retain original arguments for reviewed non-browser consumers.
    commands.add(path === 'tests/*.test.mjs' ? `node --test --test-concurrency=1 ${reader}` : command);
   }
  }
 }
 // Contract projection and source lock checks always run in the light job.
 return [...commands];
}
