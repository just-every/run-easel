import { useRef, useState, type ReactNode } from 'react'
import { Action, api, Field, Form, money, Table, useDate, type D } from './shared'

function minor(value: unknown) {
 const text = String(value ?? '').trim()
 if (!/^\d+(\.\d{1,2})?$/.test(text)) throw Error('Use a nonnegative amount with at most two decimal places')
 const [whole, fraction = ''] = text.split('.')
 const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
 if (!Number.isSafeInteger(amount)) throw Error('Amount exceeds exact minor units')
 return amount
}

export function PantryCashReview({ scenario, basis, start, render }: { scenario: string; basis: string; start: string; render: (view: D) => ReactNode }) {
 const [review, setReview] = useState<D | null>(null), [result, setResult] = useState<D | null>(null), [request, setRequest] = useState<D | null>(null)
 const date = useDate(), generation = useRef(0)
 const [exportError, setExportError] = useState('')
 const invalidate = () => { generation.current++; setResult(null); setRequest(null); setExportError('') }
 return <div aria-label="Combined cash source review">
  <Form submit="Review Pantry open items" onSubmit={async values => {
   invalidate(); setReview(null)
   const current = generation.current
   const [source, plan] = await Promise.all([api('pantry/cash', values), api(`scenario/${scenario}`)])
   if (current !== generation.current) return
   setReview({ source, revision: plan.scenario.revision, days: (plan.calculation.dailyCash ?? []).filter((r: D) => r.date > source.asOf && (r.collections > 0 || r.payments > 0)) })
  }}>
   <div onChange={() => { invalidate(); setReview(null) }}><Field label="Open-item observation date (UTC)" name="asOf" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
  </Form>
  {review && <>
   <h3>Review open items</h3>
   <p>Observed {date(review.source.asOf)} · {review.source.currency}. This preview changes no plan. Invoice dates use fully paid customer history; bills use their due dates.</p>
   <Table caption="Pantry open cash items" heads={['Source item', 'Cash date', 'Amount', 'Payment history']}>
    {review.source.events.map((e: D) => <tr key={`${e.kind}-${e.id}`}><td className="wrap">{e.kind === 'invoice' ? 'Invoice' : 'Bill'} {e.id}</td><td>{date(e.date)}</td><td className="num">{money(e.amount, review.source.currency)}</td><td>{e.kind === 'invoice' ? `${e.lateDays} days late · ${e.paidInvoiceCount} paid invoices` : 'Due date'}</td></tr>)}
   </Table>
   {!review.source.complete ? <div role="alert"><p>Resolve every open-item date in Pantry before combining cash.</p><ul>{review.source.unresolved.map((e: D) => <li key={`${e.kind}-${e.id}`}>{e.id}: {e.reason}</li>)}</ul></div> :
    <Form key={review.source.digest + review.revision} submit="Preview combined cash" onSubmit={async values => {
     invalidate()
     const replacements = review.days.map((r: D, i: number) => ({ date: r.date, collections: minor(values[`collections-${i}`]), payments: minor(values[`payments-${i}`]) })).filter((r: D) => r.collections || r.payments)
     const body = { scenario, revision: review.revision, asOf: review.source.asOf, sourceFingerprint: review.source.digest, basis, ...(start ? { start } : {}), replacements, additionalCollections: minor(values.additionalCollections), additionalPayments: minor(values.additionalPayments) }
     const current = generation.current
     const next = await api('pantry/cash-forecast', body)
     if (current === generation.current) { setRequest(body); setResult(next) }
    }}>
     <div onChange={invalidate}>
      <h3>Allocate source cash</h3>
      <p>Enter how much of each dated plan amount the source replaces. Mark the rest explicitly as additional cash. Every source cent must be accounted for; no automatic matching is applied.</p>
      <p>Source collections: {money(review.source.events.filter((e: D) => e.kind === 'invoice').reduce((n: number, e: D) => n + e.amount, 0), review.source.currency)} · source payments: {money(review.source.events.filter((e: D) => e.kind === 'bill').reduce((n: number, e: D) => n + e.amount, 0), review.source.currency)}</p>
      <Table caption="Dated planned cash replacements" heads={['Planned cash date', 'Planned collections', 'Replace collections', 'Planned payments', 'Replace payments']}>
       {review.days.map((r: D, i: number) => <tr key={r.date}><td>{date(r.date)}</td><td className="num">{money(r.collections, review.source.currency)}</td><td><Field label={`Replace collections on ${r.date}`} name={`collections-${i}`} defaultValue="0.00" /></td><td className="num">{money(r.payments, review.source.currency)}</td><td><Field label={`Replace payments on ${r.date}`} name={`payments-${i}`} defaultValue="0.00" /></td></tr>)}
      </Table>
      <Field label="Additional source collections" name="additionalCollections" defaultValue="0.00" />
      <Field label="Additional source payments" name="additionalPayments" defaultValue="0.00" />
     </div>
    </Form>}
  </>}
  {exportError && <p role="alert" className="error">{exportError}</p>}
  {result && request && <div aria-label="Combined cash forecast">
   <h3>Combined cash forecast</h3>
   <Action label="Download combined cash Excel" run={async () => {
    try {
     const response = await fetch('/api/easel/pantry/cash-forecast', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, format: 'xlsx' }) })
     if (!response.ok) { const value: D = await response.json(); throw Error(value.error ?? 'Combined cash export failed') }
     const url = URL.createObjectURL(await response.blob()), link = document.createElement('a')
     link.href = url; link.download = 'easel-combined-cash.xlsx'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { invalidate(); setExportError((error as Error).message) }
   }} />
   {render(result)}
  </div>}
 </div>
}
