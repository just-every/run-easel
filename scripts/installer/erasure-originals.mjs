import { createHash } from 'node:crypto';
import JSZip from 'jszip/dist/jszip.min.js';
import { PortabilityError } from '@runeditrun/rer/modules/portability';
import { transformErased } from '../../src/easel/erasure-map.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const bytesOf = value => Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
const key = row => JSON.stringify([row.job_id, row.kind, row.original_key]);
const encoded = bytes => ({ blob: Buffer.from(bytes).toString('base64') });
function textBytes(bytes, maps) {
 try {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\0')) return null;
  const changed = transformErased(text, maps);
  return changed === text ? bytes : Buffer.from(changed);
 } catch { return null; }
}
function ensureOpaqueSafe(bytes, maps) {
 // Preserve binary content unless an erased identity is recoverable from its
 // bytes. Re-encoding opaque bytes would corrupt the original, so refuse a
 // matching binary before the archive is published.
 const candidates = [bytes.toString('utf8'), bytes.toString('latin1'), bytes.toString('utf16le')];
 const swapped = Buffer.from(bytes);
 if (swapped.length % 2) swapped[swapped.length - 1] = 0;
 for (let i = 0; i + 1 < swapped.length; i += 2) [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
 candidates.push(swapped.toString('utf16le'));
 if (candidates.some(text => transformErased(text, maps) !== text)) throw new PortabilityError('easel_erasure_binary_original', 409);
 return bytes;
}
export function transformBlob(value, maps) {
 const bytes = Buffer.from(value.blob, 'base64');
 return encoded(textBytes(bytes, maps) ?? ensureOpaqueSafe(bytes, maps));
}
export async function transformOriginalBytes(input, maps) {
 const bytes = Buffer.from(input);
 if (!maps.length) return bytes;
 const text = textBytes(bytes, maps);
 if (text) return text;
 if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const output = new JSZip();
  let changed = false;
  for (const entry of Object.values(zip.files)) {
   const name = transformErased(entry.name, maps);
   if (name !== entry.name) changed = true;
   if (entry.dir) { output.folder(name); continue; }
   const source = await entry.async('nodebuffer');
   const transformed = textBytes(source, maps) ?? ensureOpaqueSafe(source, maps);
   if (!Buffer.from(transformed).equals(source)) changed = true;
   output.file(name, transformed, { date: entry.date, comment: entry.comment, unixPermissions: entry.unixPermissions, dosPermissions: entry.dosPermissions });
  }
  return changed ? output.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) : bytes;
 }
 return ensureOpaqueSafe(bytes, maps);
}

export async function prepareOriginals(db, maps) {
 const [originals, chunks] = await Promise.all(['ik_originals', 'ik_d1_original_chunks'].map(async table => (await db.prepare(`SELECT * FROM ${table}`).all()).results));
 const replacements = new Map(), digests = new Map(), base64 = new Map(), metadata = [];
 const groups = new Map();
 for (const row of chunks) {
  const id = key(row);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(row);
 }
 for (const row of originals) {
  const id = key(row), parts = (groups.get(id) ?? []).sort((a, b) => a.ordinal - b.ordinal);
  const textual = parts.length > 0 && parts.every(p => typeof p.bytes === 'string');
  const source = row.bytes !== null ? bytesOf(row.bytes) : parts.length ? textual ? Buffer.from(parts.map(p => p.bytes).join(''), 'base64') : Buffer.concat(parts.map(p => bytesOf(p.bytes))) : null;
  if (source === null) continue;
  if (source.length !== row.size || digest(source) !== row.sha256) throw new PortabilityError('easel_original_digest', 409);
  const exported = await transformOriginalBytes(source, maps), sha256 = digest(exported);
  if (sha256 === row.sha256) continue;
  digests.set(row.sha256, sha256);
  base64.set(source.toString('base64'), Buffer.from(exported).toString('base64'));
  metadata.push({ originalSha256: row.sha256, exportedSha256: sha256 });
  replacements.set(`ik_originals:${id}`, { ...row, sha256, size: exported.length, bytes: row.bytes === null ? null : encoded(exported) });
  // Keep the archive's row inventory and ordering, including empty tail chunks.
  let offset = 0;
  const payload = textual ? Buffer.from(exported).toString('base64') : exported;
  parts.forEach((part, index) => {
   const end = index === parts.length - 1 ? payload.length : Math.min(payload.length, offset + (textual ? part.bytes.length : bytesOf(part.bytes).length));
   replacements.set(`ik_d1_original_chunks:${id}:${part.ordinal}`, { ...part, bytes: textual ? payload.slice(offset, end) : encoded(payload.subarray(offset, end)) });
   offset = end;
  });
 }
 return {
  digests, base64, metadata,
  row: (table, row) => replacements.get(`${table}:${key(row)}${table === 'ik_d1_original_chunks' ? ':' + row.ordinal : ''}`),
 };
}
