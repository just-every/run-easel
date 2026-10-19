// MOBILE-001: the complete phone-width monthly planning loop through the real UI.
import { chromium } from '@playwright/test'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { planningJourney, reviewJourney } from './browser-journey.mjs'

const existing = process.argv.includes('--existing')
const root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-mobile')
const width = Number(process.env.EASEL_WIDTH ?? 390)
await mkdir(evidence, { recursive: true })
let server, browser
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 await planningJourney(browser, root, server.origin, evidence, width)
 await reviewJourney(browser, root, server.origin, evidence, width)
 console.log(`MOBILE-001 passed at ${width}: actuals, close, explanations, comments, submissions, exact-revision approval and promotion, dashboard; every page checked for overflow`)
} finally {
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
