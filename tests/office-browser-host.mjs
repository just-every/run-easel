// Test-only Office boundary injected into the browser by the public UI journey.
import { createOfficeHost } from './office-host.mjs'
window.officeTestHost = createOfficeHost(window.officeHostName ?? 'PowerPoint')
Object.assign(window, window.officeTestHost)
window.Office.onReady = async () => ({ host: window.Office.context.host })
