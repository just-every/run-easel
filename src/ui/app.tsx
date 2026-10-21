import { CalculationState } from './calculation-state'
import { SavedReports } from './saved-reports'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Dashboards } from './dashboards'
import { Activity } from './activity'
import { Actuals } from './actuals'
import { Cycle } from './cycle'
import { Overview } from './overview'
import { Plan } from './plan'
import { Review } from './review'
import { Scenarios } from './scenarios'
import { Settings } from './settings'
import { useScrollEdges, revealHorizontally } from './scroll'
import { ClosingCashChart } from './chart'
import { DateFormatContext, addMonths, api, type D } from './shared'
import { SetupPlan } from './starter-models'
import { CashDrivers } from './tree/cash-drivers'
import { TopBar, PageHead } from './top-bar'

const TABS = [
 { id: 'cash', label: 'Cash', roles: ['finance', 'contributor', 'viewer'] },
 { id: 'overview', label: 'Overview', roles: ['finance', 'contributor', 'viewer'] },
 { id: 'reports', label: 'Reports', roles: ['finance', 'contributor', 'viewer'] },
 { id: 'dashboards', label: 'Dashboards', roles: ['finance', 'contributor', 'viewer'] },
 { id: 'plan', label: 'Plan', roles: ['finance', 'contributor'] },
 { id: 'actuals', label: 'Actuals', roles: ['finance'] },
 { id: 'cycle', label: 'Budget cycle', roles: ['finance', 'contributor', 'viewer'] },
 { id: 'scenarios', label: 'Scenarios', roles: ['finance', 'contributor', 'viewer'] },
 { id: 'review', label: 'Review', roles: ['finance', 'contributor', 'viewer'] },
 { id: 'settings', label: 'Settings', roles: ['finance'] },
 { id: 'activity', label: 'Activity', roles: ['finance'] },
]

export type Shared = { state: D; refresh: () => Promise<void>; go: (tab: string) => void }

export function App() {
 const strip = useScrollEdges()
 const [state, setState] = useState<D | null>(null)
 const [error, setError] = useState('')
 const [calculation, setCalculation] = useState<D | null>(null)
 const [tab, setTab] = useState(() => {
  // The server renders the loading state with no URL; the tab is read once the browser has one.
  if (typeof window === 'undefined') return 'cash'
  const params = new URL(window.location.href).searchParams
  return params.has('departmentStatement') ? 'review' : params.has('calendar') ? 'cycle' : TABS.find(t => t.id === params.get('tab'))?.id ?? 'cash'
 })
 const refresh = useCallback(async () => { try { setState(await api('state')); setError('') } catch (e) { setError((e as Error).message) } }, [])
 useEffect(() => { void refresh() }, [refresh])
 useEffect(() => {
  const progress = (event: Event) => { const job = (event as CustomEvent).detail; setCalculation(job.status === 'completed' ? null : job); if (job.status === 'completed') void refresh() }
  window.addEventListener('easel-calculation', progress)
  return () => window.removeEventListener('easel-calculation', progress)
 }, [refresh])
 useEffect(() => {
  const reveal = () => { const selected = strip.ref.current?.querySelector<HTMLElement>('[aria-current]'); if (selected) revealHorizontally(selected); strip.update() }
  reveal(); window.addEventListener('resize', reveal); return () => window.removeEventListener('resize', reveal)
 }, [tab, state, strip.update])
 if (!state) return <main className="shell"><p className="status" role={error ? 'alert' : 'status'}>{error || 'Loading the plan…'}</p></main>
 const role = state.me.role
 const header = (nav?: ReactNode) => <TopBar state={state} nav={nav} />
 if (!role) return <main className="shell">{header()}<section className="card solo"><h2 className="lead">Waiting for finance</h2><p className="muted">You are signed in, but finance has not added you to this plan yet. Ask them to add you under Settings → People.</p><EmptyYear start={state.workspace?.planStart} /></section></main>
 if (!state.workspace) return <main className="shell">{header()}{role === 'finance' ? <SetupPlan refresh={refresh} /> : <section className="card solo"><h2 className="lead">Finance is still setting up the plan.</h2><EmptyYear /></section>}</main>
 const shared: Shared = { state, refresh, go: setTab }
 const tabs = TABS.filter(t => t.roles.includes(role))
 return <DateFormatContext.Provider value={state.workspace.dateFormat ?? 'MM/DD/YYYY'}><main className="shell" lang={state.workspace.locale ?? 'en-US'}>
  {header(<div className="scroll-frame tab-frame" data-before={strip.edges.before} data-after={strip.edges.after}><nav ref={strip.ref as any} className="tabs" aria-label="Easel" onFocusCapture={e => revealHorizontally(e.target as HTMLElement)}>{tabs.map(t => <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>)}</nav>{strip.edges.before && <span className="scroll-cue scroll-cue-before" aria-hidden="true" />}{strip.edges.after && <span className="scroll-cue" aria-hidden="true" />}</div>)}
  {state.workspace.calendar && state.workspace.calendar !== 'calendar-month' && <p className="note">{state.workspace.calendar} retail calendar. YYYY-MM inputs and headings are consecutive accounting-period keys, not Gregorian months. See Overview → Fiscal summaries → Accounting periods for dates.</p>}
  {tab !== 'cash' && <PageHead state={state} />}
  {error && <p role="alert" className="error">{error}</p>}
  {calculation && <CalculationState state={state} job={calculation} reload={async () => { setCalculation(null); await refresh() }} />}
  {!calculation && <>
  {tab === 'cash' && <CashDrivers {...shared} />}
  {tab === 'overview' && <Overview {...shared} />}
  {tab === 'reports' && <SavedReports {...shared} />}
  {tab === 'dashboards' && <Dashboards {...shared} />}
  {tab === 'plan' && <Plan {...shared} />}
  {tab === 'actuals' && <Actuals {...shared} />}
  {tab === 'cycle' && <Cycle {...shared} />}
  {tab === 'scenarios' && <Scenarios {...shared} />}
  {tab === 'review' && <Review {...shared} />}
  {tab === 'settings' && <Settings {...shared} />}
  {tab === 'activity' && <Activity state={state} />}
  </>}
 </main></DateFormatContext.Provider>
}

/** The empty graph-paper year behind a waiting state: decoration only. */
function EmptyYear({ start }: { start?: string }) {
 const now = new Date(), year = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
 const first = start ?? `${year}-07`
 return <div className="empty-year"><ClosingCashChart decorative ticks label="" months={Array.from({ length: 12 }, (_, i) => addMonths(first, i))} series={[]} /></div>
}
