import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { createPortability, readArchive } from '@runeditrun/rer/modules/portability';
import { exportArchive, importArchive, fileRecords } from '@runeditrun/rer/modules/portability/files';
import { harness } from './harness.mjs';
import { exportFixture } from './export-fixture.mjs';
import { erasureMatchers } from '../src/easel/erasure-map.mjs';
import { easelPolicy } from '../scripts/installer/easel-policy.mjs';
import { createEaselExportService } from '../scripts/installer/erasure-export.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const snapshotRows = async db => (await db.prepare('SELECT id,sha256,body FROM e_snapshots ORDER BY id').all()).results;
const receipt = { receiptId: 'erasure-portability-fixture', pseudonym: 'Erased person 7c31', matchers: erasureMatchers(['Morgan Private', 'Fran Finance', 'owner@example.test']), at: '2026-10-20T10:00:00.000Z', erasedIdHash: digest('fixture-person-id') };

// The native command's authority and deactivation rules have their own HTTP
// acceptance flow. Here its durable, plaintext-free map is a portability fixture.
async function installMap(db) {
 await db.prepare("INSERT INTO e_records(kind,id,revision,value) VALUES('erasure',?,'1',?)").bind(receipt.receiptId, JSON.stringify(receipt)).run();
}
async function original(db, name, bytes, chunked = false) {
 const job = await db.prepare('SELECT id FROM ik_jobs LIMIT 1').first();
 await db.prepare("INSERT INTO ik_originals(job_id,kind,original_key,name,sha256,size,bytes) VALUES(?,'file',?,?,?,?,?)").bind(job.id, name, name, digest(bytes), bytes.length, chunked ? null : [...bytes]).run();
 if (chunked) {
  const middle = bytes.indexOf(Buffer.from('Morgan')) + 3;
  for (const [ordinal, chunk] of [bytes.subarray(0, middle), bytes.subarray(middle)].entries()) await db.prepare("INSERT INTO ik_d1_original_chunks(job_id,kind,original_key,ordinal,bytes) VALUES(?,'file',?,?,?)").bind(job.id, name, ordinal, [...chunk]).run();
 }
}

test('ERASE-001 portable archives transform every retained identity and restore verified snapshot references without changing source bytes', async t => {
 const source = await harness(); t.after(() => source.close());
 const destination = await harness(); t.after(() => destination.close());
 const directory = await mkdtemp(join(tmpdir(), 'easel-erasure-portable-')); t.after(() => rm(directory, { recursive: true, force: true }));
 await exportFixture(source);
 const originals = Buffer.from('holder,email\nMorgan Private,owner@example.test\n');
 await original(source.db, 'Morgan Private.csv', originals, true);
 const zip = new JSZip(); zip.file('Morgan Private.xml', '<holder>Morgan Private</holder>');
 zip.file('image.bin', Buffer.from([0, 255, 18, 172]));
 await original(source.db, 'people.xlsx', await zip.generateAsync({ type: 'nodebuffer' }));
 const snapshots = await snapshotRows(source.db);
 const allOriginals = (await source.db.prepare('SELECT * FROM ik_originals ORDER BY original_key').all()).results;
 await installMap(source.db);
 const path = join(directory, 'erased.rer');
 await exportArchive(await createEaselExportService({ db: source.db }), path, []);
 const records = []; for await (const record of fileRecords(path)) records.push(record);
 const archivedRows = records.filter(r => r.kind === 'part').flatMap(r => r.items).filter(i => i.kind === 'row');
 const serialized = await readFile(path, 'utf8');
 assert.doesNotMatch(serialized, /Morgan Private|Fran Finance|owner@example\.test/i);
 const manifest = records[0], transform = manifest.transforms.find(v => v.receiptIds.includes(receipt.receiptId));
 assert.ok(transform.snapshots.length >= 3);
 assert.ok(archivedRows.some(r => r.table === 'e_records' && r.row.kind === 'erasure' && r.row.id === receipt.receiptId));
 const exportedSnapshots = archivedRows.filter(r => r.table === 'e_snapshots').map(r => r.row);
 for (const sn of exportedSnapshots) {
  assert.equal(digest(sn.body), sn.sha256);
  assert.ok(sn.body.includes(receipt.pseudonym));
 }
 const approval = exportedSnapshots.find(sn => sn.kind === 'approval');
 const pack = exportedSnapshots.find(sn => sn.kind === 'pack');
 assert.equal(JSON.parse(pack.body).budget.sha256, approval.sha256);
 const csvChunks = archivedRows.filter(r => r.table === 'ik_d1_original_chunks' && r.row.original_key.endsWith('.csv') && r.row.original_key.includes('Erased person')).sort((a, b) => a.row.ordinal - b.row.ordinal);
 const csv = Buffer.concat(csvChunks.map(r => Buffer.from(r.row.bytes.blob, 'base64')));
 assert.equal(csv.toString(), 'holder,email\nErased person 7c31,Erased person 7c31\n');
 const csvRow = archivedRows.find(r => r.table === 'ik_originals' && r.row.name === 'Erased person 7c31.csv').row;
 assert.equal(csvRow.sha256, digest(csv)); assert.equal(csvRow.size, csv.length);
 const xlsx = archivedRows.find(r => r.table === 'ik_originals' && r.row.name === 'people.xlsx').row;
 const unpacked = await JSZip.loadAsync(Buffer.from(xlsx.bytes.blob, 'base64'), { checkCRC32: true });
 assert.equal(await unpacked.file('Erased person 7c31.xml').async('string'), '<holder>Erased person 7c31</holder>');
 assert.deepEqual(await unpacked.file('image.bin').async('nodebuffer'), Buffer.from([0, 255, 18, 172]));
 assert.deepEqual(await snapshotRows(source.db), snapshots);
 assert.deepEqual((await source.db.prepare('SELECT * FROM ik_originals ORDER BY original_key').all()).results, allOriginals);
 await importArchive(await createPortability({ db: destination.db, policy: easelPolicy }), path, []);
 assert.deepEqual(await snapshotRows(destination.db), exportedSnapshots.map(({ id, sha256, body }) => ({ id, sha256, body })).sort((a, b) => a.id.localeCompare(b.id)));
 // The added transform metadata is included in Base's archive binding.
 const altered = structuredClone(records); altered[0].transforms[0].receiptIds.push('unrecorded-receipt');
 const damaged = altered.map(JSON.stringify).join('\n') + '\n';
 await assert.rejects(async () => { for await (const record of readArchive(new Response(damaged).body)) {} }, error => error.code === 'archive_checksum');
 // Re-exporting the restored archive is stable and never applies erasure twice.
 const again = join(directory, 'again.rer');
 await exportArchive(await createEaselExportService({ db: destination.db }), again, []);
 const repeated = []; for await (const record of fileRecords(again)) repeated.push(record);
 assert.equal(repeated.at(-1).contentHash, records.at(-1).contentHash);
});

test('ERASE-001 export refuses an opaque original containing erased identity bytes before publishing a backup', async t => {
 const h = await harness(); t.after(() => h.close());
 await exportFixture(h); await installMap(h.db);
 await original(h.db, 'unsafe.bin', Buffer.concat([Buffer.from([0, 255]), Buffer.from('Morgan Private'), Buffer.from([0])]));
 await assert.rejects(createEaselExportService({ db: h.db }), error => error.code === 'easel_erasure_binary_original');
});
