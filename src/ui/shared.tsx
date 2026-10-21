import { waitForCalculation } from './calculation-request'
import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import { useScrollEdges, revealHorizontally } from './scroll'
import { DotText } from './dots'

export type D = Record<string, any>

export async function api(path: string, body?: unknown): Promise<any> {
 const response = await fetch(`/api/easel/${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
 const value: any = await response.json().catch(() => ({ error: `Request failed (${response.status})` }))
 if (!response.ok) throw new Error(value.error ?? `Request failed (${response.status})`)
 if (response.status === 202 && value.calculationJob) return waitForCalculation(path, body, value, api)
 return value
}
export const command = (op: string, body: D) => api(`command/${op}`, body)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (m?: string | null) => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '—')
export const addMonths = (m: string, n: number) => { const i = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}` }

export function money(minor: number | null | undefined, currency = 'USD') {
 if (minor === null || minor === undefined) return '—'
 const abs = Math.abs(minor), whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
 return `${minor < 0 ? '-' : ''}${(currency === 'AUD' || currency === 'USD') ? '$' : currency + ' '}${whole}.${String(abs % 100).padStart(2, '0')}`
}
/** Integer cents, hundredths or basis points back to the decimal text a form shows. */
export const decimalText = (n: number | undefined | null) => (n === undefined || n === null ? '' : `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`)

export type Option = { value: string; label: string }
export function Field({ label, name, defaultValue, type = 'text', required = true, options, hint, multiple }: { label: string; name: string; defaultValue?: any; type?: string; required?: boolean; options?: { value: string; label: string }[]; hint?: string; multiple?: boolean }) {
 const initial = defaultValue ?? (multiple ? [] : '')
 const [monthValue, setMonthValue] = useState(String(initial))
 const control = options
  ? <select aria-label={label} name={name} defaultValue={initial} required={required} multiple={multiple}>{!multiple && <option value="">Choose…</option>}{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  : type === 'textarea' ? <textarea aria-label={label} name={name} defaultValue={initial} required={required} rows={3} />
  : type === 'checkbox' ? <input aria-label={label} name={name} type="checkbox" defaultChecked={!!defaultValue} />
  : type === 'month' ? <span className="month-control"><input aria-label={label} name={name} type="month" defaultValue={initial} required={required} onChange={e => setMonthValue(e.target.value)} />{!monthValue && <span className="month-hint">Choose a month</span>}</span>
  : <input aria-label={label} name={name} type={type} defaultValue={initial} required={required} inputMode={type === 'text' && /amount|salary|rate|arpa|percent|volume|customers|opening/i.test(name) ? 'decimal' : undefined} />
 const text = label.includes(' · ') ? <DotText text={label} /> : label
 const field = <label className={type === 'checkbox' ? 'check' : options?.some(o => o.label.length > 26) ? 'wide-select' : undefined}>{type === 'checkbox' ? <>{control} {text}</> : <>{text}{control}</>}</label>
 return hint ? <div className="field">{field}<small>{hint}</small></div> : field
}

/** A form that submits its named fields as one object and shows the server's refusal next to the button. */
export function Form({ children, onSubmit, submit = 'Save', className }: { children: ReactNode; onSubmit: (values: D, form: HTMLFormElement) => Promise<unknown>; submit?: string; className?: string }) {
 const [busy, setBusy] = useState(false), [error, setError] = useState('')
 return <form className={className ?? 'form'} onSubmit={async e => {
  e.preventDefault()
  const form = e.currentTarget, data = new FormData(form), values: D = {}
  for (const [k, v] of data.entries()) values[k] = k in values ? [].concat(values[k], v as any) : v
  form.querySelectorAll('select[multiple]').forEach((s: any) => { values[s.name] = [...s.selectedOptions].map((o: any) => o.value) })
  form.querySelectorAll('input[type=checkbox]').forEach((c: any) => { if (c.name) values[c.name] = c.checked })
  setBusy(true); setError('')
  try { await onSubmit(values, form) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
 }}>{children}<div className="form-end"><button disabled={busy}>{busy ? 'Working…' : submit}</button>{error && <p role="alert" className="error">{error}</p>}</div></form>
}

/** A single action button that reports its own failure. */
export function Action({ label, run, confirm: question, kind }: { label: string; run: () => Promise<unknown>; confirm?: string; kind?: 'quiet' | 'danger' }) {
 const [busy, setBusy] = useState(false), [error, setError] = useState('')
 return <span className="action"><button type="button" className={kind} disabled={busy} onClick={async () => {
  if (question && !window.confirm(question)) return
  setBusy(true); setError('')
  try { await run() } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
 }}>{busy ? 'Working…' : label.includes(' · ') ? <DotText text={label} /> : label}</button>{error && <span role="alert" className="error">{error}</span>}</span>
}

export function Table({ heads, children, caption, className }: { heads: ReactNode[]; children: ReactNode; caption?: string; className?: string }) {
 const { ref, edges } = useScrollEdges()
 return <div className="scroll-frame" data-before={edges.before} data-after={edges.after}><div ref={ref} className="table-scroll" tabIndex={0} role="region" aria-label={caption ?? 'Table'} onFocusCapture={e => revealHorizontally(e.target as HTMLElement, true)}><table className={className}>{caption && <caption>{caption.includes(' · ') ? <DotText text={caption} /> : caption}</caption>}<thead><tr>{heads.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>{edges.after && <span className="scroll-cue" aria-hidden="true" />}</div>
}

export const options = (rows: D[], label = 'name'): { value: string; label: string }[] => rows.map(r => ({ value: String(r.id), label: String(r[label] ?? r.id) }))

export function ScenarioPicker({ scenarios, value, onChange, label = 'Scenario' }: { scenarios: D[]; value: string; onChange: (id: string) => void; label?: string }) {
 const selectedId = useId()
 const description = (s: D) => `${s.name} · ${s.kind}${s.status === 'frozen' ? s.kind === 'reforecast' ? ' (frozen)' : ' (approved)' : s.status === 'closed' ? ' (closed)' : ''}`
 const selected = scenarios.find(s => s.id === value)
 const longName = selected && description(selected).length > 32 ? description(selected) : ''
 return <label className="scenario-picker">{label}<select aria-label={label} aria-describedby={longName ? selectedId : undefined} value={value} onChange={e => onChange(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{description(s)}</option>)}</select>{longName && <DotText as="small" id={selectedId} className="selected-option" text={longName} />}</label>
}

export const kindLabel: Record<string, string> = { revenue: 'Revenue', 'cost-of-sales': 'Cost of sales', 'operating-expense': 'Operating expenses' }

export function Person({ state, email }: { state: D; email?: string | null }) {
 const person = [state.me, ...(state.members ?? [])].find(p => p.email === email)
 return <span title={email ?? undefined}>{person?.name || (email ? state.actorNames?.[email] : '') || email || 'Unknown person'}</span>
}
export const fiscalMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((label, i) => ({ value: String(i + 1), label }))

import { usDate } from '../easel/date-format'
export const DateFormatContext = createContext('MM/DD/YYYY')
export function useDate() { const format = useContext(DateFormatContext); return (value?: string | null) => usDate(value, format) }

export const US_TIME_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'].map(value => ({value, label: value.replaceAll('_', ' ')}))

export const ENGLISH_LOCALES = [{value:'en-US',label:'English (United States)'},{value:'en-GB',label:'English (United Kingdom)'},{value:'en-AU',label:'English (Australia)'}]
export const DATE_FORMATS = ['MM/DD/YYYY','DD/MM/YYYY','YYYY-MM-DD'].map(value => ({value,label:value}))
