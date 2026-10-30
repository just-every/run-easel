import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseContract } from '../src/base/seed-contract.mjs'

test('The documented regeneration command restores acceptance rows for every contract clause', async t => {
 const directory = await mkdtemp(join(tmpdir(), 'easel-contract-docs-'))
 t.after(() => rm(directory, { recursive: true, force: true }))
 const root = new URL('../', import.meta.url)
 for (const path of ['scripts', 'src/base', 'docs']) await mkdir(join(directory, path), { recursive: true })
 for (const path of ['CONTRACT.md', 'ACCEPTANCE.md', 'scripts/contract-docs.mjs', 'src/base/seed-contract.mjs']) await cp(new URL(path, root), join(directory, path))
 const contract = parseContract(await readFile(join(directory, 'CONTRACT.md'), 'utf8'))
 const acceptancePath = join(directory, 'ACCEPTANCE.md')
 const acceptance = await readFile(acceptancePath, 'utf8')
 await writeFile(acceptancePath, acceptance.split('\n').filter(line => !line.startsWith(`| \`${contract.clauses.at(-1).id}\` — `)).join('\n'))
 const run = mode => spawnSync(process.execPath, ['scripts/contract-docs.mjs', mode], { cwd: directory, encoding: 'utf8' })
 const write = run('write')
 assert.equal(write.status, 0, write.stdout + write.stderr)
 const generated = (await readFile(acceptancePath, 'utf8')).split('\n')
 for (const clause of contract.clauses) assert.ok(generated.some(line => line.startsWith(`| \`${clause.id}\` — `)), `${clause.id} has an acceptance row`)
 const check = run('check')
 assert.equal(check.status, 0, check.stdout + check.stderr)
})
