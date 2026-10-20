import { createHash } from 'node:crypto';
import { canonicalJson, PortabilityError } from '@runeditrun/rer/modules/portability';
import { easelPolicy, validateEaselStaged } from './policy.mjs';
import { prepareOriginals, transformBlob } from './originals.mjs';
import { archiveValueTransformer } from './values.mjs';
import { payrollOriginalScopes } from '../payroll-erasure.mjs';
import { prepareJournals } from './journals.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const rows = async (db, table) => (await db.prepare(`SELECT * FROM "${table}"`).all()).results;

// JSON is stored inside TEXT columns throughout both product and import journals.
function replaceDigests(value, resolve) {
 if (typeof value === 'string') {
  if (/^[a-f0-9]{64}$/.test(value)) return resolve(value);
  let parsed;
  try { parsed = JSON.parse(value); } catch { return value; }
   if (parsed !== value) {
    const changed = replaceDigests(parsed, resolve);
    return canonicalJson(parsed) === canonicalJson(changed) ? value : JSON.stringify(changed);
   }
  return value;
 }
 if (Array.isArray(value)) return value.map(v => replaceDigests(v, resolve));
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceDigests(v, resolve)]));
 return value;
}

/** Base owns copies, row normalization, checksums and atomic file publication.
 * This factory supplies the installation's value-free erasure map to its policy. */
export async function prepareEaselExportTransform(options) {
 const { db } = options;
 const receipts = (await db.prepare("SELECT value FROM e_records WHERE kind='erasure' ORDER BY id").all()).results.map(r => JSON.parse(r.value));
 const maps = payrollOriginalScopes(receipts, (await rows(db, 'e_records')).map(r=>({...r,value:JSON.parse(r.value)})), await rows(db, 'ik_jobs'));
 const snapshots = await rows(db, 'e_snapshots');
 // A transform must never turn an already damaged source into a valid archive.
 await validateEaselStaged({ read: table => rows(db, table) });
 const originalTransforms = maps.length ? await prepareOriginals(db, maps) : { row: () => undefined, digests: new Map(), base64: new Map(), metadata: [] };
 const transformer = archiveValueTransformer(maps, originalTransforms);
 const journals = maps.length ? await prepareJournals(db, transformer) : { row: () => undefined };
 const known = new Map(snapshots.map(sn => [sn.sha256, sn]));
 const transformed = new Map(originalTransforms.digests), visiting = new Set(), bodies = new Map();
 const resolve = hash => {
  if (transformed.has(hash)) return transformed.get(hash);
  const sn = known.get(hash);
  if (!sn) return hash;
  if (visiting.has(hash)) throw new PortabilityError('easel_snapshot_digest_cycle', 409);
  visiting.add(hash);
  const body = replaceDigests(transformer.transform(sn.body), resolve);
  bodies.set(sn.id, body);
  transformed.set(hash, digest(body));
  visiting.delete(hash);
  return transformed.get(hash);
 };
 for (const sn of snapshots) resolve(sn.sha256);
 const policy = { ...easelPolicy, exportRow(table, row) {
  if (!maps.length) return row;
  const original = originalTransforms.row(table, row) ?? journals.row(table, row);
  const changed = transformer.transform(original ?? row, table === 'ik_jobs' ? row.id : row.job_id);
  for (const [key, value] of Object.entries(changed)) if (!['ik_originals', 'ik_d1_original_chunks'].includes(table) && value && typeof value === 'object' && typeof value.blob === 'string') changed[key] = transformBlob(value, maps);
  const result = replaceDigests(changed, hash => transformed.get(hash) ?? hash);
  if (table === 'e_snapshots' && bodies.has(row.id)) {
   result.body = bodies.get(row.id);
   result.sha256 = digest(result.body);
  }
  return result;
 } };
 const metadata = maps.length ? {
  name: 'easel-erasure-v1', receiptIds: maps.map(m => m.receiptId),
  snapshots: snapshots.filter(sn => transformed.get(sn.sha256) !== sn.sha256).map(sn => ({ id: sn.id, originalSha256: sn.sha256, exportedSha256: transformed.get(sn.sha256) })),
  originals: originalTransforms.metadata,
 } : undefined;
 return { policy, metadata };
}

