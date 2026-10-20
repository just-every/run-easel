import { createHash } from 'node:crypto';
import { canonicalJson, PortabilityError } from '@runeditrun/rer/modules/portability';
import { redactDisposition } from '../../modules/import-kit/src/d1/erasure-disposition.ts';
import { entryLocator } from '../../modules/import-kit/src/d1/entry-locator.ts';
const digest = value => createHash('sha256').update(value).digest('hex');
const layouts = {
 ik_d1_plan_chunks: ['job_id'], ik_d1_creation_plans: ['job_id'],
 ik_d1_staging_chunks: ['stage_id', 'page_ordinal'], ik_d1_staging_headers: ['stage_id'],
 ik_d1_native_staging_values: ['stage_id', 'value_ordinal'],
};
const key = (table, row) => JSON.stringify([table, ...layouts[table].map(column => row[column]), row.ordinal]);

/** Rejoin journal pages before matching: both an identity and an encoded
 * original can straddle any SQL row boundary. Keep Base's archive inventory. */
export async function prepareJournals(db, transformer) {
 const replacements = new Map(), jobs = new Map();
 const reads = await Promise.all(Object.entries(layouts).map(async ([table, columns]) => ({ table, columns, rows: (await db.prepare(`SELECT * FROM ${table}`).all()).results })));
 const sourceJobs = (await db.prepare('SELECT * FROM ik_jobs').all()).results;
 for (const job of sourceJobs) jobs.set(job.id, { ...job, plan_json: transformer.transform(job.plan_json,job.id) });
 for (const { table, columns, rows } of reads) {
  const groups = new Map();
  for (const row of rows) {
   const group = JSON.stringify(columns.map(column => row[column]));
   if (!groups.has(group)) groups.set(group, []);
   groups.get(group).push(row);
  }
  for (const parts of groups.values()) {
   parts.sort((a, b) => a.ordinal - b.ordinal);
   const source = parts.map(row => row.body).join('');
   let parsed;
   try { parsed = JSON.parse(source); } catch {}
   const body = parsed === undefined ? transformer.transform(source,parts[0].job_id) : canonicalJson(transformer.transform(parsed,parts[0].job_id));
   if (body === source) continue;
   transformer.digests.set(digest(source), digest(body));
   let offset = 0;
   const exported = parts.map((row, index) => {
    let end = index === parts.length - 1 ? body.length : Math.min(body.length, offset + row.body.length);
    if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1])) end--;
    const chunk = body.slice(offset, end); offset = end;
    transformer.digests.set(digest(row.body), digest(chunk));
    const result = { ...row, body: chunk };
    if ('body_hash' in row) result.body_hash = digest(chunk);
    if ('body_size' in row) result.body_size = Buffer.byteLength(chunk);
    replacements.set(key(table, row), result);
    return result;
   });
   if (table === 'ik_d1_plan_chunks') {
    const job = sourceJobs.find(job => job.id === parts[0].job_id);
    const envelope = job && JSON.parse(job.plan_json);
    if (envelope?.d1Plan === 1) {
     if (envelope.sha256 !== digest(source) || envelope.size !== Buffer.byteLength(source) || envelope.chunks !== parts.length) throw new PortabilityError('easel_journal_digest', 409);
     const value = { ...envelope, sha256: digest(body), size: Buffer.byteLength(body) };
     if (envelope.entries) value.entries = entryLocator(JSON.parse(body), exported);
     jobs.set(job.id, { ...job, plan_json: canonicalJson(value) });
    }
   }
  }
 }
 // A reversal disposition remains true after privacy redaction. Base's
 // evidence-redacted form keeps the reason/decision and removes stale private
 // equality evidence; bind the whole ordered report again for verified restore.
 const reports = (await db.prepare('SELECT * FROM ik_d1_reversal_reports ORDER BY job_id,position').all()).results;
 const exportedReports = new Map();
 for(const row of reports) {
  const original=JSON.parse(row.record_json), transformed=transformer.transform(original,row.job_id);
  const record_json=canonicalJson(original)===canonicalJson(transformed) ? row.record_json : canonicalJson(redactDisposition(transformed));
  exportedReports.set(`${row.job_id}:${row.effect_id}`,{...row,record_json});
 }
 for(const [id,job] of jobs) {
  const ordered=reports.filter(r=>r.job_id===id).map(r=>exportedReports.get(`${r.job_id}:${r.effect_id}`));
  if(ordered.length) jobs.set(id,{...job,reversal_hash:digest(canonicalJson(ordered.map(r=>({job_id:r.job_id,effect_id:r.effect_id,position:r.position,record_json:r.record_json}))))});
 }
 return { row: (table, row) => table === 'ik_jobs' ? jobs.get(row.id) : table === 'ik_d1_reversal_reports' ? exportedReports.get(`${row.job_id}:${row.effect_id}`) : layouts[table] ? replacements.get(key(table, row)) : undefined };
}
