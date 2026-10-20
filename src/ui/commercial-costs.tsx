import { VendorFields } from './working-capital-inputs'
import { decimalText, Field, Form, money, type D } from './shared'

type Props = { row: D; view: D; currency: string; save: (op: string, body: D) => Promise<void> }
export function CommercialExpenseForm({ row, view, currency, save }: Props) {
 const inventory = row.kind === 'inventory'
 const sources = view.inputs.revenue.filter((r: D) => r.department === row.department && r.kind === (inventory ? 'volume' : 'customers'))
 return <Form key={`${row.id}:${view.scenario.revision}`} submit={inventory ? 'Save inventory assumptions' : 'Save acquisition assumptions'} onSubmit={values => save('expense', { ...values, id: row.id, kind: row.kind, department: row.department, line: row.line })}>
  <Field label="Linked cost name" name="name" defaultValue={row.name} />
  <Field label="Revenue source" name="revenueOrigin" options={sources.map((r: D) => ({ value: r.originId, label: r.name }))} defaultValue={row.revenueOrigin} />
  <Field label="Start month" name="start" type="month" defaultValue={row.start} />
  {inventory ? <><Field label="Cost per unit" name="unitCost" defaultValue={decimalText(row.unitCostCents)} /><Field label="Inventory days" name="inventoryDays" defaultValue={String(row.inventoryDays)} hint="Target closing stock = monthly COGS × days ÷ calendar days in that month. Purchases replace consumed stock and fund the buffer; suppliers follow cash payment timing." /></> : <Field label="Acquisition cost per new customer" name="cac" defaultValue={decimalText(row.cacCents)} hint="Multiplied by new customers before churn, including ramped acquisition capacity." />}
  <VendorFields row={row} />
  <p className="muted">These are editable planning assumptions in {currency}; no purchases or payments are executed.</p>
 </Form>
}
export function CommercialExpenseSummary({ row, currency }: { row: D; currency: string }) {
 return <>{row.kind === 'inventory' ? `${money(row.unitCostCents, currency)} per unit · ${row.inventoryDays} inventory days` : `${money(row.cacCents, currency)} per new customer`}</>
}
