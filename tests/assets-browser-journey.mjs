import assert from 'node:assert/strict'
import { join } from 'node:path'
import { api, settle } from './browser-journey.mjs'

const addMonths = (month, count) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth()+count); return d.toISOString().slice(0,7) }

export async function assetsBrowserJourney(page, context, origin, evidence, width, create = false) {
 let state = await api(context, origin, 'state')
 const forecast = state.scenarios.find(s=>s.kind==='forecast')
 const start = addMonths(forecast.actualsThrough ?? state.workspace.planStart,1)
 if (create) {
  await page.getByRole('button',{name:'Settings',exact:true}).click()
  const lines = page.locator('form').filter({has:page.getByRole('button',{name:'Add line',exact:true})})
  await lines.getByLabel('Line name',{exact:true}).fill('Asset depreciation')
  await lines.getByLabel('Type',{exact:true}).selectOption('operating-expense')
  await lines.getByLabel('Non-cash expense line',{exact:true}).check()
  await lines.getByRole('button',{name:'Add line',exact:true}).click()
  await page.getByRole('cell',{name:'Asset depreciation',exact:true}).waitFor()
  await lines.scrollIntoViewIfNeeded()
  await page.screenshot({path:join(evidence,`asset-settings-${width}.png`),fullPage:false})
  await page.getByRole('button',{name:'Plan',exact:true}).click()
  await page.getByLabel('Scenario', { exact: true }).selectOption(forecast.id)
  await settle(page)
  const category = page.locator('form').filter({has:page.getByRole('button',{name:'Add asset category',exact:true})})
  await category.getByLabel('Asset category name',{exact:true}).fill('Equipment')
  await category.getByLabel('Useful life (months)',{exact:true}).fill('60')
  await category.getByRole('button',{name:'Add asset category',exact:true}).click()
  await settle(page)
  await page.getByRole('cell', { name: 'Equipment', exact: true }).waitFor()
  const asset = page.locator('form').filter({has:page.getByRole('button',{name:'Add asset',exact:true})})
  await asset.getByLabel('Asset name',{exact:true}).fill('Production equipment')
  await asset.getByLabel('Asset category',{exact:true}).selectOption({label:'Equipment'})
  await asset.getByLabel('Department',{exact:true}).selectOption({label:state.departments[0].name})
  await asset.getByLabel('Depreciation and disposal expense line',{exact:true}).selectOption({label:'Asset depreciation'})
  await asset.getByLabel('Asset cost',{exact:true}).fill('120000')
  await asset.getByLabel('In-service month',{exact:true}).fill(start)
  await asset.getByLabel('Payment month (purchases)',{exact:true}).fill(addMonths(start,1))
  await asset.getByLabel('Disposal month',{exact:true}).fill(addMonths(start,3))
  await asset.getByLabel('Disposal proceeds',{exact:true}).fill('110000')
  await asset.getByRole('button',{name:'Add asset',exact:true}).click()
  await settle(page)
  try { await page.getByRole('cell',{name:'Production equipment',exact:true}).waitFor() }
  catch (error) { await asset.screenshot({ path: join(evidence, `failed-asset-form-${width}.png`) }); throw error }
 }
 await page.getByRole('button',{name:'Plan',exact:true}).click()
 const section = page.locator('section').filter({has:page.getByRole('heading',{name:'Fixed assets',exact:true})})
 await section.scrollIntoViewIfNeeded()
 await page.screenshot({path:join(evidence,`asset-plan-${width}.png`),fullPage:false})
 const view=await api(context,origin,`scenario/${forecast.id}`)
 const rows=view.calculation.assets.filter(a=>a.name==='Production equipment')
 assert.equal(rows.find(a=>a.month===start).depreciation,200000)
 assert.equal(rows.find(a=>a.month===start).closingBookValue,11800000)
 assert.equal(rows.find(a=>a.month===addMonths(start,1)).capex,12000000)
 assert.equal(rows.find(a=>a.month===addMonths(start,3)).disposalBookValue,11400000)
 assert.equal(rows.find(a=>a.month===addMonths(start,3)).closingBookValue,0)
 assert.equal(rows.find(a=>a.month===addMonths(start,3)).disposalProceeds,11000000)
 await page.getByRole('button',{name:'Overview',exact:true}).click()
 const schedule=page.locator('section').filter({has:page.getByRole('heading',{name:'Fixed-asset schedule',exact:true})})
 await schedule.waitFor();await schedule.scrollIntoViewIfNeeded()
 await page.screenshot({path:join(evidence,`asset-overview-${width}.png`),fullPage:false})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 if (!create) {
  await page.getByRole('button',{name:'Settings',exact:true}).click()
  const field=page.getByLabel('Non-cash expense line',{exact:true})
  await field.scrollIntoViewIfNeeded()
  await page.screenshot({path:join(evidence,`asset-settings-${width}.png`),fullPage:false})
 }
 console.log(`FIN-004 browser asset entry, book values and cash passed at ${width}`)
}
