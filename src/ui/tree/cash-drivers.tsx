import { useEffect, useMemo, useRef, useState } from 'react'
import type { Shared } from '../app'
import { api, command, monthLabel, type D } from '../shared'
import { Dots } from '../dots'
import { defaultScenario } from '../overview'
import { TreeLinks, type Edge } from './tree-links'
import { buildTree, changeText, closingAt, momentText, zoneText, type Leaf, type Tree } from './tree-model'
import { cash, DriverCard, ExceptionCard, LeafCard, RootCard, shortName, Sticky } from './tree-cards'

/** The plan a person reads first: the working forecast, else the working budget. */
export const homeScenario = (scenarios: D[]) => defaultScenario(scenarios.filter(s => s.status === 'working' && !s.sandbox && (s.kind === 'forecast' || s.kind === 'budget')))

/** Responses to the home plan: proposals made from it and scenarios branched from it, still open. */
export const responsesTo = (scenarios: D[], home: string) => scenarios.filter(s => s.status === 'working' && !s.sandbox && s.branchedFrom?.scenario === home && (s.kind === 'proposal' || s.kind === 'scenario')).sort((a, b) => String(a.name).localeCompare(String(b.name)))

/** What the home plan is measured against: its latest saved reforecast, else the budget it opened from. */
export function baselineFor(scenarios: D[], home: D | undefined) {
 if (!home) return undefined
 const saved = scenarios.filter(s => s.kind === 'reforecast' && s.branchedFrom?.scenario === home.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1)
 return saved ?? (home.kind === 'forecast' ? scenarios.find(s => s.id === home.parent && s.status === 'frozen') : undefined)
}

/** Home: what drives the forecast's lowest month of cash, down to the inputs, and the responses proposed for it. */
export function CashDrivers({ state, refresh, go }: Shared) {
 const homeId = homeScenario(state.scenarios)
 const home = state.scenarios.find((s: D) => s.id === homeId)
 const baseline = baselineFor(state.scenarios, home)
 const options = responsesTo(state.scenarios, homeId)
 const [views, setViews] = useState<Record<string, D>>({})
 const [error, setError] = useState('')
 const [chosen, setChosen] = useState(() => typeof window === 'undefined' ? '' : new URL(window.location.href).searchParams.get('option') ?? '')
 const ids = [homeId, baseline?.id, ...options.map((o: D) => o.id)].filter(Boolean) as string[]
 const key = ids.map(id => `${id}:${state.scenarios.find((s: D) => s.id === id)?.revision}`).join('|')
 useEffect(() => {
  let live = true
  setError('')
  Promise.all(ids.map(id => api(`drivers/${id}`).then(v => [id, v] as const))).then(list => { if (live) setViews(Object.fromEntries(list)) }, e => { if (live) setError(e.message) })
  return () => { live = false }
 }, [key])
 const option = options.find((o: D) => o.id === chosen)
 const choose = (id: string) => { setChosen(id); const url = new URL(window.location.href); if (id) url.searchParams.set('option', id); else url.searchParams.delete('option'); window.history.replaceState(window.history.state, '', url) }
 const homeView = views[homeId], baseView = baseline ? views[baseline.id] ?? null : null, optionView = option ? views[option.id] ?? null : null
 const tree = useMemo(() => homeView ? buildTree(homeView, baseView, optionView, options.filter((o: D) => o.id !== option?.id).map((o: D) => views[o.id]).filter(Boolean), cash) : null, [homeView, baseView, optionView, views])
 if (!home) return <EmptyTree title="No working plan yet" go={go} text="Easel reads cash from the working budget or forecast. Finance sets up the plan first." />
 if (error) return <section className="card"><p role="alert" className="error">{error}</p></section>
 if (!homeView) return <section className="card"><p role="status">Tracing this plan’s cash…</p></section>
 if (!tree || !homeView.drivers.length) return <EmptyTree title="Nothing drives cash yet" go={go} text={`${home.name} has no revenue, people, spend or financing yet, so every month closes at its opening cash. Add revenue drivers, positions and expenses under Plan, or move in actuals under Actuals, and this page traces the lowest month back to them.`} />
 return <Board tree={tree} state={state} refresh={refresh} go={go} home={home} homeView={homeView} baseline={baseline} baseView={baseView} options={options} option={option} optionView={optionView} views={views} choose={choose} />
}

