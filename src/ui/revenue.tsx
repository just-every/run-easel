import { useState } from 'react'
import { decimalText, Field, Form, money, type D, type Option } from './shared'

export const revenueForms = [
 ['customers', 'Customers × revenue per customer'], ['volume', 'Volume × rate'],
 ['seats', 'Seats × price with expansion'], ['usage', 'Usage × unit price'],
 ['services', 'Billable headcount × utilization × rate'], ['milestones', 'Project milestones'], ['backlog', 'Backlog burn-down'],
] as const

export function RevenueSummary({ row: r, currency }: { row: D; currency: string }) {
 if (r.kind === 'volume') return <>{decimalText(r.startVolume)} units × {money(r.rateCents, currency)}, {decimalText(r.growthBps)}% a month</>
 if (r.kind === 'customers') return <>{decimalText(r.startCustomers)} customers × {money(r.arpaCents, currency)}, churn {decimalText(r.churnBps)}%</>
 if (r.kind === 'seats') return <>{decimalText(r.startSeats)} seats × {money(r.priceCents, currency)} a month, expansion {decimalText(r.expansionBps)}%</>
 if (r.kind === 'usage') return <>{decimalText(r.startUsage)} usage units × {money(r.unitPriceCents, currency)}, growth {decimalText(r.growthBps)}%</>
 if (r.kind === 'services') return <>Active department positions × {decimalText(r.monthlyHours)} hours × {decimalText(r.utilizationBps)}% × {money(r.hourlyRateCents, currency)}/hour</>
 if (r.kind === 'milestones') return <>{r.milestones.length} named project milestones</>
 return <>Opening backlog {money(r.openingBacklogCents, currency)}, additions {money(r.monthlyAdditionsCents, currency)}/month, recognition {decimalText(r.burnBps)}%</>
}

export function RevenueForm({ row, lines, depts, allDepts, onSave }: { row: D | null; lines: Option[]; depts: Option[]; allDepts: Option[]; onSave: (b: D) => Promise<void> }) {
 const [kind, setKind] = useState(row?.kind ?? 'customers')
 const [milestoneCount, setMilestoneCount] = useState(row?.milestones?.length ?? 1)
 const value = (key: string, fallback?: string) => row?.[key] === undefined ? fallback : decimalText(row[key])
 return <Form submit={row ? 'Save revenue model' : 'Add revenue model'} onSubmit={v => {
  const milestones = kind === 'milestones' ? Array.from({ length: milestoneCount }, (_, i) => ({ name: v[`milestoneName${i}`], month: v[`milestoneMonth${i}`], amount: v[`milestoneAmount${i}`] })) : undefined
  return onSave({ ...v, id: row?.id, kind, ...(milestones ? { milestones } : {}) })
 }}>
  <label className="wide-select">Driver<select aria-label="Driver" value={kind} onChange={e => setKind(e.target.value)}>{revenueForms.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
  <Field label="Revenue model name" name="name" defaultValue={row?.name} />
  <Field label="Revenue line" name="line" options={lines} defaultValue={row?.line} />
  <Field label="Department" name="department" options={depts} defaultValue={row?.department} />
  <Field label="Start month" name="start" type="month" defaultValue={row?.start} />
  <Field label="Collected after (months)" name="collectionLag" options={[0, 1, 2, 3].map(n => ({ value: String(n), label: String(n) }))} defaultValue={String(row?.collectionLag ?? 1)} />
  {kind === 'volume' && <>
   <Field label="Starting volume" name="startVolume" defaultValue={value('startVolume')} />
   <Field label="Monthly growth %" name="growthPercent" defaultValue={value('growthBps', '0')} />
   <Field label="Rate per unit" name="rate" defaultValue={value('rateCents')} />
  </>}
  {kind === 'customers' && <>
   <Field label="Starting customers" name="startCustomers" defaultValue={value('startCustomers')} />
   <Field label="New customers per month" name="newPerMonth" defaultValue={value('newPerMonth', '0')} />
   <Field label="New customers per ramped hire" name="newPerRep" defaultValue={value('newPerRep', '0')} />
   <Field label="Hiring department" name="repDepartment" required={false} options={allDepts} defaultValue={row?.repDepartment} />
   <Field label="Ramp months" name="rampMonths" defaultValue={String(row?.rampMonths ?? 3)} />
   <Field label="Monthly churn %" name="churnPercent" defaultValue={value('churnBps', '0')} />
   <Field label="Monthly revenue per customer" name="arpa" defaultValue={value('arpaCents')} />
  </>}
  {kind === 'seats' && <>
   <Field label="Starting seats" name="startSeats" defaultValue={value('startSeats')} />
   <Field label="Monthly seat expansion %" name="expansionPercent" defaultValue={value('expansionBps', '0')} hint="Starting seats apply in the first month; expansion compounds from the next month, rounded to hundredths of a seat." />
   <Field label="Monthly price per seat" name="price" defaultValue={value('priceCents')} />
  </>}
  {kind === 'usage' && <>
   <Field label="Starting monthly usage" name="startUsage" defaultValue={value('startUsage')} />
   <Field label="Monthly usage growth %" name="growthPercent" defaultValue={value('growthBps', '0')} hint="Starting usage applies in the first month; growth starts next month. Minimum -100%." />
   <Field label="Price per usage unit" name="unitPrice" defaultValue={value('unitPriceCents')} />
  </>}
  {kind === 'services' && <>
   <p className="muted wide">All active positions in this department are assumed billable, including planned hires. Set available hours and utilization for that team; salary is never used to calculate revenue.</p>
   <Field label="Monthly available hours per position" name="monthlyHours" defaultValue={value('monthlyHours', '160')} />
   <Field label="Billable utilization %" name="utilizationPercent" defaultValue={value('utilizationBps', '75')} />
   <Field label="Billable hourly rate" name="hourlyRate" defaultValue={value('hourlyRateCents')} />
  </>}
  {kind === 'milestones' && <>
   <p className="muted wide">Recognize each named milestone in its planned month. Collection follows the timing above. Milestones cannot precede the start month.</p>
   {Array.from({ length: milestoneCount }, (_, i) => <div className="row wide" key={i}>
    <Field label={`Milestone ${i + 1} name`} name={`milestoneName${i}`} defaultValue={row?.milestones?.[i]?.name} />
    <Field label={`Milestone ${i + 1} month`} name={`milestoneMonth${i}`} type="month" defaultValue={row?.milestones?.[i]?.month} />
    <Field label={`Milestone ${i + 1} amount`} name={`milestoneAmount${i}`} defaultValue={decimalText(row?.milestones?.[i]?.amountCents)} />
   </div>)}
   <div className="row wide"><button type="button" disabled={milestoneCount >= 200} onClick={() => setMilestoneCount((n: number) => n + 1)}>Add milestone</button>{milestoneCount > 1 && <button type="button" onClick={() => setMilestoneCount((n: number) => n - 1)}>Remove last milestone</button>}</div>
  </>}
  {kind === 'backlog' && <>
   <Field label="Opening backlog" name="openingBacklog" defaultValue={value('openingBacklogCents')} />
   <Field label="Monthly backlog additions" name="monthlyAdditions" defaultValue={value('monthlyAdditionsCents', '0')} />
   <Field label="Monthly backlog recognition %" name="burnPercent" defaultValue={value('burnBps')} hint="Each month recognizes this percentage of opening backlog plus that month's additions, capped at the available backlog. Additions are bookings, not extra revenue." />
  </>}
 </Form>
}
