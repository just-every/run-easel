import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { harness } from './harness.mjs'
import { evaluate, readWorkbook } from './spreadsheet-proof.mjs'
import { providerFakes } from './provider-fakes.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const csv = (month, rows) => ({ filename: `gl-${month}.csv`, csv: `Date,Account,Department,Amount\n${rows.map(([date, account, amount]) => `${date},${account},Sales,${amount}`).join('\n')}\n`, columns: { date: 'Date', account: 'Account', department: 'Department', amount: 'Amount' }, dateFormat: 'YYYY-MM-DD', amountMode: 'debit-positive' })
const pdfText = bytes => Buffer.from(bytes).toString('latin1')

test('REPORT-003 a quarter board pack refreshes after a late adjustment keeping commentary, publishes immutably as PDF, PowerPoint and Excel and saves one PDF digest to Drive, SharePoint and Chest', async t => {
 const remote = providerFakes(), h = await harness({ outbound: remote.outbound }); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const revenue = await h.command('line', { name: 'Subscription revenue', type: 'revenue' })
 const software = await h.command('line', { name: 'Software', type: 'operating-expense' })
 const payroll = await h.command('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 for (const [account, target] of [['400', revenue.id], ['461', software.id], ['477', payroll.id]]) await h.command('account-map', { account, target })
 await h.command('department-map', { source: 'Sales', department: sales.id })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('revenue', { scenario: budget.id, name: 'Subscriptions', kind: 'volume', line: revenue.id, department: sales.id, start: '2026-01', startVolume: '10', rate: '1000', growthPercent: '0' })
 await h.command('expense', { scenario: budget.id, name: 'Tools', kind: 'recurring', line: software.id, department: sales.id, start: '2026-01', amount: '1000' })
 await h.command('position', { scenario: budget.id, title: 'Private principal engineer', holder: 'Private Person', department: sales.id, line: payroll.id, start: '2026-01', annualSalary: '120000', onCostPercent: '0' })
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const month = async (m, software_, day = '28') => { const body = csv(m, [[`${m}-${day}`, '400', '-10000.00'], [`${m}-${day}`, '461', software_], [`${m}-${day}`, '477', '10000.00']]), p = await h.kit('actuals', 'preview', body); await h.kit('actuals', 'commit', { ...body, fingerprint: p.fingerprint }); await h.command('close-month', { scenario: forecast.id, month: m }) }
 await month('2026-01', '1000.00'); await month('2026-02', '1800.00'); await month('2026-03', '1000.00')
 await h.command('close-month', { scenario: forecast.id, month: '2026-04' }, h.owner, 409)

 // Commentary written and confirmed by people before the pack exists.
 await h.command('explanation', { month: '2026-02', line: software.id, department: sales.id, text: 'Annual licences were paid in February.' })
 await h.command('explanation-confirm', { month: '2026-02', line: software.id, department: sales.id })
 const planner = await h.person('sales@example.test', 'contributor', [sales.id]), board = await h.person('board@example.test', 'viewer')
 await h.command('pack-create', { period: 'quarter', month: '2026-02', template: 'default' }, planner, 403)

 // Templates choose sections; the quarter must be closed and whole.
 const template = await h.command('pack-template-save', { name: 'Board summary', sections: ['statements', 'kpis', 'charts', 'commentary', 'decisions'] })
 await h.command('pack-template-save', { name: 'Empty', sections: [] }, h.owner, 400)
 await h.command('pack-create', { period: 'quarter', month: '2026-05' }, h.owner, 409)
 const pack = await h.command('pack-create', { period: 'quarter', month: '2026-02', template: template.id })
 assert.equal(pack.period, 'quarter'); assert.deepEqual(pack.months, ['2026-01', '2026-02', '2026-03']); assert.equal(pack.month, '2026-03')
 await h.command('pack-create', { period: 'quarter', month: '2026-03', template: template.id }, h.owner, 409)
 await h.command('pack-decision', { pack: pack.id, text: 'Move annual licence renewals to quarterly billing', owner: 'Finance lead', due: '2026-06-30' })

 // A late adjustment lands in a closed month after the pack was generated.
 const late = csv('2026-03', [['2026-03-30', '461', '500.00']]), lp = await h.kit('actuals', 'preview', late); await h.kit('actuals', 'commit', { ...late, fingerprint: lp.fingerprint })
 const preview = await h.get(`/api/easel/pack/${pack.id}/preview`)
 assert.equal(preview.stale, true)
 const marchSoftware = preview.body.variances.find(v => v.line === 'Software')
 assert.equal(marchSoftware.actual, 430000, 'quarter actual includes the late adjustment')
 assert.match(marchSoftware.explanation.text, /Feb 2026: Annual licences were paid in February/)
 await h.command('pack-publish', { pack: pack.id, fingerprint: pack.generated.fingerprint }, h.owner, 409)
 const refreshed = await h.command('pack-refresh', { pack: pack.id })
 assert.equal(refreshed.changed, true); assert.equal(refreshed.commentaryKept, 1)
 const after = await h.get(`/api/easel/pack/${pack.id}/preview`)
 assert.equal(after.stale, false)
 assert.equal((await h.get('/api/easel/state')).packs.find(p => p.id === pack.id).refreshes.length, 1)
 assert.match(after.body.variances.find(v => v.line === 'Software').explanation.text, /Annual licences were paid in February/, 'refresh keeps what people wrote')
 assert.deepEqual(['lines', 'kpis', 'charts', 'variances'].map(k => k in after.body), [true, true, true, true]); assert.ok(!after.body.sources, 'the template has no appendix')
 await h.command('pack-refresh', { pack: pack.id }, planner, 403)

 const published = await h.command('pack-publish', { pack: pack.id, fingerprint: after.fingerprint })
 const sn = await h.get(`/api/easel/snapshot/${published.snapshot}`, board)
 assert.equal(sn.body.period, 'quarter'); assert.deepEqual(sn.body.sections, ['statements', 'kpis', 'charts', 'commentary', 'decisions'])
 assert.equal(sn.body.kpis.find(k => k.key === 'revenue').actual, 3000000)
 await h.command('pack-refresh', { pack: pack.id }, h.owner, 409)

 // Every format renders from the snapshot and carries the same figures.
 const download = async (format, cookie = h.owner) => { const r = await h.mf.dispatchFetch(h.origin + `/api/easel/pack/${pack.id}/document.${format}`, { headers: { cookie } }); assert.equal(r.status, 200, format); return new Uint8Array(await r.arrayBuffer()) }
 const pdf = await download('pdf'), pptx = await download('pptx'), xlsx = await download('xlsx'), htmlText = Buffer.from(await download('html')).toString()
 assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-'); assert.equal(sha(await download('pdf', board)), sha(pdf), 'a PDF is deterministic for every reader')
 assert.match(pdfText(pdf), /Annual licences were paid in February/); assert.match(pdfText(pdf), /Move annual licence renewals/)
 const zip = await JSZip.loadAsync(pptx), slides = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
 assert.ok(slides.length >= 5, 'title, key figures, statements, charts and commentary slides')
 const slideText = (await Promise.all(slides.map(f => zip.file(f).async('string')))).join(' ')
 assert.match(slideText, /Annual licences were paid in February/); assert.match(slideText, /Key figures/)
 const book = await readWorkbook(xlsx), kpi = book.getWorksheet('Key figures')
 assert.equal(evaluate(kpi, 'D3'), evaluate(kpi, 'B3') - evaluate(kpi, 'C3'), 'KPI differences are live formulas')
 assert.match(htmlText, /<svg role="img"/)
 assert.equal(book.getWorksheet('Sources'), undefined, 'sections outside the template are absent')
 for (const bytes of [Buffer.from(pdf).toString('latin1'), slideText, JSON.stringify(sn), htmlText, JSON.stringify(book.worksheets.map(s => s.getSheetValues()))]) assert.doesNotMatch(bytes, /Private principal engineer|Private Person|annualSalary/)
 assert.notEqual((await h.mf.dispatchFetch(h.origin + `/api/easel/pack/${pack.id}/document.pdf`, { redirect: 'manual' })).status, 200, 'signed-out readers get no PDF')

 // Published numbers never move, even when a later refresh of a new pack sees later changes.
 const second = csv('2026-03', [['2026-03-31', '461', '250.00']]), sp = await h.kit('actuals', 'preview', second); await h.kit('actuals', 'commit', { ...second, fingerprint: sp.fingerprint })
 const next = await h.command('pack-create', { period: 'quarter', month: '2026-01', template: template.id }); await h.command('pack-refresh', { pack: next.id })
 assert.equal((await h.get(`/api/easel/snapshot/${published.snapshot}`)).sha256, sn.sha256)
 assert.equal(sha(await download('pdf')), sha(pdf)); assert.equal(sha(await download('pptx')), sha(pptx))
 const nextPreview = await h.get(`/api/easel/pack/${next.id}/preview`)
 assert.equal(nextPreview.body.variances.find(v => v.line === 'Software').actual, 430000 + 25000)

 // Saving to file stores: fakes hold the same PDF digest each.
 const status = await h.get('/api/easel/connections/pack-stores')
 assert.deepEqual(status.map(s => s.connected), [false, false, false])
 await h.send(`/api/easel/pack/${pack.id}/save`, { store: 'drive' }, h.owner).then(r => assert.equal(r.status, 409))
 const conn = (store, op, input, cookie = h.owner) => h.send(`/api/easel/connections/pack-stores/${store}/${op}`, input, cookie)
 assert.equal((await conn('drive', 'connect', { clientId: 'synthetic-easel-0', clientSecret: 'synthetic-easel-2', refreshToken: 'synthetic-easel-1', folderId: 'synthetic-easel-folder' }, planner)).status, 403)
 assert.equal((await conn('chest', 'connect', { origin: 'https://127.0.0.1', accessToken: 'synthetic-easel-chest', folderId: 'synthetic-easel-chest-folder' })).status, 400, 'private Chest addresses are refused')
 for (const [store, input] of [['drive', { clientId: 'synthetic-easel-0', clientSecret: 'synthetic-easel-2', refreshToken: 'synthetic-easel-1', folderId: 'synthetic-easel-folder' }], ['sharepoint', { tenant: 'synthetic-easel-tenant', clientId: 'synthetic-easel-3', clientSecret: 'synthetic-easel-4', driveId: 'synthetic-easel-drive', folderPath: 'Board packs/2026' }], ['chest', { origin: 'https://chest.synthetic-easel.example', accessToken: 'synthetic-easel-chest', folderId: 'synthetic-easel-chest-folder' }]]) {
  const r = await conn(store, 'connect', input); assert.equal(r.status, 200, JSON.stringify(r.value))
  const sealed = (await h.db.prepare('SELECT sealed FROM e_connection_secrets WHERE id=?').bind(`pack-store:${store}`).first()).sealed
  for (const v of Object.values(input)) if (/synthetic-easel-[0-9]$|chest$/.test(v)) assert.ok(!sealed.includes(v))
 }
 assert.ok(!JSON.stringify(await h.get('/api/easel/connections/pack-stores')).includes('synthetic-easel-2'), 'credentials are never returned')
 for (const store of ['drive', 'sharepoint', 'chest']) { const r = await h.send(`/api/easel/pack/${pack.id}/save`, { store }, h.owner); assert.equal(r.status, 200, JSON.stringify(r.value)); assert.equal(r.value.digest, sha(pdf)) }
 for (const store of ['drive', 'sharepoint', 'chest']) { assert.equal(remote.saved[store].length, 1); assert.equal(sha(remote.saved[store][0].bytes), sha(pdf), `${store} holds the downloaded PDF`) }
 assert.match(remote.saved.sharepoint[0].path, /root:\/Board packs\/2026\/easel-quarter-2026-03\.pdf:\/content/)
 const again = await h.send(`/api/easel/pack/${pack.id}/save`, { store: 'drive' }, h.owner); assert.equal(again.value.repeated, true); assert.equal(remote.saved.drive.length, 1)
 for (const cookie of [planner, board]) assert.equal((await h.send(`/api/easel/pack/${pack.id}/save`, { store: 'chest' }, cookie)).status, 403)
 await h.send(`/api/easel/pack/${next.id}/save`, { store: 'chest' }, h.owner).then(r => assert.equal(r.status, 409))
 assert.equal((await conn('drive', 'disconnect', {})).status, 200)
 assert.equal((await h.send(`/api/easel/pack/${(await h.command('pack-create', { month: '2026-03' })).id}/save`, { store: 'drive' }, h.owner)).status, 409)
})

test('draft pack previews keep pay detail from referenced versions private', async t => {
 const h = await harness(); t.after(() => h.close())
 await h.command('workspace', { name: 'Harbour Analytics', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 const sales = await h.command('department', { name: 'Sales' })
 const revenue = await h.command('line', { name: 'Subscription revenue', type: 'revenue' })
 const payroll = await h.command('line', { name: 'Salaries', type: 'operating-expense', payroll: true })
 await h.command('account-map', { account: '400', target: revenue.id }); await h.command('department-map', { source: 'Sales', department: sales.id })
 const budget = (await h.get('/api/easel/state')).scenarios[0]
 await h.command('position', { scenario: budget.id, title: 'Private principal engineer', holder: 'Private Person', department: sales.id, line: payroll.id, start: '2026-01', annualSalary: '123456', onCostPercent: '0' })
 const { forecast } = await h.command('approve-budget', { scenario: budget.id, revision: (await h.get(`/api/easel/scenario/${budget.id}`)).scenario.revision })
 const hiring = await h.command('branch', { from: forecast.id, name: 'Hiring version' })
 await h.command('formula', { scenario: forecast.id, revision: (await h.get(`/api/easel/scenario/${forecast.id}`)).scenario.revision, department: sales.id, unit: 'money', start: '2026-01', name: 'Hiring version salaries', formula: `VERSION("${hiring.id}", "Salaries", "Sales")` })
 const ledger = csv('2026-01', [['2026-01-28', '400', '-10000.00']]), reviewed = await h.kit('actuals', 'preview', ledger)
 await h.kit('actuals', 'commit', { ...ledger, fingerprint: reviewed.fingerprint })
 await h.command('close-month', { scenario: forecast.id, month: '2026-01' })
 const pack = await h.command('pack-create', { month: '2026-01' })
 const analyst = await h.person('analyst@example.test', 'finance', [], false)
 const preview = await h.get(`/api/easel/pack/${pack.id}/preview`, analyst)
 assert.equal(preview.stale, false); assert.ok(preview.body.lines.length)
 assert.doesNotMatch(JSON.stringify(preview), /Private Person|annualSalary/)
})
