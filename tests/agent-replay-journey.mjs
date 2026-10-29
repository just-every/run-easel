import assert from 'node:assert/strict'

// Native submission consumes the draft precondition. Its retained receipt must
// still pass current authority, policy and idempotency admission on retry.
export async function afterStep({ step, args, result, tool, request, origin }) {
 if (step.tool !== 'easel.proposals.submit') return
 const read = async () => {
  const response = await request(new URL(`/api/easel/scenario/${result.id}`, origin).href)
  assert.equal(response.status, 200)
  return response.json()
 }
 const before = await read()
 const repeated = await tool(step.tool, args)
 assert.ok(!repeated.result?.isError)
 assert.deepEqual(repeated.result?.structuredContent, result)
 assert.deepEqual(await read(), before)
 const conflict = await tool(step.tool, { ...args, summary: 'A changed submission must not reuse this key' })
 assert.equal(conflict.result?._meta?.['com.runeditrun/error']?.code, 'idempotency_conflict')
 assert.deepEqual(await read(), before)
}

export default async function ({ tool }) {
 const visible = await tool('easel.scenarios.list', {})
 assert.ok(Array.isArray(visible.result?.structuredContent?.scenarios))
}
