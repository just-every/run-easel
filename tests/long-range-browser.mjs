import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { session } from './browser-journey.mjs'
import { seedLongRange, longRangeJourney } from './long-range-browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-long-range')
await mkdir(evidence, { recursive: true })
let server, browser
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const owner = await session(browser, root, server.origin, 'owner', 1440)
 await seedLongRange(owner.context, server.origin)
 await owner.context.close()
 for (const width of [1440, 390]) {
  await longRangeJourney(browser, root, server.origin, evidence, width, 'owner')
  await longRangeJourney(browser, root, server.origin, evidence, width, 'board')
 }
} finally {
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
