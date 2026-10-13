import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseJsonc } from '@runeditrun/rer/jsonc';
import { migrationReplay } from '@runeditrun/rer/modules/portability/migration-history';
import { easelPolicy } from './easel-policy.mjs';

/** Import the product validator as executable code. Base's replay verifies an
 * older archive precedes only supported additive migrations before publishing. */
export async function openRestore(root) {
 const config = parseJsonc(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
 const database = config.d1_databases.find(entry => entry.binding === 'DB');
 const directory = join(root, database.migrations_dir ?? 'migrations');
 const { getPlatformProxy, unstable_splitSqlQuery } = createRequire(join(root, 'package.json'))('wrangler');
 const proxy = await getPlatformProxy({ configPath: join(root, 'wrangler.jsonc'), persist: { path: join(root, '.wrangler/state/v3') }, remoteBindings: false });
 const db = proxy.env.DB;
 const migrations = async () => {
  const names = (await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(row => row.name);
  const plan = await Promise.all(names.map(async name => ({ name, statements: unstable_splitSqlQuery(await readFile(join(directory, name), 'utf8')) })));
  return migrationReplay(plan, easelPolicy);
 };
 return { options: { db, buckets: {}, policy: easelPolicy, migrations }, close: () => proxy.dispose() };
}
