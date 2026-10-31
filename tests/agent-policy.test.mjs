import test from 'node:test'
import { harness } from './harness.mjs'
import { policyFixture, policyLifecycle } from './agent-policy-flow.mjs'

test('Signed planning policy propagates to decisions and audit; real expiry fences effects and private replays', { timeout: 120000 }, async t => {
 const fixture = await policyFixture(harness)
 t.after(() => fixture.close())
 await policyLifecycle(fixture)
})
