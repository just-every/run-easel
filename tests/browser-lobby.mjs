// The shared installed front door, before and after the same native owner claim.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { noOverflow } from './browser-journey.mjs'

export async function lobbyJourney(browser, { origin, openUrl }, evidence) {
 assert.ok(openUrl, 'rer dev prints the owner sign-in URL')
 const state = async () => { const response = await fetch(origin + '/setup/state'); assert.equal(response.status, 200); return (await response.json()).state }
 assert.equal(await state(), 'unclaimed')
 for (const [path, type] of [['/rer-theme.css', 'text/css'], ['/fonts/fonts.css', 'text/css'], ['/brand/mark.svg', 'image/svg+xml'], ['/brand/band.svg', 'image/svg+xml'], ['/fonts/ibm-plex-sans/ibm-plex-sans-latin-wght-normal.woff2', 'font/woff2']]) {
  const response = await fetch(origin + path)
  assert.equal(response.status, 200, `Lobby asset ${path}`)
  assert.ok(response.headers.get('content-type')?.includes(type), `Lobby asset type ${path}`)
 }
 const owner = await browser.newContext()
 try {
  const page = await owner.newPage()
  for (const width of [1440, 390]) {
   const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })
   try {
    const anonymous = await context.newPage()
    await anonymous.goto(origin)
    const action = anonymous.getByRole('link', { name: 'Finish setup' })
    await action.waitFor(); assert.equal(await action.getAttribute('href'), '/setup')
    await noOverflow(anonymous, `Unclaimed Lobby at ${width}`)
    await anonymous.screenshot({ path: join(evidence, `${width}-lobby-unclaimed.png`), fullPage: true })

   } finally { await context.close() }
   await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
   if (width === 1440) await page.goto(openUrl).catch(() => { throw new Error('The printed owner sign-in URL did not open') })
   await page.waitForURL(/\/setup$/)
   await page.getByRole('checkbox').waitFor()
   await noOverflow(page, `Setup at ${width}`)
   await page.screenshot({ path: join(evidence, `${width}-setup.png`), fullPage: true })
  }
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Finish setup' }).click()
  await page.waitForURL(/\/app$/)
  assert.equal(await state(), 'claimed')
  const response = await owner.request.get(origin + '/api/easel/state')
  assert.equal(response.status(), 200, 'The printed sign-in URL gives the owner access to Easel')
 } finally { await owner.close() }
 for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } })
  try {
   const page = await context.newPage(); await page.goto(origin)
   const action = page.getByRole('link', { name: 'Sign in', exact: true })
   await action.waitFor(); assert.equal(await action.getAttribute('href'), '/signin')
   await noOverflow(page, `Claimed Lobby at ${width}`)
   await page.screenshot({ path: join(evidence, `${width}-lobby-claimed.png`), fullPage: true })
  } finally { await context.close() }
 }
 return { widths: [1440, 390], steps: ['unclaimed-lobby', 'printed-owner-link', 'setup', 'claimed-lobby'] }
}
