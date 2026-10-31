import { requireAgent } from './agents/governance'
import { backgroundScenario } from './calculation-dispatch'
import { activeCalculationJob, readCalculationJob, startCalculationJob } from './calculation-jobs'
import { canSeeScenario } from './scenario-access'
import { erasedView } from './erasure'
import { versionStructure } from './structure-versions'
// Stateless Streamable HTTP: JSON responses, native identity, and a closed
// tool list. No command supplied by a client is dispatched directly.
import { access, requireMember } from './access'
import type { Context } from './context'
import { cycle } from './cycle'
import { INPUT_KINDS } from './model'
import { month } from './months'
import { plan } from './plan'
import { review, variance } from './review'
import { load, readFence, save } from './store'
import { Fault, get, requireThat, type Data } from './types'
import { compareView, scenarioView, stateView } from './views'

const str = { type: 'string' }
const fields: Record<string, Data> = {
 dimensions: { type: 'object', additionalProperties: str },
 members: { type: 'array', items: {type:'object',properties:{name:str,formula:str},required:['name','formula'],additionalProperties:false} },
 citationIds: { type: 'array', items: str },
 collectionCurve: { type: 'array', items: { type: 'object', properties: { days: str, percent: str }, required: ['days','percent'], additionalProperties: false } },
 milestones: { type: 'array', items: { type: 'object', properties: { name: str, month: str, amount: str }, required: ['name', 'month', 'amount'], additionalProperties: false } },
 draws: { type: 'object', additionalProperties: str }, repayments: { type: 'object', additionalProperties: str }, baseRates: { type: 'object', additionalProperties: str },
 covenants: { type: 'object', properties: { minimumCash: str, minimumLiquidity: str, maximumLeverage: str }, additionalProperties: false },
 history: { type: 'object', properties: { sourceLine: str, sourceDepartment: str, offset: { type: 'integer' }, window: { type: 'integer' }, growthPercent: str }, required: ['sourceLine', 'sourceDepartment'], additionalProperties: false },
 values: { type: 'object', additionalProperties: str },
 targets: { type: 'array', items: { type: 'object', properties: { department: str, percent: str }, required: ['department'] } },
}
function tool(name: string, description: string, required: string[], optional: string[] = [], readOnly = false) {
 if ((INPUT_KINDS as readonly string[]).includes(name)) optional = [...optional, 'dimensions']
 return { name, description, inputSchema: { type: 'object', properties: Object.fromEntries([...required, ...optional].map(k => [k, ['formula','forecast-window'].includes(name) && k === 'revision' ? { type: ['string', 'integer'] } : fields[k] ?? str])), required, additionalProperties: false }, annotations: { readOnlyHint: readOnly, openWorldHint: false } }
}
export const nativeTools = [
 tool('calculation_status', 'Read a known calculation job or list currently visible native job statuses; never resubmit a pending mutation.', [], ['id'], true),
 tool('scenarios', 'List scenarios visible to you, plus planning lines and departments.', [], [], true),
 tool('scenario', 'Read a scenario and its role-filtered inputs, cells and traces.', ['scenario'], [], true),
 tool('compare', 'Compare two visible scenarios, including changed inputs and cells.', ['a', 'b'], [], true),
 tool('variance', 'Read role-filtered variance and evidence for a closed month.', ['month'], [], true),
 tool('metrics', 'Read monthly profit, cash and department headcount for a visible scenario.', ['scenario'], [], true),
 tool('forecast-window', 'Set the working forecast window through the current company-wide planning grant, at its exact native revision.', ['scenario','revision','months']),
 tool('proposal-create', 'Create your proposal from a visible working scenario.', ['from', 'name', 'request']),
 tool('proposal-submit', 'Submit your proposal for finance review; never promote it.', ['id'], ['summary']),
 tool('revenue', 'Add or edit a revenue driver in your working proposal: volume, customers, seats, usage, services, milestones, backlog or contract. Contract requires startDate (YYYY-MM-DD in start month), contractValue, termMonths (1–120), billingCadence (monthly/quarterly/annual upfront) and dsoDays (0–365 exact days). Services assumes all active department positions are billable. Optional collectionMethod is lag, dso or curve; collectionCurve installments carry days and percent, summing to 100%. Noncontract invoice dates are month end. Optional commissionPosition links a contract to a same-scenario active position origin using its commission planning rate; Pay detail is required. Amounts and percentages are decimal strings.', ['scenario', 'name', 'kind', 'line', 'department', 'start'], ['commissionPosition', 'collectionMethod', 'collectionCurve', 'id', 'startDate', 'contractValue', 'termMonths', 'billingCadence', 'dsoDays', 'collectionLag', 'startVolume', 'growthPercent', 'rate', 'startCustomers', 'newPerMonth', 'newPerRep', 'repDepartment', 'rampMonths', 'churnPercent', 'arpa', 'startSeats', 'expansionPercent', 'price', 'startUsage', 'unitPrice', 'monthlyHours', 'utilizationPercent', 'hourlyRate', 'milestones', 'openingBacklog', 'monthlyAdditions', 'burnPercent']),
 tool('position', 'Add or edit a position in your working proposal. Optional payDay (1–31, clamped) and payMonthOffset (0–3) accrue earned payroll until its entered pay date. Optional secondPayDay later than payDay splits regular payroll equally, first installment receiving any cent remainder; both dates clamp to period end. Position bonuses settle only on the first day in their bonus period. Optional payBasis salary/hourly, hourlyRate and expectedHours per period (use annualSalary 0 for hourly), benefits per person per period and retirementMatchPercent excluding commission are employer planning estimates. Optional meritPercent/meritDate use inclusive UTC-day proration; bonusPercent/bonusMonth plan a one-off salary bonus paid in that period; blank onCostPercent captures the department default. commissionQuota is per period; commissionTiers lines attainment%:rate% set marginal accelerators. Optional commissionPercent (0–100) is a planning estimate on explicitly linked contract bookings, without on-costs; ASC 340-40 capitalisation is not modelled.', ['scenario', 'title', 'department', 'line', 'start', 'annualSalary'], ['meritPercent','meritDate','bonusPercent','bonusMonth','commissionQuota','commissionTiers','payBasis', 'hourlyRate', 'expectedHours', 'benefits', 'retirementMatchPercent', 'commissionPercent', 'id', 'holder', 'end', 'onCostPercent', 'payDay', 'secondPayDay', 'payMonthOffset','employmentType','taxYtdWages']),
 tool('expense', 'Add or edit an expense in your working proposal: recurring or one-off requires amount; acquisition requires revenueOrigin and cac; inventory requires revenueOrigin, unitCost and inventoryDays. Linked revenue must be in the same department. Prepaid requires total amount, amortizationMonths and optional paymentMonth at or before service start; bonus requires quarterly amount and first payMonth. Optional paymentMethod dpo or terms uses dpoDays or paymentTermDays after invoice month end; date uses paymentDate within the one-off expense accounting period. Monetary values and whole days/month counts are strings.', ['scenario', 'name', 'line', 'department', 'kind', 'start'], ['paymentMethod','dpoDays','paymentTermDays','paymentDate','amortizationMonths','paymentMonth','payMonth','id', 'end', 'amount', 'revenueOrigin', 'cac', 'unitCost', 'inventoryDays']),
 tool('schedule', 'Add or edit entered monthly amounts or an actuals-reference schedule in your working proposal; source months must be complete.', ['scenario', 'name', 'line', 'department'], ['values', 'history', 'id']),
 tool('formula', 'Add or edit a native formula in your proposal at its exact revision. Values are integer hundredths; multiplication and division round half away at each operation. DRIVER/PRIOR, LOOKUP/SUM over named members, LINE/ACTUAL/VERSION offsets, IF, MIN/MAX/ROUND/GROWTH are supported. Only money may contribute to a line.', ['scenario','revision','name','department','unit'], ['id','line','formula','dimension','members','start','end','collectionLag']),
 tool('asset-category', 'Finance: add or edit an asset category in your own working proposal.', ['scenario', 'name', 'usefulLifeMonths'], ['id']),
 tool('asset', 'Add or edit an asset in your own working proposal, within your departments.', ['scenario', 'name', 'category', 'department', 'line', 'kind', 'cost', 'start'], ['id', 'paymentMonth', 'openingAccumulated', 'remainingLifeMonths', 'disposalMonth', 'disposalProceeds']),
 tool('allocation', 'Finance: add or edit allocation rules in your own working proposal.', ['scenario', 'name', 'sourceDepartment', 'basis', 'targets'], ['id']),
 tool('debt', 'Finance: plan borrowing and repayment in your own draft proposal; never execute a payment.', ['scenario','name','debtKind','line','department','maturity'], ['id','start','opening','limit','rateKind','annualRate','baseName','baseRates','spreadPercent','draws','repayments','amortization','amortizationStart','termMonths','covenants']),
 tool('tax-policy', 'Finance: configure US tax planning estimates in your own draft proposal, with explicit state/employer assumptions; never file or pay taxes.', ['scenario','line','department','sutaPercent','sutaBase','stateIncomePercent'], ['id','name','year','socialSecurityPercent','socialSecurityBase','medicarePercent','futaPercent','futaBase','federalIncomePercent','openingLoss','lossOffsetPercent','salesTaxPercent','salesTaxRemitLagMonths']),
 tool('equity', 'Finance: plan an equity raise in your own draft proposal.', ['scenario','name','month','amount'], ['id']),
 tool('input-delete', 'Remove an input from your own working proposal.', ['kind', 'id'], ['revision']),
 tool('comment', 'Comment on a visible scenario within your department authority.', ['scenario', 'department', 'text']),
 tool('explanation', 'Draft a variance explanation within your department authority. Optional citationIds must name accepted rows visible in this variance; drafts require human confirmation before publication.', ['month', 'line', 'department', 'text'], ['citationIds']),
]

