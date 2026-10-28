import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

const playwrightModule = process.env.EASEL_PLAYWRIGHT_MODULE || '@playwright/test'
const { chromium } = await import(
  isAbsolute(playwrightModule) ? pathToFileURL(playwrightModule).href : playwrightModule
)

try {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-mock-keychain', '--password-store=basic']
  })
  await browser.close()
} catch (error) {
  console.error(error)
  process.exit(/EACCES|permission denied/i.test(String(error)) ? 77 : 1)
}
