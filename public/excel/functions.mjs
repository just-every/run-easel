// Streaming worksheet values hold selectors in memory; never persist a session
// or an Easel amount in document settings. Each refresh rechecks live authority.
export function excelFunctions({ CustomFunctions, Excel, read }) {
 const active = new Set()
 const fail = error => new CustomFunctions.Error(CustomFunctions.ErrorCode.notAvailable, String(error.message ?? error))
 async function update(items) {
  const versions = items.map(item => item.version = (item.version ?? 0) + 1)
  const current = (item, i) => active.has(item) && item.version === versions[i]
  try {
   const values = await Promise.all(items.map(item => read(item.selector)))
   items.forEach((item, i) => { if (current(item, i)) item.invocation.setResult(values[i].amount / 100) })
  } catch (error) {
   items.forEach((item, i) => { if (current(item, i)) item.invocation.setResult(fail(error)) })
   throw error
  }
 }
 function value(line, department, month, scenario, invocation) {
  const item = { selector: { line, department, month, scenario }, invocation }
  active.add(item)
  invocation.onCanceled = () => active.delete(item)
  void update([item]).catch(() => {})
 }
 async function refresh() {
  await update([...active])
  await Excel.run(async context => { context.workbook.application.calculate('FullRebuild'); await context.sync() })
 }
 CustomFunctions.associate('VALUE', value)
 return { refresh, open: refresh }
}

export async function readExcelValue(selector, fetcher = fetch) {
 const { scenario, ...query } = selector
 const response = await fetcher(`/api/easel/excel/${encodeURIComponent(scenario)}/value?${new URLSearchParams(query)}`, { credentials: 'same-origin', cache: 'no-store' })
 if (!response.ok) throw new Error((await response.json()).error ?? 'Sign in and refresh your Excel values')
 return response.json()
}
