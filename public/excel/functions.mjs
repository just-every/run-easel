// Active invocations hold selectors in memory, never document credentials.
export function excelFunctions({ CustomFunctions, Excel, read, readReport }) {
 const active = new Set()
 const fail = error => new CustomFunctions.Error(CustomFunctions.ErrorCode.notAvailable, String(error.message ?? error))
 async function update(items) {
  const versions = items.map(item => item.version = (item.version ?? 0) + 1)
  const current = (item, i) => active.has(item) && item.version === versions[i]
  const results = await Promise.allSettled(items.map(async (item, i) => {
   try {
    const value = await (item.report ? readReport(item.selector) : read(item.selector))
    if (current(item, i)) item.invocation.setResult(item.report ? value.table : value.amount / 100)
   } catch (error) {
    if (current(item, i)) {
     if ([401, 403].includes(error.status)) {
      for (const live of active) { live.version = (live.version ?? 0) + 1; live.invocation.setResult(fail(error)) }
     } else item.invocation.setResult(fail(error))
    }
    throw error
   }
  }))
  const refused = results.find(result => result.status === 'rejected')
  if (refused) throw refused.reason
 }
 function register(selector, invocation, report = false) {
  const item = { selector, invocation, report }
  active.add(item)
  invocation.onCanceled = () => active.delete(item)
  void update([item]).catch(() => {})
 }
 async function refresh(selection = false) {
  let items = [...active]
  if (selection) {
   const address = await Excel.run(async context => {
    const range = context.workbook.getSelectedRange(); range.load('address'); await context.sync(); return range.address
   })
   items = items.filter(item => within(item.invocation.address, address))
  }
  try { await update(items) }
  finally { await Excel.run(async context => { context.workbook.application.calculate('FullRebuild'); await context.sync() }) }
 }
 CustomFunctions.associate('VALUE', (line, department, month, scenario, invocation) => register({ line, department, month, scenario }, invocation))
 CustomFunctions.associate('REPORT', (report, period, metric, invocation) => register({ report, period, metric }, invocation, true))
 return { refresh: () => refresh(), selection: () => refresh(true), open: () => refresh() }
}

function within(cell, selection) {
 const parse = address => {
  if (typeof address !== 'string') return null
  const bang = address.lastIndexOf('!'), sheet = address.slice(0, bang).replace(/^'|'$/g, '').replaceAll("''", "'")
  const match = address.slice(bang + 1).replaceAll('$', '').match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i)
  if (bang < 0 || !match) return null
  const column = text => [...text.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
  return { sheet: sheet.toLowerCase(), x: column(match[1]), y: Number(match[2]), right: column(match[3] ?? match[1]), bottom: Number(match[4] ?? match[2]) }
 }
 const c = parse(cell), s = parse(selection)
 return !!c && !!s && c.sheet === s.sheet && c.x >= s.x && c.x <= s.right && c.y >= s.y && c.y <= s.bottom
}

async function load(path, fetcher) {
 const response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store' })
 if (!response.ok) {
  let message = 'Sign in and refresh your Excel values'
  try { message = (await response.json()).error ?? message } catch {}
  throw Object.assign(new Error(message), { status: response.status })
 }
 return response.json()
}
export function readExcelValue(selector, fetcher = fetch) {
 const { scenario, ...query } = selector
 return load(`/api/easel/excel/${encodeURIComponent(scenario)}/value?${new URLSearchParams(query)}`, fetcher)
}
export function readExcelReport(selector, fetcher = fetch) {
 const { report, ...query } = selector
 return load(`/api/easel/excel/report/${encodeURIComponent(report)}?${new URLSearchParams(query)}`, fetcher)
}
