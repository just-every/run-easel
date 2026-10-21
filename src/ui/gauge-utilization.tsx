import { useEffect, useRef, useState } from 'react'
import { Action, api, Field, Form, money, monthLabel, options, Table, type D } from './shared'
import { Dots } from './dots'

type Props = { scenario: string; revision: number; drivers: D[]; currency: string; onChange: () => Promise<void> }

/** Preview and accept one month's operational actuals, retaining the server's exact fingerprint. */
export function GaugeUtilization({ scenario, revision, drivers, currency, onChange }: Props) {
 const [connection, setConnection] = useState<D | null>(null)
 const [error, setError] = useState('')
 const [preview, setPreview] = useState<D | null>(null)
 const request = useRef(0)
 useEffect(() => {
  let active = true
  void api('connections/gauge').then(value => { if (active) setConnection(value) }, e => { if (active) setError((e as Error).message) })
  return () => { active = false; request.current++ }
 }, [])
 const invalidate = () => { request.current++; setPreview(null) }
 return <section className="card">
  <h2>Gauge utilization actuals</h2>
  <p className="muted">Apply approved billable seconds at the planned hourly rate as operational actuals for one services driver and month. These are not ledger revenue. Other months' assumptions stay unchanged.</p>
  <p className="notice">Gauge provides the entire agency's aggregate for the chosen month, with no department or services filter. The selected driver receives that whole aggregate. Each month can be attached to only one driver in this scenario. Easel uses the driver's planned hourly rate in {currency}; Gauge supplies no monetary amounts.</p>
  {error && <p role="alert" className="error">{error}</p>}
  {!connection && !error && <p role="status">Loading Gauge connection…</p>}
  {connection && !connection.connected && <p className="notice">Connect Gauge under Settings → Connections to preview utilization. Previously accepted data remains available below.</p>}
  {!drivers.length && <p>Add a services revenue driver to import Gauge utilization.</p>}
  {connection?.connected && drivers.length > 0 && <div onChange={invalidate}>
   <Form submit="Preview Gauge utilization" onSubmit={async v => {
    const mine = ++request.current
    setPreview(null)
    const value = await api('gauge/preview', { scenario, driver: v.driver, month: v.month, scenarioRevision: revision })
    if (mine === request.current) setPreview(value)
   }}>
    <Field label="Services driver" name="driver" options={options(drivers)} />
    <Field label="Utilization month" name="month" type="month" />
   </Form>
  </div>}
  {preview && <>
   <h3>Review {monthLabel(preview.month)}</h3>
   <Dots as="p">{drivers.find(d => d.id === preview.driver)?.name}{`scenario revision ${preview.scenarioRevision}`}</Dots>
   <Table caption="Gauge utilization preview" heads={['Measure', 'Value']}>
    <tr><td>Participants</td><td>{preview.source.participantCount}</td></tr>
    <tr><td>Available seconds</td><td>{preview.source.availableSeconds}</td></tr>
    <tr><td>Approved billable seconds</td><td>{preview.source.approvedBillableSeconds}</td></tr>
    <tr><td>Inclusive source dates</td><td>{preview.source.from} through {preview.source.to}</td></tr>
    {preview.source.asOf && <tr><td>Source as of</td><td>{preview.source.asOf}</td></tr>}
    <tr><td>Planned hourly rate</td><td>{money(drivers.find(d => d.id === preview.driver)?.hourlyRateCents, currency)}</td></tr>
    <tr><td>Operational actuals amount</td><td>{money(preview.amountCents, preview.currency)}</td></tr>
    <tr><td>Source digest</td><td style={{ overflowWrap: 'anywhere' }}>{preview.digest}</td></tr>
   </Table>
   <Action label="Accept Gauge utilization" run={async () => {
    await api('gauge/accept', { scenario: preview.scenario, driver: preview.driver, month: preview.month, scenarioRevision: preview.scenarioRevision, digest: preview.digest })
    invalidate(); await onChange()
   }} />
  </>}
  {drivers.map(row => <div key={row.id}>
   {Object.keys(row.gaugeActuals ?? {}).length > 0 && <Table caption={`Accepted Gauge utilization · ${row.name}`} heads={['Month', 'Participants', 'Available seconds', 'Approved billable seconds', 'Source digest']}>
    {Object.entries(row.gaugeActuals ?? {}).map(([month, value]) => {
     const actual = value as D
     return <tr key={month}><td>{monthLabel(month)}</td><td>{actual.source.participantCount}</td><td>{actual.source.availableSeconds}</td><td>{actual.source.approvedBillableSeconds}</td><td style={{ overflowWrap: 'anywhere' }}>{actual.digest}</td></tr>
    })}
   </Table>}
   {row.gaugeUndo?.resultingRevision === revision && <Action label={`Undo latest Gauge import · ${row.name}`} kind="quiet" run={async () => {
    await api('gauge/undo', { scenario, driver: row.id, scenarioRevision: revision }); invalidate(); await onChange()
   }} />}
  </div>)}
  <p className="muted">Accepted data stays after disconnecting. Approved budgets and kept forecasts retain the data captured in their frozen versions.</p>
 </section>
}
