import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseJsonc } from '@runeditrun/rer/jsonc';
import { migrationReplay } from '@runeditrun/rer/modules/portability/migration-history';
import { PortabilityError } from '@runeditrun/rer/modules/portability';
import { easelPolicy } from './easel-policy.mjs';

/** Import the product validator as executable code. Base's replay verifies an
 * older archive precedes only supported additive migrations before publishing. */
export async function openRestore(root, hostedDb) {
 const config = parseJsonc(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
 const database = config.d1_databases.find(entry => entry.binding === 'DB');
 const directory = join(root, database.migrations_dir ?? 'migrations');
 const { getPlatformProxy, unstable_splitSqlQuery } = createRequire(join(root, 'package.json'))('wrangler');
 const proxy = hostedDb ? undefined : await getPlatformProxy({ configPath: join(root, 'wrangler.jsonc'), persist: { path: join(root, '.wrangler/state/v3') }, remoteBindings: false });
 const db = hostedDb ?? proxy.env.DB;
 const migrations = async () => {
  if (hostedDb) {
   const rows = (await db.prepare('SELECT name,sha256,state FROM d1_migrations ORDER BY id').all()).results;
   const files = (await readdir(directory)).filter(name => /^\d+_[a-zA-Z0-9_-]+\.sql$/.test(name));
   if (rows.length !== files.length || new Set(rows.map(row => row.name)).size !== rows.length || rows.some(row => row.state !== 'applied' || !files.includes(row.name))) throw new PortabilityError('schema_mismatch:migration_history', 409);
   const plan = await Promise.all(rows.map(async row => {
    const sql = await readFile(join(directory, row.name), 'utf8');
    const sha256 = createHash('sha256').update(sql).digest('hex');
    if (sha256 !== row.sha256) throw new PortabilityError('schema_mismatch:migration_history', 409);
    return { name: row.name, sha256, statements: unstable_splitSqlQuery(sql) };
   }));
   return migrationReplay(plan, easelPolicy);
  }
  const names = (await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(row => row.name);
  const plan = await Promise.all(names.map(async name => ({ name, statements: unstable_splitSqlQuery(await readFile(join(directory, name), 'utf8')) })));
  return migrationReplay(plan, easelPolicy);
 };
 // Hosted operations never apply migrations. Require the deployed history to
 // match these local migration bytes before the portability service can write.
 if (hostedDb) await migrations();
 return { options: { db, buckets: {}, policy: easelPolicy, migrations }, close: () => proxy?.dispose() };
}
