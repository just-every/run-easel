import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

const playwrightModule = process.env.EASEL_PLAYWRIGHT_MODULE || '@playwright/test'
const { chromium } = await import(
  isAbsolute(playwrightModule) ? pathToFileURL(playwrightModule).href : playwrightModule
)

const browser = await chromium.launch({
  headless: true,
  ...(process.platform === 'darwin' ? { args: ['--use-mock-keychain', '--password-store=basic'] } : {})
})
await browser.close()
