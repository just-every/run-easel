import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { command, fresh, freePort, start } from './browser-runtime.mjs'
import { api, session } from './browser-journey.mjs'
import { readReforecastsJourney, saveReforecastJourney, seedReforecasts } from './reforecasts-browser-journey.mjs'

const { chromium } = await import(process.env.EASEL_PLAYWRIGHT_MODULE ?? '@playwright/test')
const existing = process.argv.includes('--existing'), root = existing ? process.cwd() : await fresh()
const evidence = resolve(process.env.EASEL_EVIDENCE ?? '.cache/easel-reforecasts')
await mkdir(evidence, { recursive: true })
let server, browser
try {
 const port = await freePort()
 await command(root, ['setup', '--owner-email', 'owner@example.test', '--port', String(port)])
 server = await start(root, port)
 browser = await chromium.launch({ headless: true, ...(process.env.EASEL_CHROMIUM_PATH ? { executablePath: process.env.EASEL_CHROMIUM_PATH } : {}), args: ['--use-mock-keychain', '--password-store=basic'] })
 const owner = await session(browser, root, server.origin, 'owner', 1440)
 await seedReforecasts(owner.context, server.origin)
 await owner.context.close()
 await saveReforecastJourney(browser, root, server.origin, evidence, 1440, 'Q2 reforecast', '1400')
 await saveReforecastJourney(browser, root, server.origin, evidence, 390, 'Q3 reforecast', '1600')
 const finance = await session(browser, root, server.origin, 'owner', 1440)
 const forecast = (await api(finance.context, server.origin, 'state')).scenarios.find(s => s.kind === 'forecast')
 await api(finance.context, server.origin, 'command/forecast-window', { scenario: forecast.id, revision: forecast.revision, months: 18 })
 await finance.context.close()
 for (const width of [1440, 390]) for (const as of ['owner', 'board']) await readReforecastsJourney(browser, root, server.origin, evidence, width, as)
} finally {
 await browser?.close()
 await server?.close()
 if (!existing) await rm(root, { recursive: true, force: true })
}