export async function invokeNative(c: Context, name: string, b: Data): Promise<Data> {
 requireAgent(c, 'mcp')
 requireThat(nativeTools.some(t => t.name === name), 'This tool is not available to agents', 403)
 if (name === 'scenarios') { const s = await stateView(c); requireThat('scenarios' in s, 'Plan access required', 403); return { scenarios: s.scenarios, lines: s.lines, departments: s.departments, workspace: s.workspace, references: { departments: Object.fromEntries(s.departments.map((d: Data) => [d.name, d.id])), lines: Object.fromEntries(s.lines.map((l: Data) => [l.name, l.id])), forecast: s.scenarios.find((sc: Data) => sc.kind === 'forecast' && sc.status === 'working')?.id } } }
 if (name === 'calculation_status') {
  // Status is a metadata read. Planning contents use the separately classified
  // scenario/variance tools, including their live department and Pay filters.
  const status = async (id: string) => {
   const value = await readCalculationJob(c, id)
   return { calculationJob: value.calculationJob, ...(value.responseStatus === undefined ? {} : { responseStatus: value.responseStatus }) }
  }
  if (b.id) return status(b.id)
  const rows = (await c.db.prepare('SELECT id FROM e_calculation_jobs ORDER BY started_at,id').all<{id:string}>()).results
  const jobs = []
  for (const row of rows) { try { jobs.push(await status(row.id)) } catch (e) { if (!(e instanceof Fault) || ![403,404].includes(e.status)) throw e } }
  return { jobs }
 }
 if (['scenario', 'metrics'].includes(name)) {
  requireThat(canSeeScenario(c.x, get(c.s, 'scenario', b.scenario)), 'Scenario not found', 404)
  const job = await activeCalculationJob(c, b.scenario)
  if (job) return { calculationJob: job }
 }
 if (name === 'scenario') return scenarioView(c, b.scenario)
 if (name === 'compare') return compareView(c, b.a, b.b)
 if (name === 'variance') return variance(c, month(b.month))
 if (name === 'metrics') {
  const view = await scenarioView(c, b.scenario)
  const calc = view.calculation
  return { currency: calc.currency, months: calc.months, profit: calc.profit, cash: calc.cash, headcount: calc.headcount, cashHealth: view.cashHealth }
 }
 if (name === 'proposal-create') await scenarioView(c, b.from)
 if (name === 'comment') await scenarioView(c, b.scenario)
 if (name === 'proposal-submit' || name === 'input-delete' || (INPUT_KINDS as readonly string[]).includes(name)) {
  const id = name === 'proposal-submit' ? b.id : name === 'input-delete' ? get(c.s, String(b.kind), b.id).scenario : b.scenario
  const proposal = get(c.s, 'scenario', id)
  requireAgentDraft(c, proposal.id)
 }
 requireThat(!backgroundScenario(c.s, name, b), 'This change requires a native background calculation; this door does not declare queued continuation', 409)
 const result = ['comment','forecast-window'].includes(name) ? await cycle(c, name, b) : name === 'explanation' ? await review(c, name, b) : await plan(c, name, b)
 requireThat(result !== undefined, 'Tool unavailable', 403)
 return result
}


export function requireAgentDraft(c: Context, id: string) {
 const proposal = get(c.s, 'scenario', id)
 requireThat(proposal.kind === 'proposal' && proposal.createdBy === c.x.actor.email && proposal.status === 'working' && proposal.proposalStatus === 'draft', 'Agents may edit and submit only their own draft proposals', 403)
}
