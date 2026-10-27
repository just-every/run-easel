import { excelFunctions, readExcelValue, readExcelReport } from './functions.mjs'

export async function startExcel(host = globalThis, fetcher = fetch) {
 const ready = await host.Office.onReady()
 if ((ready?.host ?? host.Office.context.host) !== 'Excel') throw new Error('Open this add-in in Excel.')
 if (!host.Office.context.requirements.isSetSupported('SharedRuntime', '1.1')) throw new Error('This Excel host needs shared runtime support.')
 const runtime = excelFunctions({ CustomFunctions: host.CustomFunctions, Excel: host.Excel,
  read: selector => readExcelValue(selector, fetcher), readReport: selector => readExcelReport(selector, fetcher) })
 const status = message => { const node = host.document?.getElementById('excel-status'); if (node) node.textContent = message }
 const run = action => async event => {
  try { await action(); status('Easel values refreshed.') }
  catch (error) { status(error.message) }
  finally { event?.completed?.() }
 }
 host.Office.actions.associate('refreshWorkbook', run(runtime.refresh))
 host.Office.actions.associate('refreshSelection', run(runtime.selection))
 host.document?.getElementById('refresh-workbook')?.addEventListener('click', run(runtime.refresh))
 host.document?.getElementById('refresh-selection')?.addEventListener('click', run(runtime.selection))
 await host.Office.addin.setStartupBehavior(host.Office.StartupBehavior.load)
 await run(runtime.open)()
 return runtime
}
if (typeof window !== 'undefined' && window.Office) {
 window.easelExcelReady = startExcel().catch(error => {
  const node = document.getElementById('excel-status'); if (node) node.textContent = error.message
  throw error
 })
}
