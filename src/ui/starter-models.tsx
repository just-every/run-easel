import { useState } from 'react'
import { STARTER_IDS, STARTERS, type StarterId } from '../easel/starter-catalog'
import { command, Field, Form, US_TIME_ZONES, ENGLISH_LOCALES, DATE_FORMATS } from './shared'
import { Dots } from './dots'

export function SetupPlan({ refresh }: { refresh: () => Promise<void> }) {
 const [selected, setSelected] = useState<StarterId | 'blank'>('blank')
 const now = new Date()
 const starter = selected === 'blank' ? null : STARTERS[selected]
 return <section className="card solo setup-plan">
  <h2 className="lead">Set up your plan</h2>
  <p className="muted">Easel plans one company in one reporting currency. Start with editable assumptions for your business, or create a blank plan.</p>
  <label>Starting model<select aria-label="Starting model" value={selected} onChange={e => setSelected(e.target.value as StarterId | 'blank')}>
   <option value="blank">Blank plan</option>
   {STARTER_IDS.map(id => <option key={id} value={id}>{STARTERS[id].name}</option>)}
  </select></label>
  {starter && <div className="note">
   <Dots as="p" className="starter-name">{starter.name}USD{'January fiscal year'}</Dots>
   <p>{starter.description}</p>
   <p><strong>Starter assumptions:</strong> {starter.assumptions}</p>
   <p><strong>Cash timing:</strong> {starter.cashTiming}</p>
   <p className="muted">These are editable estimates, not imported business actuals. Review revenue, positions and costs under Plan; departments and lines under Settings. A leadership dashboard and three statements are ready when you create the plan.</p>
  </div>}
  <Form className="form form-rows" submit="Create the plan" onSubmit={async v => {
   if (selected === 'blank') await command('workspace', { name: v.name, currency: v.currency, timeZone: v.timeZone, locale: v.locale, dateFormat: v.dateFormat, fiscalYearStart: Number(v.fiscalYearStart), planStart: v.planStart })
   else await command('starter-model', { name: v.name, starter: selected, timeZone: v.timeZone, locale: v.locale, dateFormat: v.dateFormat, planStart: v.planStart, openingCash: v.openingCash })
   await refresh()
  }}>
   <Field label="Company name" name="name" />
   {!starter && <>
    <Field label="Reporting currency" name="currency" defaultValue="USD" hint="One currency; Easel does no currency conversion." />
    <Field label="Fiscal year starts in month" name="fiscalYearStart" defaultValue="1" options={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => ({ value: String(i + 1), label: m }))} />
   </>}
   <Field label="Language and region" name="locale" defaultValue="en-US" options={ENGLISH_LOCALES} />
   <Field label="Date display" name="dateFormat" defaultValue="MM/DD/YYYY" options={DATE_FORMATS} />
   <Field label="Company time zone" name="timeZone" defaultValue="America/New_York" options={US_TIME_ZONES} hint="Schedules use local wall time, including daylight saving time." />
   <Field key={`month-${starter ? 'january' : 'blank'}`} label="First plan month" name="planStart" type="month" defaultValue={`${now.getUTCFullYear()}-01`} hint={starter ? 'Choose January of the year you are budgeting. Starter models use USD.' : 'The first month of the fiscal year you are budgeting.'} />
   {starter && <Field key={`cash-${selected}`} label="Opening cash (USD)" name="openingCash" defaultValue={starter.openingCash} hint="An editable estimate at the start of January. Review cash timing under Plan → Opening cash." />}
  </Form>
 </section>
}
