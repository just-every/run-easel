import { Action, Field, Form, money, monthLabel, options, Table, type D } from './shared'

export function AssetInputs({ view, state, save, remove }: { view: D; state: D; save: (op: string, b: D) => Promise<void>; remove: (kind: string, id: string) => Promise<void> }) {
 const categories = view.inputs['asset-category'] ?? [], assets = view.inputs.asset ?? []
 const currency = state.workspace.currency
 const depts = state.me.role === 'finance' ? state.departments : state.departments.filter((d: D) => state.me.departments.includes(d.id))
 return <section className="card">
  <h2>Fixed assets</h2>
  <p className="muted">Straight-line depreciation starts in the in-service month. Purchases reach cash in their payment month. A disposal stops depreciation in its month and removes the remaining book value; proceeds reach cash that month.</p>
  <Table caption="Asset categories" heads={['Category', 'Useful life (months)', '']}>{categories.map((c: D) => <tr key={c.id}><td>{c.name}</td><td className="num">{c.usefulLifeMonths}</td><td>{state.me.role === 'finance' && <Action label="Remove category" kind="danger" run={() => remove('asset-category', c.id)} />}</td></tr>)}</Table>
  {state.me.role === 'finance' && <Form submit="Add asset category" onSubmit={v => save('asset-category', v)}>
   <Field label="Asset category name" name="name" />
   <Field label="Useful life (months)" name="usefulLifeMonths" defaultValue="60" />
  </Form>}
  <Table caption="Planned and existing assets" heads={['Asset', 'Category', 'Kind', 'Cost', 'In service', 'Payment', 'Disposal', '']}>{assets.map((a: D) => <tr key={a.id}><td>{a.name}</td><td>{categories.find((c: D) => c.originId === a.category)?.name}</td><td>{a.kind}</td><td className="num">{money(a.costCents, currency)}</td><td>{monthLabel(a.start)}</td><td>{monthLabel(a.paymentMonth)}</td><td>{monthLabel(a.disposalMonth)}</td><td><Action label="Remove asset" kind="danger" run={() => remove('asset', a.id)} /></td></tr>)}</Table>
  {categories.length > 0 && <Form submit="Add asset" onSubmit={v => save('asset', { ...v, remainingLifeMonths: v.remainingLifeMonths || undefined, paymentMonth: v.paymentMonth || undefined })}>
   <Field label="Asset name" name="name" />
   <Field label="Asset category" name="category" options={categories.map((c: D) => ({value:c.originId,label:c.name}))} />
   <Field label="Asset kind" name="kind" options={[{value:'purchase',label:'Planned purchase'},{value:'existing',label:'Existing at plan start'}]} defaultValue="purchase" />
   <Field label="Department" name="department" options={options(depts)} />
   <Field label="Depreciation and disposal expense line" name="line" options={options(state.lines.filter((l: D) => l.type !== 'revenue' && !l.payroll && l.nonCash))} />
   <p className="muted">Create a non-cash expense line under Settings for depreciation and disposal gains or losses.</p>
   <Field label="Asset cost" name="cost" />
   <Field label="In-service month" name="start" type="month" defaultValue={state.workspace.planStart} />
   <Field label="Payment month (purchases)" name="paymentMonth" type="month" required={false} hint="Defaults to the in-service month" />
   <Field label="Opening accumulated depreciation (existing)" name="openingAccumulated" defaultValue="0" />
   <Field label="Remaining useful life (existing, months)" name="remainingLifeMonths" required={false} hint="Defaults to the category life" />
   <Field label="Disposal month" name="disposalMonth" type="month" required={false} />
   <Field label="Disposal proceeds" name="disposalProceeds" defaultValue="0" />
  </Form>}
 </section>
}
export function AssetSchedule({ calculation, currency }: { calculation: D; currency: string }) {
 if (!calculation.assets?.length) return null
 return <section className="card">
  <h2>Fixed-asset schedule</h2>
  <Table caption="Monthly asset book values and cash" heads={['Month', 'Asset', 'Opening book value', 'Depreciation', 'Disposal book value', 'Closing book value', 'Capex cash', 'Disposal cash']}>
   {calculation.assets.map((a: D, i: number) => <tr key={i}><td>{monthLabel(a.month)}</td><td>{a.name}</td>{['openingBookValue','depreciation','disposalBookValue','closingBookValue','capex','disposalProceeds'].map(k => <td key={k} className="num">{money(a[k],currency)}</td>)}</tr>)}
  </Table>
 </section>
}
