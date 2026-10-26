import { RerError, refuse } from '@runeditrun/rer/errors';
import { createPortability, PortabilityError } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive, fileRecords } from '@runeditrun/rer/modules/portability/files';
import { createEaselExportService } from './erasure-export.mjs';
import { openRestore } from './restore-context.mjs';
import { withHostedDatabase } from './hosted-target.mjs';

export async function hostedTransfer(direction, input) {
 try {
  if (input.legacyRecovery || input.journal) throw refuse('Hosted restore requires a normal v2 archive without a separate journal.');
  if (direction === 'import') {
   // Authenticate the entire file before any control-plane or database write.
   for await (const record of fileRecords(input.path)) input.signal?.throwIfAborted();
  }
  return await withHostedDatabase(input, async db => {
   const connection = await openRestore(input.root, db);
   try {
    return direction === 'export'
     ? await exportArchive(await createEaselExportService(connection.options), input.path, input.transient)
     : await importArchive(await createPortability(connection.options), input.path, input.transient);
   } finally { await connection.close(); }
  });
 } catch (error) {
  input.signal?.throwIfAborted();
  if (error.message === 'archive_json') throw new RerError('invalid_archive', 'The archive contains invalid JSON.', 2);
  if (error instanceof PortabilityError) {
   const code = error.code.split(':')[0];
   throw new RerError(error.status === 409 ? 'restore_refused' : 'transfer_failed', `Hosted portability refused or failed the archive operation (${code}).`, error.status === 409 ? 4 : 1);
  }
  if (error instanceof RerError) throw error;
  // Provider diagnostics can include query values. Preserve no native error,
  // cause, response body, SQL text or credential in the CLI result or capture.
  throw new RerError('transfer_failed', 'Hosted portability failed while checking deployment custody or transferring data. Verify the held receipt, matching release and Cloudflare credential permissions before retrying.', 1);
 }
}
