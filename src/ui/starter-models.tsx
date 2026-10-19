import { useState } from 'react'
import { STARTER_IDS, STARTERS, type StarterId } from '../easel/starter-catalog'
import { command, Field, Form } from './shared'

export function SetupPlan({ refresh }: { refresh: () => Promise<void> }) {
 const [selected, setSelected] = useState<StarterId | 'blank'>('blank')
 const now = new Date(), year = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
 const starter = selected === 'blank' ? null : STARTERS[selected]
 return <section className="card solo setup-plan">
  <h2 className="lead">Set up your plan</h2>
  <p className="muted">Easel plans one company in one reporting currency. Start with editable assumptions for your business, or create a blank plan.</p>
  <label>Starting model<select aria-label="Starting model" value={selected} onChange={e => setSelected(e.target.value as StarterId | 'blank')}>
   <option value="blank">Blank plan</option>
   {STARTER_IDS.map(id => <option key={id} value={id}>{STARTERS[id].name}</option>)}
  </select></label>
  {starter && <div className="note">
   <p><strong>{starter.name} · USD · January fiscal year</strong></p>
   <p>{starter.description}</p>
   <p><strong>Starter assumptions:</strong> {starter.assumptions}</p>
   <p><strong>Cash timing:</strong> {starter.cashTiming}</p>
   <p className="muted">These are editable estimates, not imported business actuals. Review revenue, positions and costs under Plan; departments and lines under Settings. A leadership dashboard and three statements are ready when you create the plan.</p>
  </div>}
  <Form className="form form-rows" submit="Create the plan" onSubmit={async v => {
   if (selected === 'blank') await command('workspace', { name: v.name, currency: v.currency, fiscalYearStart: Number(v.fiscalYearStart), planStart: v.planStart })
   else await command('starter-model', { name: v.name, starter: selected, planStart: v.planStart, openingCash: v.openingCash })
   await refresh()
  }}>
   <Field label="Company name" name="name" />
   {!starter && <>
    <Field label="Reporting currency" name="currency" defaultValue="AUD" hint="One currency; Easel does no currency conversion." />
    <Field label="Fiscal year starts in month" name="fiscalYearStart" defaultValue="7" options={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => ({ value: String(i + 1), label: m }))} />
   </>}
   <Field key={`month-${starter ? 'january' : 'blank'}`} label="First plan month" name="planStart" type="month" defaultValue={starter ? `${now.getUTCFullYear()}-01` : `${year}-07`} hint={starter ? 'Choose January of the year you are budgeting. Starter models use USD.' : 'The first month of the fiscal year you are budgeting.'} />
   {starter && <Field key={`cash-${selected}`} label="Opening cash (USD)" name="openingCash" defaultValue={starter.openingCash} hint="An editable estimate at the start of January. Review cash timing under Plan → Opening cash." />}
  </Form>
 </section>
}
