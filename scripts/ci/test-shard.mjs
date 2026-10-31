import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Runs one part of `node --test --test-shard=I/N tests/*.test.mjs`, so a shard that holds several slow
// suites can run as parallel jobs: node scripts/ci/test-shard.mjs 3/4 2/3
// The shard keeps node's own selection (sorted paths, every Nth from the Ith), so the parts together run
// exactly its files. Files are dealt longest first to the part with the least time so far.

// Seconds per file in Verify run 41232158535 (main c9383559), for every suite that took 20 s or more.
// Other files took about 6 s each.
const seconds = {
 'tests/review-fixes.test.mjs': 320, 'tests/agent-capacity.test.mjs': 159, 'tests/netsuite.test.mjs': 150,
 'tests/payroll-erasure.test.mjs': 144, 'tests/approval-chains.test.mjs': 60, 'tests/intacct.test.mjs': 35,
 'tests/mapping-rules.test.mjs': 33, 'tests/fiscal-calendar.test.mjs': 33, 'tests/bi-feeds.test.mjs': 28,
 'tests/hris.test.mjs': 26, 'tests/spend.test.mjs': 22, 'tests/erasure-portability.test.mjs': 22,
};
const time = file => seconds[file] ?? 6;

const usage = 'Usage: node scripts/ci/test-shard.mjs SHARD/SHARDS PART/PARTS';
if (process.argv.length !== 4) throw Error(usage);
const [shard, part] = process.argv.slice(2).map(text => {
 const [index, total] = (/^(\d+)\/(\d+)$/.exec(text)?.slice(1) ?? []).map(Number);
 if (!(index >= 1 && index <= total)) throw Error(usage);
 return { index, total };
});

const files = readdirSync('tests').filter(name => name.endsWith('.test.mjs') && !name.startsWith('.'))
 .map(name => `tests/${name}`).sort().filter((_, index) => index % shard.total === shard.index - 1);
const load = Array(part.total).fill(0), parts = load.map(() => []);
for (const file of [...files].sort((a, b) => time(b) - time(a) || (a < b ? -1 : 1))) {
 const lightest = load.indexOf(Math.min(...load));
 load[lightest] += time(file);
 parts[lightest].push(file);
}
const selected = parts[part.index - 1].sort();
if (!selected.length) throw Error(`Part ${part.index}/${part.total} of shard ${shard.index}/${shard.total} has no test files`);
console.log(`# part ${part.index}/${part.total} of shard ${shard.index}/${shard.total}: ${selected.join(' ')}`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...selected], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
