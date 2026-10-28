import { IntacctImport } from './intacct'
import { NetSuiteImport } from './netsuite'
import { PantryImport } from './pantry'
import { XeroImport } from './xero'
import { QboImport } from './qbo'
import { SourceGuard } from './source-guard'
import { IncumbentImport } from './move-import'
import { BalanceActuals } from './balance-actuals'
import { BALANCE_TARGETS } from '../easel/balance-targets'
import { useEffect, useState } from 'react'
import { FilePicker } from './file-picker'
import type { Shared } from './app'
import { Action, api, command, money, monthLabel, Person, Table, type D } from './shared'
import { Dots } from './dots'

const ROLES = [
 ['date', 'Date', /^(date|transaction date|posted)$/i], ['period', 'Period (YYYY-MM)', /^(period|month)$/i],
 ['account', 'Account code', /account (code|no|number)|^account$|^code$/i], ['accountName', 'Account name', /account name|^name$/i],
 ['accountType', 'Account type', /^(account type|type)$/i],
 ['department', 'Department', /department|tracking|cost cent/i], ['debit', 'Debit', /^debit/i], ['credit', 'Credit', /^credit/i],
 ['amount', 'Amount', /^(amount|net|value)$/i], ['description', 'Description', /description|memo|narration/i], ['reference', 'Reference', /reference|^ref/i],
] as const

const headerOf = (csv: string) => (csv.replace(/^﻿/, '').split(/\r?\n/)[0].match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()).filter(Boolean)
const fileText = (file: File) => file.text()
const fileBase64 = async (file: File) => { const bytes = new Uint8Array(await file.arrayBuffer()); let raw = ''; for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(raw) }

/** Actuals in, mapped, reconciled and reversible; plus the Excel planning workbook move-in. */
export function Actuals({ state, refresh }: Shared) {
 const [reconciliation, setReconciliation] = useState<D | null>(null),[entities,setEntities]=useState<D[]>([]),[entity,setEntity]=useState('')
 useEffect(()=>{api('entities').then(v=>{setEntities(v.entities);setEntity(id=>v.entities.some((e:D)=>e.id===id)?id:v.entities[0]?.id??'')})},[state])
 useEffect(()=>{api('actuals'+(entity?'?entity='+encodeURIComponent(entity):'')).then(setReconciliation,()=>setReconciliation(null))},[state,entity])
 const currency = reconciliation?.currency??state.workspace.currency
 return <>
  {entities.length>0&&<label>Reconciliation entity<select aria-label="Reconciliation entity" value={entity} onChange={e=>setEntity(e.target.value)}>{entities.map(e=><option key={e.id} value={e.id}>{e.name} · {e.currency}</option>)}</select></label>}
  <IntacctImport state={state} refresh={refresh}/>
  <SourceGuard state={state} refresh={refresh} />
  <PantryImport state={state} refresh={refresh} />
  <NetSuiteImport state={state} refresh={refresh}/><QboImport refresh={refresh} state={state}/><XeroImport refresh={refresh} state={state}/>
  <CsvImport state={state} refresh={refresh} />
  <section className="card">
   <h2>Imports</h2>
   <Table caption="Actuals imports" heads={['File', 'Status', 'Rows accepted', 'Rows left out', 'Months', 'Accepted by', '']}>
    {state.batches.map((b: D) => <tr key={b.id}><td>{b.file}</td><td>{b.status}</td><td className="num">{b.accepted}</td><td className="num">{b.rejected}</td><td>{b.periods.map(monthLabel).join(', ')}</td><td><Person state={state} email={b.acceptedBy} /></td><td>
     {b.status === 'importing' && <Action label="Continue import" run={async () => { await api('import/actuals/resume', { id: b.id }); await refresh() }} />}
     {(b.status === 'accepted' || b.status === 'undoing') && (b.closedPeriods?.length ? <span>Closed {b.closedPeriods.map(monthLabel).join(', ')}. Import a correcting file to change these actuals.</span> : <Action label="Undo import" kind="danger" confirm={`Remove every row ${b.file} added?`} run={async () => { await api('import/actuals/undo', { id: b.id }); await refresh() }} />)}
    </td></tr>)}
   </Table>
  </section>
  {reconciliation && <section className="card">
   <h2>Reconciliation</h2>
   <p><a href={`/api/easel/actuals.xlsx${entity?'?entity='+encodeURIComponent(entity):''}`} download>Download reconciliation (Excel)</a></p>
   <p className="muted">Every imported amount is mapped to a planning line, excluded, held as cash or another balance-sheet line, or shown here as unmapped. Amounts are debit-positive as imported.</p>
   <Table caption="Reconciliation by month" heads={['Month', 'Rows', 'Imported net', 'Mapped', 'Excluded', 'Cash', 'Other balance sheet', 'Unmapped', 'Revenue', 'Costs', 'Balanced', 'Mapping status']}>
    {reconciliation.months.map((m: D) => <tr key={m.period}><td>{m.label}</td><td className="num">{m.rows}</td><td className="num">{money(m.imported, currency)}</td><td className="num">{money(m.mapped, currency)}</td><td className="num">{money(m.excluded, currency)}</td><td className="num">{money(m.cash, currency)}</td><td className="num">{money(m.balanceSheet, currency)}</td><td className="num">{money(m.unmapped, currency)}</td><td className="num">{money(m.revenue, currency)}</td><td className="num">{money(m.costs, currency)}</td><td>{m.balanced ? 'Yes' : 'No'}</td><td>{m.blocked ? `Blocked: ${[...m.unmappedAccounts, ...m.unmappedDepartments].join(', ')}` : 'Complete'}</td></tr>)}
   </Table>
   {reconciliation.unmapped.length > 0 && <p role="alert">Unmapped accounts: {reconciliation.unmapped.map((u: D) => `${u.period}: ${u.account} (${u.rows} rows; ${u.reason})`).join(', ')}</p>}
  </section>}
  {reconciliation && <BalanceActuals trials={reconciliation.trialBalances} currency={currency} lines={state.lines} batches={state.batches} />}
  <WorkbookImport state={state} refresh={refresh} />
  {state.me.payDetail && <IncumbentImport state={state} refresh={refresh} />}
 </>
}

