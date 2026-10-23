import type { D } from './shared'
let ready: Promise<D> | undefined
export function officeHost(): Promise<D> {
 if (ready) return ready
 ready = new Promise((resolve, reject) => {
  const finish = async () => {
   const host = window as unknown as D
   try {
    await host.Office.onReady()
    if (!['PowerPoint', 'Word'].includes(host.Office.context.host)) throw new Error('Open Easel reports in PowerPoint or Word.')
    resolve({ Office: host.Office, Word: host.Word, PowerPoint: host.PowerPoint })
   } catch (e) { reject(e) }
  }
  if ((window as unknown as D).Office) { void finish(); return }
  const script = document.createElement('script')
  script.src = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js'
  script.onload = () => { void finish() }
  script.onerror = () => reject(new Error('Office could not load. Reopen the add-in in a supported Office host.'))
  document.head.appendChild(script)
 })
 return ready
}
export async function officeAdapter(): Promise<D> {
 const path = '/office/adapter.mjs'
 return import(/* @vite-ignore */ path)
}
