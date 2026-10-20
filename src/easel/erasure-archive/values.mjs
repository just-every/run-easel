import { createHash } from 'node:crypto';
import { inflateRawSync, deflateRawSync, brotliDecompressSync } from 'node:zlib';
import { canonicalJson, PortabilityError } from '@runeditrun/rer/modules/portability';
import { transformErased, transformPayrollIdentity } from '../erasure-map.mjs';
import { dictionaryDecode } from '../../modules/import-kit/src/d1/plan-dictionary.ts';
import { planFingerprint } from '../../modules/import-kit/src/plan/index.ts';

const digest = value => createHash('sha256').update(value).digest('hex');
/** Encoded originals and compressed import journals are data too. Decode them
 * before matching identities; never scan only their base64 transport spelling. */
export function archiveValueTransformer(maps, originals) {
 const digests = originals.digests;
 const strings = new Map(), derivedByJob = new Map();
 const derived = jobId => {
  if (!jobId) return digests;
  if (!derivedByJob.has(jobId)) derivedByJob.set(jobId,new Map());
  return derivedByJob.get(jobId);
 };
 const remember = (before,after,jobId) => {
  const oldBody=canonicalJson(before),newBody=canonicalJson(after);
  if(oldBody!==newBody) derived(jobId).set(digest(oldBody),digest(newBody));
  return after;
 };
 const identity = text => {
  if (!strings.has(text)) strings.set(text, transformErased(text, maps));
  return strings.get(text);
 };
 const visit = (item, jobId) => {
  if (item && typeof item === 'object' && !Array.isArray(item)) jobId = item.job_id ?? originals.jobForDestination?.get(item.destination ?? item.batch) ?? jobId;
  const local = originals.byJob?.get(jobId);
  const originalBase64 = local?.base64 ?? originals.base64;
  const originalDigests = local?.digests ?? originals.digests;
  if (typeof item === 'string') {
   if (originalBase64.has(item)) return originalBase64.get(item);
   if (derived(jobId).has(item)) return derived(jobId).get(item);
   if (originalDigests.has(item)) return originalDigests.get(item);
   if (digests.has(item)) return digests.get(item);
   let parsed;
   try { parsed = JSON.parse(item); } catch { return identity(item); }
   if (parsed !== null && typeof parsed === 'object') {
    const changed = visit(parsed, jobId);
    return canonicalJson(parsed) === canonicalJson(changed) ? item : JSON.stringify(changed);
   }
   return identity(item);
  }
  if (Array.isArray(item)) return remember(item,item.map(v=>visit(v,jobId)),jobId);
  if (!item || typeof item !== 'object') return item;
  if ([2, 3].includes(item.d1Plan) && typeof item.data === 'string') {
   const source = (item.compression === 'brotli' ? brotliDecompressSync : inflateRawSync)(Buffer.from(item.data, 'base64'));
   if (source.length !== item.size || digest(source) !== item.sha256) throw new PortabilityError('easel_journal_digest', 409);
   const packed = JSON.parse(source.toString('utf8'));
   const decoded = item.d1Plan === 3 ? dictionaryDecode(packed) : packed;
   const changed = visit(decoded, jobId);
   if (canonicalJson(changed) === canonicalJson(decoded)) return item;
   // Easel has no custom plan codec: refusing an unknown transformed codec
   // preserves its checks rather than inventing expanded-size metadata.
   if (item.d1Plan === 3) throw new PortabilityError('easel_erasure_plan_codec', 409);
   const body = Buffer.from(canonicalJson(changed));
   const sha256 = digest(body); digests.set(item.sha256, sha256);
   return { ...item, size: body.length, sha256, data: deflateRawSync(body).toString('base64') };
  }
  const result = Object.fromEntries(Object.entries(transformPayrollIdentity(item, maps)).map(([key, value]) => [identity(key), visit(value, jobId)]));
  if (typeof item.base64 === 'string' && originalBase64.has(item.base64)) {
   const bytes = Buffer.from(result.base64, 'base64');
   if ('size' in result) result.size = bytes.length;
   if ('sha256' in result) result.sha256 = digest(bytes);
  }
  if (typeof item.original?.base64 === 'string' && originalBase64.has(item.original.base64)) {
   const bytes = Buffer.from(result.original.base64,'base64');
   if ('size' in result) result.size = bytes.length;
   if ('sha256' in result) result.sha256 = digest(bytes);
  }
  if (Array.isArray(result.entries) && result.source && typeof result.fingerprint === 'string' && typeof result.mappingVersion === 'string') {
   const fingerprint = planFingerprint(result);
   digests.set(item.fingerprint, fingerprint);
   result.fingerprint = fingerprint;
  }
  return remember(item,result,jobId);
 };
 return { transform: visit, digests };
}