function EmptyTree({ title, text, go }: { title: string; text: string; go: Shared['go'] }) {
 return <><div className="page-head t-head"><h1>What drives cash</h1></div><section className="card t-empty"><h2>{title}</h2><p className="muted">{text}</p><p className="row"><button type="button" onClick={() => go('plan')}>Open Plan</button><button type="button" className="quiet" onClick={() => go('actuals')}>Move in actuals</button></p></section></>
}

type BoardProps = Pick<Shared, 'state' | 'refresh' | 'go'> & { tree: Tree; home: D; homeView: D; baseline?: D; baseView: D | null; options: D[]; option?: D; optionView: D | null; views: Record<string, D>; choose: (id: string) => void }

function Board({ tree, state, refresh, go, home, homeView, baseline, baseView, options, option, optionView, views, choose }: BoardProps) {
 const board = useRef<HTMLDivElement>(null)
 const timeZone = state.workspace.timeZone ?? 'America/New_York'
 const [open, setOpen] = useState<Record<string, boolean>>({})
 // On a phone the tree is an outline: drivers a plan moves start open, the rest start folded.
 const [phone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches)
 const isOpen = (d: Tree['drivers'][number]) => open[d.driver] ?? (!phone || d.leaves.some(l => (l.option !== null && l.option !== l.value) || (l.base !== null && l.base !== l.value)))
 const [changedBy, setChangedBy] = useState<{ who: string; day: string; time: string } | null>(null)
 const [cells, setCells] = useState<number | null>(null)
 const [busy, setBusy] = useState(false), [failure, setFailure] = useState('')
 const optionName = option ? shortName(option) : ''
 const baseName = baseline?.name ?? ''
 const exception = tree.exception
 const exceptionInputs = exception?.inputs ?? []
 useEffect(() => {
  setChangedBy(null)
  const input = exceptionInputs[0]
  if (!input || state.me.role !== 'finance' || !state.me.payDetail) return
  let live = true
  api(`activity?record=${encodeURIComponent(input.id)}`).then((rows: D[]) => {
   const row = rows.find(r => /-changed$/.test(r.action))
   if (live && row) setChangedBy({ who: row.actorName ?? row.actor, ...momentText(row.at, timeZone) })
  }, () => {})
  return () => { live = false }
 }, [exceptionInputs[0]?.id])
 useEffect(() => {
  setCells(null)
  if (!option) return
  let live = true
  api(`compare?a=${home.id}&b=${option.id}`).then(v => { if (live) setCells(v.changedCells.length) }, () => {})
  return () => { live = false }
 }, [option?.id, option?.revision, home.revision])
 const months: string[] = homeView.cash.filter((m: D) => m.month >= tree.from).map((m: D) => m.month as string)
 const series = (view: D | null) => view ? months.map(m => closingAt(view, m) ?? 0) : null
 // A leaf that is one input already carries its name: its change line starts at the change.
 const optionInputs = (leaf: Leaf) => { const text = optionView ? changeText(leaf.inputs, optionView.inputs.filter((i: D) => leaf.inputs.some(b => b.origin === i.origin) || (!homeView.inputs.some((h: D) => h.origin === i.origin) && i.kind === leaf.inputs[0]?.kind))) : ''; return text.startsWith(`${leaf.label}: `) ? text[leaf.label.length + 2].toUpperCase() + text.slice(leaf.label.length + 3) : text }
 const exceptionChange = exception && baseView ? changeText(baseView.inputs.filter((i: D) => exceptionInputs.some(e => e.origin === i.origin)), exceptionInputs).replace(/^[^:]+: /, '') : ''
 const moved = exception ? landing(exception, homeView, baseView, tree.month) : ''
 const submitted = options.filter(o => o.submittedAt).map(o => o.submittedAt as string).sort().at(-1)
 const proposedAt = submitted ? momentText(submitted, timeZone) : null
 const optionLeaf = tree.drivers.flatMap(d => d.leaves).find(l => l.option !== null && l.option !== l.value)
 const sticky = option && (option.summary || option.request) ? String(option.summary || option.request).split(/(?<=\.)\s/)[0] : ''
 const edges: Edge[] = tree.drivers.flatMap(d => {
  const green = d.option !== null && d.option !== d.value
  return [{ from: 'root', to: `driver:${d.driver}`, tone: green ? 'green' : 'magenta' } as Edge,
   ...(isOpen(d) ? d.leaves.map(l => ({ from: `driver:${d.driver}`, to: `leaf:${l.key}`, tone: l.option !== null && l.option !== l.value ? 'green' : 'magenta' } as Edge)) : [])]
 })
 if (exception) edges.push({ from: `leaf:${exception.key}`, to: 'exception', tone: 'magenta' })
 if (optionLeaf && sticky) edges.push({ from: `leaf:${optionLeaf.key}`, to: 'sticky', tone: 'green' })
 const pick = async () => {
  if (!option) return
  if (!window.confirm(option.kind === 'proposal' ? `Apply ${option.name} at revision ${option.revision} to ${home.name}?` : `Replace every assumption in ${home.name} (revision ${home.revision}) with ${option.name}?`)) return
  setBusy(true); setFailure('')
  try {
   if (option.kind === 'proposal') await command('proposal-promote', { id: option.id, revision: option.revision })
   else await command('scenario-adopt', { from: option.id, into: home.id, revision: home.revision })
   choose(''); await refresh()
  } catch (e) { setFailure((e as Error).message) } finally { setBusy(false) }
 }
 const compare = () => { const url = new URL(window.location.href); url.searchParams.set('compareFrom', home.id); url.searchParams.set('compareTo', option!.id); window.history.replaceState(window.history.state, '', url); go('scenarios') }
 const runway = homeView.health.runway.find((m: D) => m.month === tree.from)
 const now = momentText(new Date().toISOString(), timeZone)
 const rowOf = (leaf: Leaf | null | undefined) => leaf ? tree.drivers.findIndex(d => d.leaves.some(l => l.key === leaf.key)) : -1
 const last = tree.drivers.length - 1, exceptionRow = rowOf(exception), optionRow = sticky ? rowOf(optionLeaf) : -1
 // The decision keeps the bottom right on a desktop: a note for the last driver's leaf sits one row up when that row is free.
 const stickyRow = !phone && optionRow === last && last > 0 && exceptionRow !== last - 1 ? last - 1 : optionRow
 const decisionBelow = stickyRow === last || exceptionRow === last
 return <>
  <div className="page-head t-head">
   <h1>What drives {fullMonth(tree.month)} cash</h1>
   <Dots as="p">{monthLabel(tree.month)}<span title={home.name}>{shortName(home)} rev {home.revision}</span><span className="date-token">{now.day}, {now.time} {zoneText(timeZone)}</span></Dots>
  </div>
  <div className="t-switch" role="group" aria-label="Compare responses">
   {[home, ...options].map((s: D) => {
    const value = closingAt(s.id === home.id ? homeView : views[s.id] ?? null, tree.month)
    const selected = s.id === home.id ? !option : option?.id === s.id
    return <button key={s.id} type="button" aria-pressed={selected} title={s.name} onClick={() => choose(s.id === home.id ? '' : s.id)} className={value !== null && tree.floor !== null && value < tree.floor ? 't-below' : ''}>
     {s.id !== home.id && <img src="/brand/avatar.svg" alt="" />}
     <span className="t-switch-name">{s.id === home.id ? `${shortName(s)} rev ${s.revision}` : shortName(s)}</span>
     {value !== null && <span className="t-switch-value">{cash(value)}</span>}
    </button>
   })}
  </div>
  <div className="t-board" ref={board} style={{ gridTemplateRows: `repeat(${tree.drivers.length + (decisionBelow ? 1 : 0)}, auto)` }}>
   <TreeLinks board={board} edges={edges} />
   <div className="t-root-cell" style={{ gridRow: `1 / span ${tree.drivers.length}` }}>
    <RootCard tree={tree} months={months} forecast={series(homeView)!} option={series(optionView)} optionName={optionName} />
   </div>
   {tree.drivers.flatMap((d, i) => {
    const expanded = isOpen(d), list = `t-leaves-${d.driver}`
    const hasException = exception && d.leaves.some(l => l.key === exception.key)
    const hasSticky = i === stickyRow
    return [
     <div key={`${d.driver}-driver`} className="t-driver-cell" style={{ gridRow: i + 1 }}><DriverCard node={d} tree={tree} baseName={baseName} optionName={optionName} open={expanded} controls={list} onToggle={() => setOpen(o => ({ ...o, [d.driver]: !expanded }))} /></div>,
     <div key={`${d.driver}-leaves`} className="t-leaves" id={list} hidden={!expanded} style={{ gridRow: i + 1 }}>
      {d.leaves.map(l => <LeafCard key={l.key} leaf={l} baseName={baseName} optionName={optionName} exception={exception?.key === l.key} optionChange={optionInputs(l)} onOpen={l.inputs.length || l.department ? () => go('plan') : undefined} />)}
     </div>,
     ...(hasException || hasSticky ? [<div key={`${d.driver}-side`} className="t-side" style={{ gridRow: i + 1 }}>
      {hasException && <ExceptionCard leaf={exception!} change={exceptionChange} changedBy={changedBy} moved={moved} baseName={baseName} />}
      {hasSticky && <Sticky text={sticky} label={`${option!.name}: ${sticky}`} />}
     </div>] : []),
    ]
   })}
   <div className="t-decision-cell" style={{ gridRow: decisionBelow ? tree.drivers.length + 1 : tree.drivers.length }}>
    <Decision options={options} option={option} optionName={optionName} proposedAt={proposedAt} cells={cells} finance={state.me.role === 'finance'} busy={busy} failure={failure} pick={pick} compare={compare} />
   </div>
  </div>
  <Dots as="p" className="t-foot">
   {homeView.actualsThrough ? `Actuals through ${monthLabel(homeView.actualsThrough)}` : 'No months closed yet'}
   {runway && `runway ${runway.runwayHundredths === null ? (runway.basis === 'cash-exhausted' ? 'exhausted' : 'not burning') : `${(runway.runwayHundredths / 100).toFixed(1)} months`} in ${monthLabel(tree.from)}`}
   {tree.floor !== null && `floor ${cash(tree.floor)}${homeView.health.agreement?.by ? ` agreed ${momentText(homeView.health.agreement.at, timeZone).day}` : ''}`}
  </Dots>
 </>
}

