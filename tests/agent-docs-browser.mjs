// Compare the published guide to the production MCP door, using a native owner session.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, extname, join } from 'node:path'
import { builtBrowserRuntime } from './built-browser-runtime.mjs'
import { command } from './browser-runtime.mjs'
import { noOverflow } from './browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-agent-docs')
await mkdir(evidence, { recursive: true })
await command(process.cwd(), ['build', '--site'])
const root = resolve('dist/site')
const site = createServer(async (request, response) => {
 try {
  const path = new URL(request.url, 'http://localhost').pathname
  const file = resolve(root, '.' + (extname(path) ? path : path === '/' ? '/index.html' : path + '.html'))
  if (!file.startsWith(root + '/')) { response.writeHead(404); response.end(); return }
  const bytes = await readFile(file)
  response.writeHead(200, { 'content-type': ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream' })
  response.end(bytes)
 } catch { response.writeHead(404); response.end() }
})
let runtime, browser, context
try {
 await new Promise(resolve => site.listen(0, '127.0.0.1', resolve))
 const origin = `http://127.0.0.1:${site.address().port}`
 runtime = await builtBrowserRuntime()
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-mock-keychain', '--password-store=basic'] })
 context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
 const send = async (path, body, expected = 200, method = 'post') => {
  const response = await context.request[method](runtime.origin + path, { headers: { origin: runtime.origin }, data: body, maxRedirects: 0 })
  assert.equal(response.status(), expected, await response.text())
  return expected === 200 ? response.json() : null
 }
 await send('/auth/bootstrap', { token: runtime.bootstrap, displayName: 'Synthetic Finance' }, 303)
 await send('/api/easel/command/workspace', { name: 'Synthetic agent documentation', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01' })
 await send('/agents/api/policy', { document: { schema: 'rer-agent-policy/1', catalogue: 'rer-agent-classes/1', rules: [{ id: 'all', class: '*', do: 'autonomous' }], spend: { none: true } } }, 200, 'put')
 let id = 0
 const rpc = async (method, params = {}) => {
  const response = await context.request.post(runtime.origin + '/mcp', { headers: { origin: runtime.origin, 'mcp-protocol-version': '2025-11-25' }, data: { jsonrpc: '2.0', id: ++id, method, params } })
  assert.equal(response.status(), 200, await response.text())
  const body = await response.json(); assert.ok(!body.error, JSON.stringify(body)); return body.result
 }
 const text = value => value.replace(/\s+/g, ' ').trim()
 const discovery = await rpc('server/discover'), { tools } = await rpc('tools/list')
 const { prompts } = await rpc('prompts/list'), { resourceTemplates } = await rpc('resources/templates/list')
 const page = await context.newPage()
 await page.goto(origin + '/docs')
 await page.getByRole('link', { name: 'Planning with agents', exact: false }).last().click()
 await page.waitForURL('**/docs/agents')
 const article = page.locator('article[data-doc=agents]')
 await article.getByRole('heading', { level: 1 }).waitFor()
 assert.deepEqual(await article.locator('h3').allTextContents(), tools.map(tool => tool.name), 'Published tools equal the live MCP catalogue')
 assert.ok(text(await article.innerText()).includes(text(discovery.instructions)), 'Discovery and the built guide share generated instructions')
 for (const tool of tools) {
  const details = await article.locator('h3').filter({ hasText: tool.name }).evaluate(heading => {
   const text = []
   for (let node = heading.nextElementSibling; node && node.tagName !== 'H3' && node.tagName !== 'H2'; node = node.nextElementSibling) text.push(node.textContent)
   return text.join('\n')
  })
  assert.ok(details.includes(tool._meta['com.runeditrun/scope']), tool.name)
  for (const cls of tool._meta['com.runeditrun/classes']) assert.ok(details.includes(`Computed class proof ${cls}:`), `${tool.name} has a published ${cls} proof`)
 }
 const guide = text(await article.innerText())
 for (const prompt of prompts) {
  assert.ok(guide.includes(prompt.name))
  const retrieved = await rpc('prompts/get', { name: prompt.name })
  assert.ok(guide.includes(text(retrieved.messages[0].content.text)), 'The published job is retrievable through MCP')
 }
 assert.deepEqual(resourceTemplates, [])
 assert.match(guide, /Resource template inventory: none declared/)
 for (const value of Object.values(discovery._meta['com.runeditrun/limits'])) assert.ok(guide.includes(value.toLocaleString('en-US')), 'The guide names the configured capacity')
 const sizes = await article.locator('p, li, h1, h2, h3, code').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)))
 assert.ok(sizes.every(size => size >= 13), 'Published guide text is readable')
 for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 })
  await noOverflow(page, `Agent guide ${width}`)
  await page.screenshot({ path: join(evidence, `agent-guide-${width}.png`), fullPage: true })
 }
 console.log(`PROBE BASE-AGENT-013 docs: GET /docs/agents -> ${tools.length} live tools, ${prompts.length} retrievable jobs, exact scopes and class proofs, empty resource inventory; 1440 and 390 screens captured`)
} finally {
 await context?.close(); await browser?.close(); await runtime?.close()
 await new Promise(resolve => site.close(resolve))
}
