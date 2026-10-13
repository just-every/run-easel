import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { harness } from './harness.mjs'

test('current finance can undo another operator workbook while other roles cannot and edits survive', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Workbook undo', currency: 'AUD', fiscalYearStart: 7, planStart: '2026-07' })
 const departments = {}
 for (const name of ['Sales', 'Engineering', 'Operations', 'Marketing']) departments[name] = (await h.command('department', { name })).id
 for (const name of ['Subscription revenue', 'Hosting', 'Software', 'Rent', 'Advertising', 'Travel']) await h.command('line', { name, type: name === 'Subscription revenue' ? 'revenue' : 'operating-expense' })
 const finance = await h.person('finance@example.test', 'finance')
 const contributor = await h.person('sales@example.test', 'contributor', [departments.Sales])
 const viewer = await h.person('board@example.test', 'viewer')
 assert.equal((await h.get('/api/easel/state', finance)).me.role, 'finance')
 const body = { filename: 'fy27-budget.xlsx', base64: (await readFile('fixtures/fy27-budget.xlsx')).toString('base64') }
 const records = async () => (await h.db.batch(['e_records', 'ik_jobs', 'e_activity'].map(table => h.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`)))).map(r => r.results)
 for (const preserveEdit of [false, true]) {
  const preview = await h.kit('workbook', 'preview', body)
  const done = await h.kit('workbook', 'commit', { ...body, fingerprint: preview.fingerprint })
  const imported = await h.get(`/api/easel/scenario/${done.import.scenario}`)
  assert.equal(imported.inputs.schedule.length, preview.rows.length)
  const job = await h.db.prepare('SELECT principal_id FROM ik_jobs WHERE id=?').bind(done.job.id).first()
  const owner = await h.db.prepare('SELECT id FROM oa_operators WHERE email=?').bind('owner@example.test').first()
  assert.equal(job.principal_id, owner.id)
  const before = await records()
  for (const cookie of [contributor, viewer]) for (const op of ['status', 'resume', 'undo']) {
   await h.kit('workbook', op, { id: done.import.id }, cookie, 403)
   assert.deepEqual(await records(), before)
  }
  let edited
  if (preserveEdit) {
   const row = imported.inputs.schedule[0]
   edited = await h.command('schedule', { ...row, values: { ...Object.fromEntries(Object.entries(row.values).map(([m, v]) => [m, (v / 100).toFixed(2)])), '2026-07': '123.45' } })
  }
  const response = await h.send('/api/easel/import/workbook/undo', { id: done.import.id }, finance)
  const current = (await h.get('/api/easel/state')).workbooks.find(x => x.id === done.import.id)
  const remaining = (await h.db.prepare("SELECT COUNT(*) AS n FROM e_records WHERE destination=? AND kind='schedule'").bind(done.import.destination).first()).n
  t.diagnostic(`finance workbook undo: HTTP ${response.status}; import ${current.status}; remaining schedules ${remaining}`)
  assert.equal(response.status, 200, JSON.stringify(response.value))
  const undone = response.value
  assert.equal(undone.import.status, 'undone')
  assert.equal(undone.job.state, 'undone')
  assert.equal(undone.import.createdBy, 'owner@example.test')
  assert.equal(undone.import.undoneBy, 'finance@example.test')
  assert.deepEqual(await h.db.prepare('SELECT principal_id FROM ik_jobs WHERE id=?').bind(done.job.id).first(), job)
  assert.equal((await h.kit('workbook', 'status', { id: done.import.id }, finance)).job.state, 'undone')
  if (preserveEdit) {
   const after = await h.get(`/api/easel/scenario/${done.import.scenario}`)
   assert.deepEqual(after.inputs.schedule, [edited])
  } else {
   assert.deepEqual((await h.get(`/api/easel/scenario/${done.import.scenario}`)).inputs.schedule, [])
  }
 }
})