function MappingSelect({ state, account, save }: { state: D; account: D; save: (op: string, body: D) => void }) {
 return <select aria-label={`Map account ${account.account}`} defaultValue={account.target ?? ''} onChange={e => save('account-map', { account: account.account, target: e.target.value, name: account.name })}>
  <option value="">Not mapped</option>{state.lines.map((l: D) => <option key={l.id} value={l.id}>{l.name}</option>)}<option value="excluded">Exclude (not planned)</option>{BALANCE_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
 </select>
}

function CsvImport({ state, refresh }: { state: D; refresh: () => Promise<void> }) {
 const [file, setFile] = useState<{ name: string; csv: string; headers: string[] } | null>(null)
 const [settings, setSettings] = useState<D>({ amountMode: 'debit-credit', dateFormat: state.workspace.dateFormat ?? 'MM/DD/YYYY', allowRepeats: false, columns: {} })
 const [preview, setPreview] = useState<D | null>(null)
 const [acknowledged, setAcknowledged] = useState(false)
 const [error, setError] = useState('')
 const [saving, setSaving] = useState(0)
 const [chain] = useState<{ last: Promise<unknown> }>({ last: Promise.resolve() })
 const body = () => ({ csv: file!.csv, filename: file!.name, ...settings })
 const run = async () => { setError(''); try { setPreview(await api('import/actuals/preview', body())); setAcknowledged(false) } catch (e) { setError((e as Error).message); setPreview(null) } }
 // Mapping choices save one after another, then the preview refreshes once.
 const save = (op: string, payload: D) => {
  setSaving(n => n + 1)
  chain.last = chain.last.then(() => command(op, payload)).catch(e => setError((e as Error).message)).finally(() => setSaving(n => { if (n === 1) void run(); return n - 1 }))
 }
 const currency = state.workspace.currency
 return <section className="card">
  <h2>Upload actuals (CSV)</h2>
  <p className="muted">A general-ledger detail export: one row per posted line with a date, account and amount. Nothing is saved until you accept the preview.</p>
  <FilePicker label="Actuals file" button="Choose a CSV file" accept=".csv,text/csv" filename={file?.name} onFile={async f => { const csv = await fileText(f); const headers = headerOf(csv); const columns: D = {}; for (const [role, , pattern] of ROLES) { const h = headers.find(x => pattern.test(x)); if (h) columns[role] = h } if (columns.date) delete columns.period; setFile({ name: f.name, csv, headers }); setSettings(s => ({ ...s, columns, amountMode: columns.debit && columns.credit ? 'debit-credit' : 'debit-positive' })); setPreview(null) }} />
  {file && <>
   <div className="form">
    {ROLES.map(([role, label]) => <label key={role}>{label} column<select aria-label={`${label} column`} value={settings.columns[role] ?? ''} onChange={e => setSettings(s => ({ ...s, columns: { ...s.columns, [role]: e.target.value || undefined } }))}><option value="">—</option>{file.headers.map(h => <option key={h} value={h}>{h}</option>)}</select></label>)}
    <label className="wide-select">Amounts<select aria-label="Amounts" value={settings.amountMode} onChange={e => setSettings(s => ({ ...s, amountMode: e.target.value }))}><option value="debit-credit">Separate debit and credit columns</option><option value="debit-positive">One column, debits positive</option><option value="credit-positive">One column, credits positive</option></select></label>
    <label>Date format<select aria-label="Date format" value={settings.dateFormat} onChange={e => setSettings(s => ({ ...s, dateFormat: e.target.value }))}>{['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'].map(f => <option key={f}>{f}</option>)}</select></label>
    <label className="check"><input aria-label="Identical rows in this file are separate transactions" type="checkbox" checked={settings.allowRepeats} onChange={e => setSettings(s => ({ ...s, allowRepeats: e.target.checked }))} /> Identical rows in this file are separate transactions</label>
    <div className="form-end"><button type="button" onClick={run}>Preview</button>{error && <p role="alert" className="error">{error}</p>}</div>
   </div>
  </>}
  {preview && <>
   <h3>Preview of {preview.file}</h3>
   <p role="status">{saving > 0 ? 'Saving mappings…' : preview.unmappedAccounts.length || preview.unmappedDepartments.length ? `${preview.unmappedAccounts.length} accounts and ${preview.unmappedDepartments.length} departments still need a mapping.` : 'Every account and department is mapped.'}</p>
   <Dots as="p">{`${preview.rows} rows read`}{`${preview.accepted} can be accepted`}{`${preview.rejected.length} rejected`}{`net ${money(preview.net, currency)} (debit-positive)`}</Dots>
   <Table caption="Months in this file" heads={['Month', 'Rows', 'Debits', 'Credits', 'Mapping status']}>{preview.periods.map((p: D) => <tr key={p.period}><td>{p.label}</td><td className="num">{p.rows}</td><td className="num">{money(p.debit, currency)}</td><td className="num">{money(p.credit, currency)}</td><td>{p.blocked ? `Blocked: ${[...p.unmappedAccounts, ...p.unmappedDepartments].join(', ')}` : 'Complete'}</td></tr>)}</Table>
   <Table caption="Accounts" heads={['Account', 'Name', 'Rows', 'Net', 'Maps to', 'Mapping source', 'Sign check']}>{preview.accounts.map((a: D) => <tr key={a.account}><td>{a.account}</td><td>{a.name}</td><td className="num">{a.rows}</td><td className="num">{money(a.net, currency)}</td><td><MappingSelect state={state} account={a} save={save} /></td><td>{a.mappingStatus === 'ambiguous' ? 'Conflicting rules' : a.ruleIds.length ? `Automatic (${a.ruleIds.length} matching ${a.ruleIds.length === 1 ? 'rule' : 'rules'})` : a.target ? 'Single account' : 'Not mapped'}</td><td className="wrap">{a.sign || 'OK'}</td></tr>)}</Table>
   <Table caption="Departments" heads={['In the file', 'Rows', 'Maps to']}>{preview.departments.map((d: D) => <tr key={d.source}><td>{d.source}</td><td className="num">{d.rows}</td><td><select aria-label={`Map department ${d.source}`} defaultValue={d.department ?? '__'} onChange={e => save('department-map', { source: d.source === '(blank)' ? '' : d.source, department: e.target.value })}>{d.department === null && <option value="__" disabled>Not mapped</option>}<option value="">No department</option>{state.departments.map((x: D) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td></tr>)}</Table>
   {preview.rejected.length > 0 && <Table caption="Rejected rows" heads={['Line', 'Why']}>{preview.rejected.map((r: D) => <tr key={r.line}><td className="num">{r.line}</td><td className="wrap">{r.reason}</td></tr>)}</Table>}
   <div className="row">
    <button type="button" className="quiet" onClick={run}>Preview again with the mappings</button>
    {preview.rejected.length > 0 && <label className="check"><input aria-label={`Leave the ${preview.rejected.length} rejected rows out`} type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /> Leave the {preview.rejected.length} rejected rows out</label>}
    <Action label={`Accept ${preview.accepted} rows`} run={async () => {
     if (preview.unmappedAccounts.length || preview.unmappedDepartments.length) throw new Error('Map every account and department, then preview again')
     if (preview.rejected.length && !acknowledged) throw new Error('Confirm that the rejected rows stay out')
     await api('import/actuals/commit', { ...body(), fingerprint: preview.fingerprint, acknowledgeRejected: acknowledged ? preview.rejected.length : 0 })
     setPreview(null); setFile(null); await refresh()
    }} />
   </div>
  </>}
 </section>
}

function WorkbookImport({ state, refresh }: { state: D; refresh: () => Promise<void> }) {
 const [file, setFile] = useState<{ name: string; base64: string } | null>(null)
 const [preview, setPreview] = useState<D | null>(null)
 const [maps, setMaps] = useState<{ lineMap: D; departmentMap: D; sheet?: string }>({ lineMap: {}, departmentMap: {} })
 const [error, setError] = useState('')
 const body = () => ({ base64: file!.base64, filename: file!.name, ...maps })
 const run = async (next = maps) => { setError(''); try { setPreview(await api('import/workbook/preview', { base64: file!.base64, filename: file!.name, ...next })) } catch (e) { setError((e as Error).message); setPreview(null) } }
 const currency = state.workspace.currency
 return <section className="card">
  <h2>Move in a planning workbook (.xlsx)</h2>
  <p className="muted">One row per line and department, one column per month, with headings “Line” and “Department”. Easel translates supported formulas into a live source model, reports unsupported cells kept at their cached values, and reconciles formula totals before staging a new scenario you can compare, adopt or undo.</p>
  <FilePicker label="Planning workbook" button="Choose a workbook" accept=".xlsx" filename={file?.name} onFile={async f => { setFile({ name: f.name, base64: await fileBase64(f) }); setPreview(null) }} />
  {file && <div className="row"><button type="button" onClick={() => run()}>Preview workbook</button>{error && <p role="alert" className="error">{error}</p>}</div>}
  {preview && <>
   <Dots as="p">{`Sheet ${preview.sheet} (headings on row ${preview.headerRow})`}{`${preview.rows.length} plan rows`}{`${preview.skipped.length} skipped`}{`${preview.formulaReport.filter((r:D)=>r.status==='translated').length} translated formulas`}{`${preview.formulaReport.filter((r:D)=>r.status==='cached').length} unsupported formulas kept as values`}{`${preview.rounded} values rounded to cents`}{preview.outside.length > 0 && `ignored months outside the plan: ${preview.outside.join(', ')}`}</Dots>
   {preview.sheets.length > 1 && <label className="inline">Sheet<select aria-label="Sheet" value={preview.sheet} onChange={e => { const next = { ...maps, sheet: e.target.value }; setMaps(next); void run(next) }}>{preview.sheets.map((s: string) => <option key={s}>{s}</option>)}</select></label>}
   {(preview.unresolvedLines.length > 0 || preview.unresolvedDepartments.length > 0) && <div className="notice"><p>Match these workbook names to Easel:</p>
    {preview.unresolvedLines.map((n: string) => <label key={n} className="inline">Line “{n}”<select aria-label={`Workbook line ${n}`} defaultValue="" onChange={e => { const next = { ...maps, lineMap: { ...maps.lineMap, [n]: e.target.value } }; setMaps(next); void run(next) }}><option value="">Choose…</option>{state.lines.map((l: D) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>)}
    {preview.unresolvedDepartments.map((n: string) => <label key={n} className="inline">Department “{n}”<select aria-label={`Workbook department ${n}`} defaultValue="" onChange={e => { const next = { ...maps, departmentMap: { ...maps.departmentMap, [n]: e.target.value } }; setMaps(next); void run(next) }}><option value="">Choose…</option>{state.departments.map((d: D) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>)}
   </div>}
   <Table caption="Formula translation" heads={['Sheet','Cell','Formula','Result','Reason']}>{preview.formulaReport.map((r:D)=><tr key={`${r.sheet}!${r.cell}`}><td>{r.sheet}</td><td>{r.cell}</td><td>{r.formula}</td><td>{r.status==='translated'?'Live formula':'Cached value'}</td><td>{r.reason ?? '—'}</td></tr>)}</Table>
   <Table caption="Workbook total reconciliation" heads={['Cell','Month','Workbook','Translated','Difference','Status']}>{preview.workbookTotals.map((r:D)=><tr key={r.cell}><td>{r.sheet}!{r.cell}</td><td>{r.month}</td><td>{r.workbookCents===null?'Unavailable':money(r.workbookCents,currency)}</td><td>{r.translatedCents===null?'Unavailable':money(r.translatedCents,currency)}</td><td>{r.differenceCents===null?'Unavailable':money(r.differenceCents,currency)}</td><td>{r.status}</td></tr>)}</Table>
   {!preview.workbookTotals.length && <p role="alert">Include a total row with supported formulas to reconcile this workbook before importing.</p>}
   <Table caption="Workbook rows" heads={['Row', 'Line', 'Department', 'Total', 'Formulas']}>{preview.rows.map((r: D) => <tr key={r.row}><td className="num">{r.row}</td><td>{r.line}</td><td>{r.department}</td><td className="num">{money(r.total, currency)}</td><td className="num">{r.formulas}</td></tr>)}</Table>
   {preview.skipped.length > 0 && <ul className="plain">{preview.skipped.map((s: D) => <li key={s.row}>Row {s.row} skipped: {s.reason}</li>)}</ul>}
   {preview.rejected.length > 0 && <ul className="plain">{preview.rejected.map((s: D) => <li key={s.row} role="alert">Row {s.row}: {s.reason}</li>)}</ul>}
   <Action label="Import as a new scenario" run={async () => { await api('import/workbook/commit', { ...body(), fingerprint: preview.fingerprint }); setPreview(null); setFile(null); await refresh() }} />
  </>}
  {state.workbooks.length > 0 && <Table caption="Workbook imports" heads={['File', 'Sheet', 'Rows', 'Status', '']}>
   {state.workbooks.map((w: D) => <tr key={w.id}><td>{w.file}</td><td>{w.sheet}</td><td className="num">{w.rows}</td><td>{w.status}</td><td>
    {w.status === 'importing' && <Action label="Continue import" run={async () => { await api('import/workbook/resume', { id: w.id }); await refresh() }} />}
    {w.status === 'imported' && <Action label="Undo workbook import" kind="danger" confirm="Remove what this workbook added? Rows someone has since edited are kept." run={async () => { await api('import/workbook/undo', { id: w.id }); await refresh() }} />}
   </td></tr>)}
  </Table>}
 </section>
}