function Decision({ options, option, optionName, proposedAt, cells, finance, busy, failure, pick, compare }: { options: D[]; option?: D; optionName: string; proposedAt: { day: string; time: string } | null; cells: number | null; finance: boolean; busy: boolean; failure: string; pick: () => void; compare: () => void }) {
 if (!options.length) return <article className="t-card t-decision" data-node="decision"><h3>No responses yet</h3><p className="muted">Proposals made from this plan, by a person or an agent working for one, appear here to compare and pick.</p></article>
 return <article className="t-card t-decision" data-node="decision">
  <h3>{options.length} {options.length === 1 ? 'response' : 'responses'} proposed {proposedAt && <span>{proposedAt.time} {proposedAt.day}</span>}</h3>
  {option ? <div className="t-actions">
   {finance && <button type="button" className="t-pick" disabled={busy || (option.kind === 'proposal' && option.proposalStatus !== 'submitted')} onClick={pick}>{busy ? 'Working…' : `Pick ${optionName}`}</button>}
   <button type="button" className="t-open" onClick={compare}>{cells === null ? 'Compare' : `${cells} ${cells === 1 ? 'cell' : 'cells'} moved`} · Open</button>
  </div> : <p className="muted">Choose a response above to see its path through the tree.</p>}
  {option && !finance && <p className="muted">Finance picks a response.</p>}
  {option?.kind === 'proposal' && option.proposalStatus !== 'submitted' && <p className="muted">This proposal is still a draft.</p>}
  {failure && <p role="alert" className="error">{failure}</p>}
 </article>
}

const fullMonth = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })

/** Where an exception's cash lands now against the baseline: "$279,000 lands in May 2027, not Jan 2027". */
function landing(leaf: Leaf, home: D, base: D | null, month: string) {
 const sources = new Set(leaf.inputs.map(i => i.origin))
 const peak = (view: D | null) => view?.drivers?.filter((r: D) => sources.has(r.source)).sort((a: D, b: D) => Math.abs(b.amount) - Math.abs(a.amount))[0]
 const now = peak(home), then = peak(base)
 if (now && then && now.month !== then.month) return `${cash(Math.abs(now.amount))} ${now.amount > 0 ? 'collected' : 'paid'} ${monthLabel(now.month)}, not ${monthLabel(then.month)}`
 return `${cash(Math.abs(leaf.value - (leaf.base ?? 0)))} ${leaf.value < (leaf.base ?? 0) ? 'less' : 'more'} cash by ${monthLabel(month)}`
}
