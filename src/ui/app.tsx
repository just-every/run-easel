import { useCallback, useEffect, useState } from 'react'
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
import { addMonths, api, type D } from './shared'
import { SetupPlan } from './starter-models'

const TABS = [
 { id: 'overview', label: 'Overview', roles: ['finance', 'contributor', 'viewer'] },
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
 const [tab, setTab] = useState(() => typeof window !== 'undefined' && new URL(window.location.href).searchParams.has('departmentStatement') ? 'review' : 'overview')
 const refresh = useCallback(async () => { try { setState(await api('state')); setError('') } catch (e) { setError((e as Error).message) } }, [])
 useEffect(() => { void refresh() }, [refresh])
 useEffect(() => {
  const reveal = () => { const selected = strip.ref.current?.querySelector<HTMLElement>('[aria-current]'); if (selected) revealHorizontally(selected); strip.update() }
  reveal(); window.addEventListener('resize', reveal); return () => window.removeEventListener('resize', reveal)
 }, [tab, state, strip.update])
 if (!state) return <main className="shell"><p className="status" role={error ? 'alert' : 'status'}>{error || 'Loading the plan…'}</p></main>
 const role = state.me.role
 const person = `${state.me.name} · ${role ?? 'no access yet'}${state.me.departments?.length ? ` · ${state.me.departments.map((d: string) => state.departments?.find((x: D) => x.id === d)?.name).join(', ')}` : ''}`
 const header = <header className="top"><div className="brand"><img src="/brand/mark.svg" alt="" />{state.workspace ? <><span className="wordmark" data-rer-name>Easel</span><h1 className="company">{state.workspace.name}</h1></> : <h1 className="wordmark" data-rer-name>Easel</h1>}</div><p className="who"><span className="who-person">{person}</span><span className="who-role">{role ?? 'no access yet'}</span></p></header>
 if (!role) return <main className="shell">{header}<section className="card solo"><h2 className="lead">Waiting for finance</h2><p className="muted">You are signed in, but finance has not added you to this plan yet. Ask them to add you under Settings → People.</p><EmptyYear start={state.workspace?.planStart} /></section></main>
 if (!state.workspace) return <main className="shell">{header}{role === 'finance' ? <SetupPlan refresh={refresh} /> : <section className="card solo"><h2 className="lead">Finance is still setting up the plan.</h2><EmptyYear /></section>}</main>
 const shared: Shared = { state, refresh, go: setTab }
 const tabs = TABS.filter(t => t.roles.includes(role))
 return <main className="shell">
  {header}
  <div className="scroll-frame tab-frame" data-before={strip.edges.before} data-after={strip.edges.after}><nav ref={strip.ref as any} className="tabs" aria-label="Easel" onFocusCapture={e => revealHorizontally(e.target as HTMLElement)}>{tabs.map(t => <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>)}</nav>{strip.edges.before && <span className="scroll-cue scroll-cue-before" aria-hidden="true">←</span>}{strip.edges.after && <span className="scroll-cue" aria-hidden="true">→</span>}</div>
  {error && <p role="alert" className="error">{error}</p>}
  {tab === 'overview' && <Overview {...shared} />}
  {tab === 'dashboards' && <Dashboards {...shared} />}
  {tab === 'plan' && <Plan {...shared} />}
  {tab === 'actuals' && <Actuals {...shared} />}
  {tab === 'cycle' && <Cycle {...shared} />}
  {tab === 'scenarios' && <Scenarios {...shared} />}
  {tab === 'review' && <Review {...shared} />}
  {tab === 'settings' && <Settings {...shared} />}
  {tab === 'activity' && <Activity state={state} />}
 </main>
}

/** The empty graph-paper year behind a waiting state: decoration only. */
function EmptyYear({ start }: { start?: string }) {
 const now = new Date(), year = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
 const first = start ?? `${year}-07`
 return <div className="empty-year"><ClosingCashChart decorative ticks label="" months={Array.from({ length: 12 }, (_, i) => addMonths(first, i))} series={[]} /></div>
}
