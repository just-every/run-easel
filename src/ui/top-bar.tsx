import type { ReactNode } from 'react'
import { monthLabel, type D } from './shared'
import { Dots, glue } from './dots'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?'
const forecastOf = (state: D) => state.scenarios?.find((s: D) => s.kind === 'forecast' && !s.alternativeBudget && s.status === 'working')

/** One white bar on every screen: the mark and wordmark, the tabs, the company and how fresh its actuals are, and who is signed in. */
export function TopBar({ state, nav }: { state: D; nav?: ReactNode }) {
 const role = state.me.role ?? 'no access yet'
 const departments = state.me.departments?.map((d: string) => state.departments?.find((x: D) => x.id === d)?.name).filter(Boolean).join(', ')
 const person = `${state.me.name} · ${role}${departments ? ` · ${departments}` : ''}`
 const actuals = forecastOf(state)?.actualsThrough
 return <header className="top">
  <div className="brand"><img src="/brand/mark.svg" alt="" />{state.workspace ? <span className="wordmark" data-rer-name>Easel</span> : <h1 className="wordmark" data-rer-name>Easel</h1>}</div>
  {nav}
  <div className="meta">
   {state.workspace && <span className="company">{state.workspace.name}</span>}
   {actuals && <span className="fresh">Actuals {monthLabel(actuals)} <span className="ok" aria-label="closed">✓</span></span>}
   <span className="avatar-chip" title={person} role="img" aria-label={`Signed in as ${person}`}>{initials(state.me.name ?? '')}</span>
  </div>
 </header>
}

/** The heavy heading on every screen but the cash tree: the company, and the plan it is reading. */
export function PageHead({ state }: { state: D }) {
 const forecast = forecastOf(state)
 return <div className="page-head">
  <h1>{state.workspace.name}</h1>
  {forecast && <Dots as="p">{glue(forecast.name)}{`rev ${forecast.revision}`}{forecast.actualsThrough && `actuals through ${monthLabel(forecast.actualsThrough)}`}</Dots>}
 </div>
}
