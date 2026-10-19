import { useState } from 'react'
import { command, Field, Form, type D } from './shared'

/** The displayed source revision is the revision sent to the freeze command. */
export function SaveReforecast({ scenarios, refresh }: { scenarios: D[]; refresh: () => Promise<unknown> }) {
 const sources = scenarios.filter(s => s.status === 'working' && (s.kind === 'forecast' || s.kind === 'scenario'))
 const [saved, setSaved] = useState('')
 if (!sources.length) return null
 return <>
  <h3>Save reforecast</h3>
  <p className="muted">Keep a named, frozen copy of a working forecast or scenario at its exact revision. Branch the saved version to change it.</p>
  <Form key={sources.map(s => `${s.id}:${s.revision}`).join('|')} submit="Save reforecast" onSubmit={async (values, form) => {
   setSaved('')
   const source = sources.find(s => s.id === values.from)
   if (!source) throw new Error('Choose a working forecast or scenario.')
   await command('reforecast-save', { from: source.id, revision: source.revision, name: values.name })
   setSaved(`${String(values.name).trim()} saved from ${source.name} at revision ${source.revision}. This reforecast is frozen.`)
   form.reset()
   await refresh()
  }}>
   <Field label="Reforecast from" name="from" options={sources.map(s => ({ value: s.id, label: `${s.name} (revision ${s.revision})` }))} />
   <Field label="Reforecast name" name="name" />
  </Form>
  {saved && <p role="status">{saved}</p>}
 </>
}
