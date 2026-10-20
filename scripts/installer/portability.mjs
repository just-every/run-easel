import { lstat } from 'node:fs/promises';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RerError, refuse } from '@runeditrun/rer/errors';
import { readArchive, PortabilityError } from '@runeditrun/rer/modules/portability';
import { fileRecords } from '@runeditrun/rer/modules/portability/files';
import { readLegacyArchive } from '@runeditrun/rer/modules/portability/format';

const transient = ['local runtime caches and logs'];
/** Import the policy inside our signal-owned worker: JSON transport cannot
 * carry its validator, and Base's file helpers do not accept an AbortSignal. */
export const easelPortability = {
 legacyRecovery: true,
 async export({ root, path, store, signal, operationToken }) {
  if (await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw refuse('Export requires a new archive path.');
  await store.run('Applying local data migrations', 'pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'easel', '--local', '--persist-to', '.wrangler/state', '--config', 'wrangler.jsonc'], {
   cwd: root, signal, env: { ...process.env, RER_LOCAL_OPERATION: operationToken, WRANGLER_SEND_METRICS: 'false' },
  });
  signal?.throwIfAborted();
  const receipt = await restoreWorker(store, 'export', { root, path, transient }, signal);
  return { target: 'local', output: relative(root, path), ...receipt };
 },
 async import({ root, path, journal, store, signal, operationToken, legacyRecovery }) {
  try {
   if (legacyRecovery && (legacyRecovery.acknowledged !== true || await lstat(legacyRecovery.output).catch(error => { if (error.code === 'ENOENT') return null; throw error; }))) {
    throw refuse('Legacy recovery requires acknowledgement and a new output archive path.');
   }
   if (legacyRecovery && journal) throw refuse('Legacy v1 metadata cannot authenticate a later-journal recovery.');
   for await (const record of fileRecords(path, legacyRecovery ? readLegacyArchive : readArchive)) signal?.throwIfAborted();
   if (journal) for await (const record of fileRecords(journal)) signal?.throwIfAborted();
   const input = { root, path, journal, transient, legacyRecovery };
   if (legacyRecovery) {
    store.report('Legacy v1 recovery: manifest metadata is unverified. Restored data will be audited and exported to a new v2 backup.');
    // Refuse a populated recovery target before applying pending migrations.
    await restoreWorker(store, 'legacy-preflight', input, signal);
   }
   await store.run('Applying local data migrations', 'pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'easel', '--local', '--persist-to', '.wrangler/state', '--config', 'wrangler.jsonc'], {
    cwd: root, signal, env: { ...process.env, RER_LOCAL_OPERATION: operationToken, WRANGLER_SEND_METRICS: 'false' },
   });
   signal?.throwIfAborted();
   const receipt = await restoreWorker(store, 'import', input, signal);
   return { target: 'local', input: relative(root, path), ...receipt,
    ...(legacyRecovery ? { output: relative(root, legacyRecovery.output) } : {}) };
  } catch (error) {
   if (error instanceof PortabilityError) {
    const code = error.code.split(':')[0];
    const refused = error.status === 409 || ['wrong_product', 'schema_mismatch', 'table_inventory', 'configuration_inventory'].includes(code);
    const message = code === 'legacy_restored_export_failed'
     ? 'Legacy data was restored and audited, but its v2 export failed. Preserve this installation, resolve the output problem, then run rer export --output FILE. Do not reset it to retry recovery.'
     : error.code.startsWith('schema_mismatch:migration_data:')
      ? `Restore refused (schema_mismatch:migration_data): Base cannot safely bridge migration ${error.code.slice('schema_mismatch:migration_data:'.length)} for this archive. Upgrade the original installation and re-export.`
      : `The portability module refused or failed the archive operation (${code}).`;
    throw new RerError(refused ? 'restore_refused' : 'transfer_failed', message, refused ? 4 : 1);
   }
   if (error.message === 'archive_json') throw new RerError('invalid_archive', 'The archive contains invalid JSON.', 2);
   throw error;
  }
 },
};

async function restoreWorker(store, direction, input, signal) {
 const child = store.spawn(direction === 'legacy-preflight' ? 'Checking empty recovery destination' : direction === 'export' ? 'Exporting local installation data' : 'Restoring local installation data', process.execPath,
  [fileURLToPath(new URL('./restore-worker.mjs', import.meta.url)), direction, JSON.stringify(input)],
  { cwd: input.root, signal, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
 let output = '';
 child.stdout.on('data', chunk => { output += chunk; });
 const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
 try {
  // Exit can precede close while a native descendant still owns a pipe. Base's
  // store retains custody of the whole tree and stops it before we return.
  await new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
 } finally { await store.stop(child); }
 const status = await closed;
 signal?.throwIfAborted();
 let result;
 try { result = JSON.parse(output.trim().split('\n').at(-1)); }
 catch { throw new RerError('transfer_failed', 'Local portability did not return a complete receipt.', 1); }
 if (status.code !== 0 || !result.ok) {
  if (result.portability) throw new PortabilityError(result.portability.migration
   ? `schema_mismatch:migration_data:${result.portability.migration}` : result.portability.code, result.portability.status);
  if (result.reason === 'archive_json') throw new RerError('invalid_archive', 'The archive contains invalid JSON.', 2);
  throw new RerError('transfer_failed', 'The local restore worker failed. Inspect the private redacted capture log.', 1);
 }
 return result.receipt;
}
