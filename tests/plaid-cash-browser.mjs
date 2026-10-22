// Held-key sandbox proof: synthetic Plaid accounts, native finance UI, no real bank or payment.
// Invoke through the fleet's credential injector; no credential is logged or retained as evidence.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fresh, freePort, start, command } from './browser-runtime.mjs'
import { api, noOverflow, session } from './browser-journey.mjs'
import { readWorkbook, proveFormulas } from './spreadsheet-proof.mjs'
const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/plaid-cash')
await mkdir(evidence, { recursive: true })
const clientId = process.env.PLAID_CLIENT_ID, secret = process.env.PLAID_SECRET
assert.ok(clientId && secret, 'Use the held-key injector with the provisioned Plaid sandbox client ID and secret')
let accessToken, server, browser, root, port, removed = false, stage = 'sandbox grant'
const call = async (path, body = {}) => {
 const response = await fetch(`https://sandbox.plaid.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'Plaid-Version': '2020-09-14' }, body: JSON.stringify({ ...body, client_id: clientId, secret, ...(accessToken ? { access_token: accessToken } : {}) }), redirect: 'manual', signal: AbortSignal.timeout(20000) })
 if (response.status !== 200) throw new Error(`Plaid sandbox HTTP ${response.status} at ${path}`)
 return response.json()
}
const nav = (page, name) => page.getByRole('navigation', { name: 'Easel' }).getByRole('button', { name, exact: true }).click()
const bankCard = page => page.getByRole('region', { name: 'Plaid bank connection', exact: true })
const cashCard = page => page.getByRole('region', { name: '13-week planned cash', exact: true })
try {
 const created = await call('/sandbox/public_token/create', { institution_id: 'ins_109508', initial_products: ['transactions'] })
 const exchanged = await call('/item/public_token/exchange', { public_token: created.public_token })
 accessToken = exchanged.access_token
 const initial = await call('/accounts/balance/get')
 const eligible = initial.accounts.filter(a => a.type === 'depository')
 const initialCents = eligible.reduce((sum, a) => sum + Math.round(a.balances.current * 100), 0)
 assert.ok(eligible.length >= 2 && eligible.every(a => a.balances.iso_currency_code === 'USD'))
 root = await fresh()
 stage = 'native runtime'
 port = await freePort(); server = await start(root, port)
 browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
 const seed = await session(browser, root, server.origin, 'owner', 1440)
 const cmd = (op, body) => api(seed.context, server.origin, `command/${op}`, body)
 const year = new Date().getUTCFullYear()
 await cmd('workspace', { name: 'Synthetic Bank Studio', currency: 'USD', fiscalYearStart: 1, planStart: `${year}-01`, horizon: 24 })
 const department = await cmd('department', { name: 'Operations' })
 const line = await cmd('line', { name: 'Planned software', type: 'operating-expense' })
 const budget = (await api(seed.context, server.origin, 'state')).scenarios[0]
 const plannedOpening = initialCents + 6000000
 await cmd('scenario-cash', { scenario: budget.id, basis: 'estimate', opening: (plannedOpening / 100).toFixed(2), collectionLag: 0, paymentLag: 0 })
 const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)
 await cmd('expense', { scenario: budget.id, name: 'Future software payment', department: department.id, line: line.id, kind: 'one-off', start: future.slice(0,7), amount: '1000', paymentMethod: 'date', paymentDate: future })
 const forecast = (await cmd('approve-budget', { scenario: budget.id, revision: (await api(seed.context, server.origin, `scenario/${budget.id}`)).scenario.revision })).forecast
 const before = await api(seed.context, server.origin, `scenario/${forecast.id}`)
 await cmd('member', { email: 'board@dev.localhost', name: 'Board', role: 'viewer' })
 await seed.context.close()
 let snapshot, priorOverride = 0
 for (const width of [1440, 390]) {
  stage = `native bank settings ${width}`
  const owner = await session(browser, root, server.origin, 'owner', width), { page, context } = owner
  try {
   await nav(page, 'Settings')
   const card = bankCard(page)
   await card.getByRole('table', { name: 'Plaid connection', exact: true }).waitFor()
   if (width === 1440) {
    await noOverflow(page, `CONNECT-009 connection form ${width}`)
    await card.screenshot({ path: join(evidence, `bank-connect-${width}.png`) })
    await card.getByLabel('Plaid client ID', { exact: true }).fill(clientId)
    await card.getByLabel('Plaid secret', { exact: true }).fill(secret)
    await card.getByLabel('Plaid access token', { exact: true }).fill(accessToken)
    await card.getByRole('checkbox').check()
    const response = page.waitForResponse(r => r.url().endsWith('/connections/plaid/connect'))
    await card.getByRole('button', { name: 'Connect Plaid', exact: true }).click()
    const connected = await response
    assert.equal(connected.status(), 200, await connected.text())
   }
   const refreshed = page.waitForResponse(r => r.url().endsWith('/connections/plaid/refresh'))
   await card.getByRole('button', { name: 'Refresh bank cash', exact: true }).click()
   const result = await (await refreshed).json()
   assert.equal(result.error, null, 'Plaid must confirm the complete balance and posted-transaction read')
   snapshot = result.snapshot
   assert.equal(snapshot.balanceCents, initialCents); assert.equal(snapshot.accountCount, eligible.length)
   assert.ok(snapshot.movements.length > 0)
   assert.doesNotMatch(JSON.stringify(snapshot), /account_id|merchant_name|access_token|client_id/)
   await page.reload(); await nav(page, 'Settings')
   await bankCard(page).getByRole('table', { name: 'Posted bank movement', exact: true }).waitFor()
   await noOverflow(page, `CONNECT-009 observed bank cash ${width}`)
   await bankCard(page).screenshot({ path: join(evidence, `bank-connected-${width}.png`) })
   stage = `native bank weekly cash ${width}`
   await nav(page, 'Overview')
   const cash = cashCard(page)
   await cash.getByRole('table', { name: 'Weekly planned cash', exact: true }).waitFor()
   await cash.getByLabel('Weekly cash basis', { exact: true }).selectOption('bank')
   await cash.getByText(/Planning estimate from Plaid bank balance/).waitFor()
   let view = await api(context, server.origin, `weekly-cash/${forecast.id}?basis=bank`)
   assert.equal(view.weeks[0].opening, initialCents + priorOverride)
   assert.match(view.basis, /not ledger actuals/)
   assert.equal(view.weeks.length, 13)
   await cash.getByLabel('Week starting', { exact: true }).selectOption(view.weeks[0].start)
   await cash.getByLabel('Cash adjustment', { exact: true }).fill(width === 1440 ? '-25.01' : '-50.02')
   await cash.getByLabel('Adjustment note', { exact: true }).fill(`Finance bank timing review ${width}`)
   await Promise.all([page.waitForResponse(r => r.url().endsWith('/command/weekly-cash-override') && r.ok()), cash.getByRole('button', { name: 'Save weekly adjustment', exact: true }).click()])
   await page.reload(); await nav(page, 'Overview')
   await cashCard(page).getByLabel('Weekly cash basis', { exact: true }).selectOption('bank')
   await cashCard(page).getByText(`Finance bank timing review ${width}`, { exact: true }).waitFor()
   view = await api(context, server.origin, `weekly-cash/${forecast.id}?basis=bank`)
   assert.equal(view.weeks[0].adjustment, width === 1440 ? -2501 : -5002)
   for (const r of view.reconciliation) assert.equal(r.difference, initialCents - plannedOpening + view.weeks[0].adjustment)
   const downloaded = page.waitForEvent('download')
   await cashCard(page).getByRole('link', { name: 'Download weekly cash Excel', exact: true }).click()
   const book = await readWorkbook(await readFile(await (await downloaded).path())); proveFormulas(book)
   assert.equal(book.getWorksheet('Weekly cash').getCell('C4').value, initialCents)
   assert.equal(book.getWorksheet('Reconciliation').getCell('F3').result, initialCents - plannedOpening + view.weeks[0].adjustment)
   await noOverflow(page, `FIN-007 bank basis ${width}`)
   await cashCard(page).screenshot({ path: join(evidence, `bank-weekly-${width}.png`) })
   stage = `native bank alerts ${width}`
   const alerts = page.getByRole('region', { name: 'Cash alerts', exact: true })
   if (width === 1440) {
    await alerts.getByLabel('Rule name', { exact: true }).fill('Bank 50k under plan')
    await alerts.getByLabel('Alert when', { exact: true }).selectOption('bank-below-plan')
    await alerts.getByLabel('Shortfall amount (USD)', { exact: true }).fill('50000')
    const savedRule = page.waitForResponse(r => r.url().endsWith('/command/cash-alert-rule-save'))
    await alerts.getByRole('button', { name: 'Add cash alert rule', exact: true }).click()
    const saved = await savedRule; assert.equal(saved.status(), 200, await saved.text())
   }
   await alerts.getByText(/bank cash is .* below plan on/).waitFor()
   await noOverflow(page, `CONNECT-009 bank cash alert ${width}`)
   await alerts.screenshot({ path: join(evidence, `bank-alert-${width}.png`) })
   const after = await api(context, server.origin, `scenario/${forecast.id}`)
   assert.deepEqual(after.calculation, before.calculation, 'the bank observation and weekly override cannot rewrite monthly forecast arithmetic')
   if (width === 1440) {
    stage = 'native credential-free archive'
    await server.close(); server = undefined
    await command(root, ['export', '--output', 'exports/plaid-custody.rer'])
    const archive = await readFile(join(root, 'exports/plaid-custody.rer'), 'utf8')
    const manifest = JSON.parse(archive.split('\n')[0])
    assert.ok(!manifest.tables.some(t => t.name === 'e_connection_secrets'))
    for (const credential of [clientId, secret, accessToken]) assert.ok(!archive.includes(credential), 'real rer export excludes Plaid credentials')
    server = await start(root, port)
   } else {
    stage = 'native provider disconnect'
    await nav(page, 'Settings')
    await Promise.all([page.waitForResponse(r => r.url().endsWith('/connections/plaid/disconnect') && r.ok()), bankCard(page).getByRole('button', { name: 'Disconnect Plaid', exact: true }).click()])
    await bankCard(page).getByText(/Plaid confirmed item removal/).waitFor()
    removed = true
    await noOverflow(page, 'CONNECT-009 disconnected phone')
    await bankCard(page).screenshot({ path: join(evidence, 'bank-disconnected-390.png') })
    const probe = await fetch('https://sandbox.plaid.com/accounts/balance/get', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken }) })
    assert.notEqual(probe.status, 200, 'the live Plaid item is actually revoked')
    await probe.body?.cancel()
   }
   console.log(`CONNECT-009 / FIN-007 ${width}: live sandbox native connect/refresh, aggregate movement, bank-based weekly cash, source-labeled alert and formula Excel passed`)
  } finally { await owner.context.close() }
  const board = await session(browser, root, server.origin, 'board', width)
  try {
   await nav(board.page, 'Overview')
   await cashCard(board.page).getByRole('table', { name: 'Weekly planned cash', exact: true }).waitFor()
   assert.equal(await cashCard(board.page).getByLabel('Weekly cash basis', { exact: true }).count(), 0)
   const response = await board.context.request.get(server.origin + `/api/easel/weekly-cash/${forecast.id}?basis=bank`)
   assert.equal(response.status(), 403)
   await noOverflow(board.page, `FIN-007 restricted bank basis ${width}`)
   await cashCard(board.page).screenshot({ path: join(evidence, `bank-board-${width}.png`) })
  } finally { await board.context.close() }
 }
 await writeFile(join(evidence, 'sandbox-receipt.json'), JSON.stringify({ provider: 'Plaid sandbox', candidate: process.env.EASEL_CANDIDATE_SHA ?? null, accountCount: snapshot.accountCount, transactionCount: snapshot.rowCount, nativeWidths: [1440,390], credentialFreeArchive: true, providerItemRemovalConfirmed: removed, completedAt: new Date().toISOString() }, null, 2) + '\n')
} catch (error) {
 let message = String(error?.message ?? error)
 for (const credential of [clientId, secret, accessToken].filter(Boolean)) message = message.replaceAll(credential, '[redacted]')
 throw new Error(`Plaid sandbox journey failed at ${stage}: ${message}`)
} finally {
 await browser?.close(); await server?.close()
 if (accessToken && !removed) try { await call('/item/remove') } catch { console.error('Plaid sandbox cleanup was not confirmed; no credentials retained in evidence') }
 if (root) await rm(root, { recursive: true, force: true })
}
