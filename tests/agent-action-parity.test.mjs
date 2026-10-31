import test from 'node:test'
import { harness } from './harness.mjs'
import { expenseParityJourney } from './agent-action-parity-flow.mjs'

test('Native expense actions and MCP tools preserve records, exact cents, Activity types and frozen captures under both policies', { timeout: 120000 }, async t => {
 const h = await harness()
 t.after(() => h.close())
 await expenseParityJourney({ origin: h.origin, cookie: h.owner, proof: line => console.log(`PROBE ${line}`) })
})
