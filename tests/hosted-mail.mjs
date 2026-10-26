import assert from 'node:assert/strict'

const address = process.env.EASEL_INVITE_EMAIL
const receiver = 'https://rer-qa-inbox.runeditrun.workers.dev/receipts'

export async function acceptHostedInvite(browser, owner, origin) {
 assert.ok(address, 'Inject the controlled EASEL_INVITE_EMAIL sandbox recipient')
 for (const kind of ['bounces', 'blocks', 'invalid_emails', 'spam_reports']) {
  const response = await fetch(`https://api.sendgrid.com/v3/suppression/${kind}/${encodeURIComponent(address)}`, {
   headers: { authorization: `Bearer ${process.env.MAIL_API_KEY}` },
  })
  assert.ok(response.ok || response.status === 404, `Read ${kind} before sending`)
  if (response.ok) assert.equal((await response.json()).length, 0, `QA recipient has no ${kind} suppression`)
 }
 const since = new Date().toISOString()
 const invite = await owner.request.post(origin + '/api/easel/invite', { headers: { origin }, data: { email: address } })
 assert.equal(invite.status(), 200)
 let receipt
 const deadline = Date.now() + 120000
 while (Date.now() < deadline && !receipt) {
  const url = new URL(receiver)
  for (const [key, value] of Object.entries({ to: address, since, subject: "You're invited to Easel" })) url.searchParams.set(key, value)
  const response = await fetch(url, { headers: { authorization: `Bearer ${process.env.QA_INBOX_RECEIPT_TOKEN}` } })
  assert.equal(response.status, 200)
  receipt = (await response.json()).receipts.find(row => row.to === address && row.receivedAt >= since)
  if (!receipt) await new Promise(resolve => setTimeout(resolve, 5000))
 }
 assert.ok(receipt, 'The receiver recorded the actual invitation')
 assert.equal(receipt.auth.dmarc, 'pass', 'The delivered invitation passes receiver authentication')
 assert.ok(receipt.rawUrl, 'The native sign-in path comes from delivered mail')
 const raw = await fetch(new URL(receipt.rawUrl, receiver), { headers: { authorization: `Bearer ${process.env.QA_INBOX_RECEIPT_TOKEN}` } })
 assert.equal(raw.status, 200)
 const mime = (await raw.text()).replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
 const candidates = [...mime.matchAll(/https:\/\/[^\s<>"']+/g)].map(match => match[0].replaceAll('&amp;', '&'))
 const link = candidates.map(value => { try { return new URL(value) } catch { return null } }).find(value => value?.origin === origin && value.pathname.startsWith('/auth/'))
 assert.ok(link, 'Delivered invitation includes this installation’s native confirmation link')
 console.log(`Delivered invitation: receiver id=${receipt.id} receivedAt=${receipt.receivedAt} DMARC=${receipt.auth.dmarc}`)
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
 const page = await context.newPage()
 await page.goto(link.href)
 await page.getByRole('button', { name: /Accept|Confirm|Continue|Sign in/i }).click()
 await page.waitForURL(url => ['/setup', '/app'].includes(url.pathname))
 const me = await context.request.get(origin + '/auth/session')
 assert.equal(me.status(), 200)
 assert.ok(JSON.stringify(await me.json()).includes(address), 'The delivered invitation signs in its recipient')
 return { context, page }
}
