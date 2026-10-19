import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { command, freePort, start } from './browser-runtime.mjs'
import { session } from './browser-journey.mjs'
import { seedMappingRules, mappingRulesJourney, seedMappingReview, mappingReviewJourney, mappingViewerJourney } from './mapping-rules-browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const root = process.cwd(), evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-mapping-rules')
await mkdir(evidence, { recursive: true })
let server, browser
try {
 const port = process.env.EASEL_EXISTING_PORT ? Number(process.env.EASEL_EXISTING_PORT) : await freePort()
 if (!process.env.EASEL_EXISTING_PORT) await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const owner = await session(browser, root, server.origin, 'owner', 1440)
 const seed = await seedMappingRules(owner.context, server.origin)
 await owner.context.close()
 for (const width of [1440, 390]) await mappingRulesJourney(browser, root, server.origin, evidence, width, seed)
 const finance = await session(browser, root, server.origin, 'owner', 1440)
 let rule = await seedMappingReview(finance.context, server.origin, seed.services)
 await finance.context.close()
 for (const width of [1440, 390]) { rule = await mappingReviewJourney(browser, root, server.origin, evidence, width, rule); await mappingViewerJourney(browser, root, server.origin, evidence, width) }
} finally { await browser?.close(); await server?.close() }
