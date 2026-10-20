import { createPortability, PortabilityError } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive } from '@runeditrun/rer/modules/portability/files';
import { recoverEaselLegacyArchive } from './legacy-recovery.mjs';
import { legacyTargetState, requireLegacyEmpty } from '@runeditrun/rer/modules/portability/legacy-safety';
import { createEaselExportService } from './erasure-export.mjs';
import { openRestore } from './restore-context.mjs';

async function restore(direction, { root, path, journal, transient, legacyRecovery }) {
 const connection = await openRestore(root);
 try {
  if (direction === 'legacy-preflight') {
   await requireLegacyEmpty(connection.options, await legacyTargetState(connection.options.db, connection.options.migrations));
   return { checkedEmpty: true };
  }
  if (direction === 'export') return await exportArchive(await createEaselExportService(connection.options), path, transient);
  // The imported context carries the executable Easel policy and migration
  // replay. Base still verifies both hashes and owns atomic publication/audit.
  return await (legacyRecovery
   ? recoverEaselLegacyArchive(connection.options, path, legacyRecovery.output, transient, legacyRecovery.acknowledged)
   : importArchive(await createPortability(connection.options), path, transient, journal));
 } finally { await connection.close(); }
}

try {
 console.log(JSON.stringify({ ok: true, receipt: await restore(process.argv[2], JSON.parse(process.argv[3])) }));
} catch (error) {
 // Native errors may contain private data. Only symbolic portability errors
 // cross the transport, where the adapter retains its public error mapping.
 console.log(JSON.stringify({ ok: false, ...(error instanceof PortabilityError
  ? { portability: { code: error.code.split(':')[0], status: error.status,
   ...(error.code.startsWith('schema_mismatch:migration_data:') ? { migration: error.code.slice('schema_mismatch:migration_data:'.length) } : {}) } }
  : { reason: error.message === 'archive_json' ? 'archive_json' : 'native_error' }) }));
 process.exitCode = 1;
}
