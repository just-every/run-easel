import type { Shared } from './app'
import { Action, command, Field, Form, Table, type D } from './shared'
import { Dots } from './dots'

export function Sandboxes({ state, refresh }: Shared) {
 const me = state.me
 const mine = state.scenarios.filter((sc: D) => sc.sandbox && sc.createdBy === me.email)
 const plans = state.scenarios.filter((sc: D) => sc.kind !== 'proposal')
 const run = async (op: string, body: D) => { await command(op, body); await refresh() }
 return <section className="card">
  <h2>Private sandboxes</h2>
  <p className="muted">A sandbox is visible only to its creator and named people. Sharing keeps each person's department and compensation limits. A read share permits comparison and download. Only planners can receive an edit share.</p>
  {me.role !== 'viewer' && <Form submit="Create private sandbox" onSubmit={v => run('sandbox-create', v)}>
   <Field label="Sandbox source" name="from" options={plans.map((sc: D) => ({ value: sc.id, label: sc.name }))} />
   <Field label="Sandbox name" name="name" />
  </Form>}
  {mine.map((sc: D) => <article key={sc.id} aria-label={`Sandbox ${sc.name}`}>
   <h3>{sc.name}</h3>
   <Dots as="p">Private{`revision ${sc.revision}. Submit a copy to finance for approval; the sandbox stays private.`}</Dots>
   <Table caption={`Sharing for ${sc.name}`} heads={['Person', 'Access', '']}>
    {Object.entries(sc.sandbox.grants).map(([email, mode]) => <tr key={email}><td>{email}</td><td>{String(mode)}</td><td><Action label={`Remove ${email}`} kind="quiet" run={() => run('scenario-share', { scenario: sc.id, revision: sc.revision, email, mode: 'remove' })} /></td></tr>)}
   </Table>
   <Form submit="Save sharing" onSubmit={v => run('scenario-share', { ...v, scenario: sc.id, revision: sc.revision })}>
    <Field label={`Share ${sc.name} with email`} name="email" type="email" />
    <Field label={`Access to ${sc.name}`} name="mode" options={[{ value: 'read', label: 'Read' }, { value: 'edit', label: 'Edit' }]} />
   </Form>
   <Form submit="Submit sandbox to finance" onSubmit={v => run('sandbox-submit', { ...v, scenario: sc.id, revision: sc.revision, targetRevision: state.scenarios.find((s: D) => s.id === v.into)?.revision })}>
    <Field label={`Submit ${sc.name} into`} name="into" defaultValue={sc.branchedFrom?.scenario} options={plans.filter((s: D) => !s.sandbox && s.status === 'working').map((s: D) => ({ value: s.id, label: s.name }))} />
    <Field label={`Request for ${sc.name}`} name="request" type="textarea" />
   </Form>
  </article>)}
 </section>
}

export function OfficialCases({ state, refresh }: Shared) {
 if (state.me.role !== 'finance') return null
 return <section className="card">
  <h2>Official cases</h2>
  <p className="muted">Designations identify company-visible cases without approving or changing their numbers.</p>
  <Form submit="Set official case" onSubmit={async v => { const sc = state.scenarios.find((s: D) => s.id === v.scenario); await command('scenario-official', { ...v, revision: sc.revision }); await refresh() }}>
   <Field label="Official scenario" name="scenario" options={state.scenarios.filter((sc: D) => !sc.sandbox && sc.kind !== 'proposal').map((sc: D) => ({ value: sc.id, label: sc.name }))} />
   <Field label="Designation" name="official" options={[{ value: 'budget', label: 'Official budget' }, { value: 'forecast', label: 'Official forecast' }, { value: 'board-case', label: 'Official board case' }, { value: '', label: 'No designation' }]} />
  </Form>
 </section>
}
