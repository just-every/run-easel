import ExcelJS from 'exceljs'

/** A large ordinary vendor worksheet, using the published workbook import format. */
export async function largeWorkbook(rows = 2201) {
 const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Vendor plan')
 sheet.addRow(['Line', 'Department', '2026-01'])
 for (let i = 0; i < rows; i++) sheet.addRow(['Software', 'Operations', 100 + i % 19])
 const total = Array.from({ length: rows }, (_, i) => 100 + i % 19).reduce((sum, n) => sum + n, 0)
 sheet.addRow(['Total', '', { formula: `SUM(C2:C${rows + 1})`, result: total }])
 return { filename: 'synthetic-easel-6.xlsx', base64: Buffer.from(await book.xlsx.writeBuffer()).toString('base64') }
}

export async function smallBusinessModel(h) {
 await h.command('workspace', { name: 'Synthetic small-business scale model', currency: 'USD', fiscalYearStart: 1, planStart: '2026-01', horizon: 36 })
 const departments = [], lines = [], dimensions = []
 for (const name of ['Operations', 'Engineering', 'Sales', 'Marketing', 'Finance']) departments.push(await h.command('department', { name }))
 for (const name of ['Software', 'Cloud', 'Facilities', 'Contractors', 'Travel']) lines.push(await h.command('line', { name, type: 'operating-expense' }))
 for (const name of ['Region', 'Product', 'Channel', 'Entity', 'Cost category']) {
  const dimension = await h.command('dimension', { name }), members = []
  for (let i = 1; i <= 5; i++) members.push(await h.command('dimension-member', { dimension: dimension.id, name: `${name} ${i}` }))
  dimensions.push({ dimension, members })
 }
 const scenario = (await h.get('/api/easel/state')).scenarios[0]
 return { scenario, departments, lines, dimensions }
}

export async function finishJob(h, initial, cookie = h.owner) {
 let result = initial
 while (result.calculationJob?.status === 'running') {
  await new Promise(resolve => setTimeout(resolve, 50))
  const response = await h.send(`/api/easel/calculation-jobs/${result.calculationJob.id}`, undefined, cookie)
  if (response.status === 409) continue
  if (response.status !== 200) throw new Error(JSON.stringify(response.value))
  result = response.value
 }
 if (result.calculationJob) {
  if (result.calculationJob.status !== 'completed' || result.responseStatus !== 200) throw new Error(JSON.stringify(result))
  return result.result
 }
 return result
}
