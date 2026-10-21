// US tax estimates are explicit scenario assumptions, never filings.
import { periodForKey, type CalendarWorkspace } from './fiscal-calendar'
import { cents, percentBps } from './units'
import { all, choice, get, integer, requireThat, text, type Data, type State } from './types'
export const US_TAX_DEFAULTS = { year:2026, socialSecurityPercent:'6.2',socialSecurityBase:'184500',medicarePercent:'1.45',futaPercent:'6',futaBase:'7000',federalIncomePercent:'21',lossOffsetPercent:'80' }
export function taxInput(s:State,b:Data,scenario:string):Data {
 const line=get(s,'line',b.line,'income tax expense line')
 requireThat(line.type==='operating-expense'&&!line.payroll&&!line.nonCash,'Income tax needs a cash, non-payroll operating expense line')
 const other=all(s,'tax-policy').filter(p=>p.scenario===scenario&&p.originId!==b.originId)
 requireThat(!other.length,'A scenario has one tax policy; edit its existing policy',409)
 const settings:Data={ name:text(b.name??'US tax estimates','Tax policy name'),line:line.id,department:get(s,'department',b.department).id,year:integer(b.year??2026,'Effective assumption year',1900,2200),openingLossCents:cents(b.openingLoss??'0','Opening loss carryforward'),salesTaxRemitLagMonths:integer(b.salesTaxRemitLagMonths??1,'Sales tax remittance lag',0,12) }
 for(const field of ['socialSecurity','medicare','futa','suta','federalIncome','stateIncome','lossOffset','salesTax']) settings[`${field}Bps`]=percentBps(b[`${field}Percent`]??(US_TAX_DEFAULTS as Data)[`${field}Percent`]??(field==='salesTax'?'0':undefined),`${field} rate %`)
 for(const field of ['socialSecurity','futa','suta'])settings[`${field}BaseCents`]=cents(b[`${field}Base`]??(US_TAX_DEFAULTS as Data)[`${field}Base`],`${field} annual wage base`)
 requireThat(settings.federalIncomeBps+settings.stateIncomeBps<=10000,'Combined income tax rates cannot exceed 100%')
 for(const kind of ['revenue','position','expense','schedule','debt','asset','formula'])requireThat(!all(s,kind).some(r=>r.scenario===scenario&&r.line===line.id),'Use a dedicated income-tax expense line without other planned inputs',409)
 const w=get(s,'workspace','main')
 if(periodForKey(w as Data & CalendarWorkspace, w.planStart).startDate.slice(5)!=='01-01') for(const p of all(s,'position').filter(p=>p.scenario===scenario&&p.start<w.planStart&&p.employmentType!=='1099')) requireThat(p.taxYtdWagesCents!==undefined,'Enter prior-year-to-date wages for each continuing W-2 position before enabling taxes in a partial calendar year',409)
 return settings
}
export function positionTaxInput(b:Data):Data {
 return {employmentType:choice(b.employmentType??'W-2',['W-2','1099'] as const,'employment type'),...(b.taxYtdWages===undefined||b.taxYtdWages===''?{}:{taxYtdWagesCents:cents(b.taxYtdWages,'Prior year-to-date taxable wages')})}
}
