import { lstat } from 'node:fs/promises';
import { PortabilityError } from '@runeditrun/rer/modules/portability';
import { exportArchive, fileRecords } from '@runeditrun/rer/modules/portability/files';
import { readLegacyArchive, ArchiveVerifier } from '@runeditrun/rer/modules/portability/format';
import { legacyTargetState, requireLegacyEmpty } from '@runeditrun/rer/modules/portability/legacy-safety';
import { createEaselExportService } from './erasure-export.mjs';

// The acknowledged v1 recovery still uses Base's verified staging, erasure
// fence, atomic publication and durable recovery audit. Its final backup uses
// the same export policy as rer export, including the recovered erasure map.
export async function recoverEaselLegacyArchive(options, path, output, transient, acknowledged) {
 const requireValid = (ok, code) => { if (!ok) throw new PortabilityError(code, 409); };
 requireValid(acknowledged === true, 'legacy_acknowledgement_required');
 requireValid(typeof output === 'string' && output !== path, 'legacy_output_required');
 requireValid(!(await lstat(output).catch(error => { if (error.code === 'ENOENT') return null; throw error; })), 'legacy_output_exists');
 for await (const record of fileRecords(path, readLegacyArchive)) {}
 const target = await legacyTargetState(options.db, options.migrations);
 await requireLegacyEmpty(options, target);
 // Base's audit-enabled creation is an internal primitive at the unchanged pin.
 const { createImport, uploadPart, finalizeImport, abortImport } = await import('@runeditrun/rer/internal/modules/portability/import.mjs');
 const { policy } = await import('@runeditrun/rer/internal/modules/portability/catalogue.mjs');
 const { ensureLegacyAudit } = await import('@runeditrun/rer/internal/modules/portability/legacy-safety.mjs');
 const context = { ...options, config: policy(options.policy) };
 let id, closing, integrity, status, complete = false;
 try {
  for await (const record of fileRecords(path, readLegacyArchive)) {
   if (record.kind === 'manifest') {
    const manifest = { ...record, version: 2 };
    integrity = new ArchiveVerifier(manifest);
    id = await createImport(context, manifest, 'legacy-v1', { event: 'legacy_v1_unverified_restore', acknowledgedUnverifiedMetadata: true, sourceIdentity: record.sourceIdentity, exportedAt: record.exportedAt, recoveryOutput: output, ...target });
    await ensureLegacyAudit(options.db);
   } else if (record.kind === 'part') {
    integrity.add(record);
    await uploadPart(context, id, record.index, record);
   } else closing = record;
  }
  status = await finalizeImport(context, id, { contentHash: closing.contentHash, archiveHash: integrity.digest() });
  complete = true;
 } finally { if (id && !complete) await abortImport(context, id); }
 try {
  const receipt = await exportArchive(await createEaselExportService(options), output, transient);
  return { ...receipt, legacyRecovery: true, unverifiedMetadata: true, restoredContentHash: closing.contentHash, ...(status.bridged ? { bridged: status.bridged } : {}) };
 } catch { throw new PortabilityError('legacy_restored_export_failed', 500); }
}
