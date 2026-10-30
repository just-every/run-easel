// Keep the automation developer journey in Verify's existing domain-flow glob.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const directory = fileURLToPath(new URL('../integrations/zapier/', import.meta.url))
test('API-002 automation app validates and performs authenticated polling, proposal and comment flows', { timeout: 300000 }, () => {
 for (const [command, args] of [
  ['npm', ['ci', '--no-audit', '--no-fund']],
  ['./node_modules/.bin/zapier-platform', ['validate', '--without-style']],
  ['./node_modules/.bin/zapier-platform', ['test', '--skip-validate']],
 ]) {
  const result = spawnSync(command, args, { cwd: directory, encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024 })
  assert.ifError(result.error)
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
 }
})
