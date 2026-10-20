import { createHash } from 'node:crypto';
import { inflateRawSync, deflateRawSync, brotliDecompressSync } from 'node:zlib';
import { canonicalJson, PortabilityError } from '@runeditrun/rer/modules/portability';
import { transformErased } from '../../src/easel/erasure-map.mjs';
import { dictionaryDecode } from '../../src/modules/import-kit/src/d1/plan-dictionary.ts';
import { planFingerprint } from '../../src/modules/import-kit/src/plan/index.ts';

const digest = value => createHash('sha256').update(value).digest('hex');
/** Encoded originals and compressed import journals are data too. Decode them
 * before matching identities; never scan only their base64 transport spelling. */
export function archiveValueTransformer(maps, originals) {
 const digests = originals.digests;
 const strings = new Map();
 const identity = text => {
  if (!strings.has(text)) strings.set(text, transformErased(text, maps));
  return strings.get(text);
 };
 const visit = item => {
  if (typeof item === 'string') {
   if (originals.base64.has(item)) return originals.base64.get(item);
   if (digests.has(item)) return digests.get(item);
   let parsed;
   try { parsed = JSON.parse(item); } catch { return identity(item); }
   if (parsed !== null && typeof parsed === 'object') {
    const changed = visit(parsed);
    return canonicalJson(parsed) === canonicalJson(changed) ? item : JSON.stringify(changed);
   }
   return identity(item);
  }
  if (Array.isArray(item)) return item.map(visit);
  if (!item || typeof item !== 'object') return item;
  if ([2, 3].includes(item.d1Plan) && typeof item.data === 'string') {
   const source = (item.compression === 'brotli' ? brotliDecompressSync : inflateRawSync)(Buffer.from(item.data, 'base64'));
   if (source.length !== item.size || digest(source) !== item.sha256) throw new PortabilityError('easel_journal_digest', 409);
   const packed = JSON.parse(source.toString('utf8'));
   const decoded = item.d1Plan === 3 ? dictionaryDecode(packed) : packed;
   const changed = visit(decoded);
   if (canonicalJson(changed) === canonicalJson(decoded)) return item;
   // Easel has no custom plan codec: refusing an unknown transformed codec
   // preserves its checks rather than inventing expanded-size metadata.
   if (item.d1Plan === 3) throw new PortabilityError('easel_erasure_plan_codec', 409);
   const body = Buffer.from(canonicalJson(changed));
   const sha256 = digest(body); digests.set(item.sha256, sha256);
   return { ...item, size: body.length, sha256, data: deflateRawSync(body).toString('base64') };
  }
  const result = Object.fromEntries(Object.entries(item).map(([key, value]) => [identity(key), visit(value)]));
  if (typeof item.base64 === 'string' && originals.base64.has(item.base64)) {
   const bytes = Buffer.from(result.base64, 'base64');
   if ('size' in result) result.size = bytes.length;
   if ('sha256' in result) result.sha256 = digest(bytes);
  }
  if (Array.isArray(result.entries) && result.source && typeof result.fingerprint === 'string' && typeof result.mappingVersion === 'string') {
   const fingerprint = planFingerprint(result);
   digests.set(item.fingerprint, fingerprint);
   result.fingerprint = fingerprint;
  }
  return result;
 };
 return { transform: visit, digests };
}
