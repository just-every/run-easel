import { decimalText, Field, type D } from './shared'

/** The region changes presentation; saved planning assumptions retain their values. */
export function PositionPayrollFields({ row, us }: { row: D | null; us: boolean }) {
 return <>
  <Field label={us ? '401(k) employer match estimate %' : 'Employer contribution estimate %'} name="retirementMatchPercent" defaultValue={decimalText(row?.retirementMatchBps ?? 0)} hint="Salary or hourly wages only, excluding commission. No eligibility, employee deferral or statutory-limit calculation." />
  <Field label="Employment type" name="employmentType" options={[{ value: 'W-2', label: us ? 'W-2 employee' : 'Employee' }, { value: '1099', label: us ? '1099 contractor' : 'Contractor' }]} defaultValue={row?.employmentType ?? 'W-2'} />
  {us ? <Field label="Prior year-to-date taxable wages" name="taxYtdWages" required={false} defaultValue={row?.taxYtdWagesCents === undefined ? '' : decimalText(row.taxYtdWagesCents)} hint="Before the first plan month; required for a continuing W-2 position when tax estimates start midyear" /> : <input type="hidden" name="taxYtdWages" value={row?.taxYtdWagesCents === undefined ? '' : decimalText(row.taxYtdWagesCents)} />}
 </>
}
