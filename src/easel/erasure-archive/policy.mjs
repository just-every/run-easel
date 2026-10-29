import { PortabilityError, sha256 } from '@runeditrun/rer/modules/portability';
import { transformErased } from '../erasure-map.mjs';

const requireValid = (ok, code) => { if (!ok) throw new PortabilityError(`easel_${code}`, 409); };
const parse = value => { try { return JSON.parse(value); } catch { throw new PortabilityError('easel_record_json', 409); } };
const revision = value => Number.isSafeInteger(value) && value > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const canonical = value => JSON.stringify(value, (_, v) => object(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

/** Product invariants shared by every Easel restore entry point. Base owns
 * archive checksums, staging and atomic publication; Easel owns its records. */
export async function validateEaselStaged(staged) {
 const [rawRecords, rawSnapshots, rawActivity] = await Promise.all([staged.read('e_records'), staged.read('e_snapshots'), staged.read('e_activity')]);
 const maps = rawRecords.filter(r => r.kind === 'erasure').map(r => parse(r.value));
 const mappedRecords = rawRecords.map(r => transformErased({ ...r, value: parse(r.value) }, maps));
 const records = new Map(mappedRecords.map(r => [`${r.kind}:${r.id}`, { ...r.value, id: r.id }]));
 const activity = rawActivity.map(r => transformErased({ ...r, detail: parse(r.detail) }, maps));
 const actuals=await staged.read('e_actuals');
 for(const row of actuals){
  const value=transformErased(parse(row.value),maps);
  if(!value.intacctCompany)continue;
  const binding=[...records].find(([key,r])=>key.startsWith('intacct-entity-map:')&&r.company===value.intacctCompany&&r.sourceEntity===value.intacctSourceEntity&&r.book===value.intacctBook)?.[1];
  requireValid(binding && binding.entity===value.entity && binding.currency===value.intacctCurrency && value.intacctBook==='ACCRUAL','intacct_actual_boundary');
  requireValid(text(value.intacctLine) && typeof value.intacctOpening==='boolean' && Number.isSafeInteger(value.amount) && value.amount===row.amount && value.period===row.period,'intacct_actual_provenance');
 }

 const snapshots = new Map();
 for (const row of rawSnapshots) {
  requireValid(typeof row.body === 'string' && await sha256(row.body) === row.sha256, 'snapshot_digest');
  const body = transformErased(parse(row.body), maps);
  requireValid(body && typeof body === 'object' && !Array.isArray(body), 'snapshot_body');
  const mapped = transformErased(row, maps);
  snapshots.set(mapped.id, { ...mapped, body });
 }
 const reference = (id, kind, scenario) => {
  const sn = snapshots.get(id);
  requireValid(sn && sn.kind === kind && sn.scenario === scenario, 'snapshot_reference');
  return sn;
 };
 for (const sn of snapshots.values()) {
  const b = sn.body, sc = records.get(`scenario:${sn.scenario}`);
  requireValid(sc && revision(sc.revision), 'snapshot_scenario');
  if (sn.kind === 'approval') {
   requireValid(sc.kind === 'budget' && sc.status === 'frozen' && sc.approval?.snapshot === sn.id, 'approval_reference');
   requireValid(b.scenario?.id === sc.id && b.scenario.kind === 'budget' && b.scenario.status === 'frozen' && revision(b.revision) && b.scenario.revision === b.revision && sc.revision === b.revision && sc.approval.revision === b.revision, 'approval_revision');
   requireValid(b.approvedBy?.email === sn.actor && sc.approval.by === sn.actor && sc.approval.at === b.approvedAt, 'approval_attribution');
   requireValid(b.calculation && b.inputs && b.workspace && Array.isArray(b.lines) && Array.isArray(b.departments), 'approval_model');
   requireValid(activity.some(e => e.action === 'approve-budget' && e.record === sc.id && e.scenario === sc.id && e.detail.snapshot === sn.id && e.before_revision === b.revision && e.after_revision === b.revision && e.actor === sn.actor), 'approval_activity');
  } else if (sn.kind === 'forecast') {
   const kept = sc.priorForecasts?.filter(p => p.snapshot === sn.id);
   requireValid(sc.kind === 'forecast' && kept?.length === 1 && kept[0].month === b.month && b.scenario?.id === sc.id && b.scenario.kind === 'forecast', 'forecast_reference');
   requireValid(revision(b.scenario.revision) && b.scenario.revision < sc.revision && b.scenario.budgetSnapshot === sc.budgetSnapshot && b.month <= sc.actualsThrough && b.calculation && b.inputs && b.keptBy === sn.actor, 'forecast_revision');
   requireValid(activity.some(e => e.action === 'close-month' && e.record === sc.id && e.scenario === sc.id && e.detail.priorForecast === sn.id && e.detail.month === b.month && e.before_revision === b.scenario.revision && e.after_revision === b.scenario.revision + 1 && e.actor === sn.actor), 'forecast_activity');
  } else if (sn.kind === 'reforecast') {
   requireValid(sc.kind === 'reforecast' && sc.status === 'frozen' && sc.reforecast?.snapshot === sn.id && text(sc.name) && sn.label === sc.name && canonical(b.scenario) === canonical(sc), 'reforecast_reference');
   requireValid(revision(b.revision) && sc.revision === b.revision && sc.reforecast.revision === b.revision && sc.branchedFrom?.revision === b.revision && b.source?.revision === b.revision, 'reforecast_revision');
   requireValid(text(b.source.scenario) && b.source.scenario !== sc.id && text(b.source.name) && sc.branchedFrom.scenario === b.source.scenario && sc.branchedFrom.name === b.source.name, 'reforecast_source');
   // A saved version outlives deletion of its working source. A source that
   // remains must still be a valid working plan at or beyond the saved revision.
   const source = records.get(`scenario:${b.source.scenario}`);
   requireValid(!source || (['forecast', 'scenario'].includes(source.kind) && source.status === 'working' && revision(source.revision) && source.revision >= b.revision), 'reforecast_source');
   requireValid(text(sn.actor) && b.savedBy?.email === sn.actor && text(b.savedBy.name) && sc.reforecast.by === sn.actor && sc.createdBy === sn.actor && text(b.savedAt) && sc.reforecast.at === b.savedAt && sc.createdAt === b.savedAt, 'reforecast_attribution');
   requireValid(object(b.workspace) && Array.isArray(b.lines) && Array.isArray(b.departments) && object(b.inputs) && ['revenue', 'position', 'expense', 'schedule', 'allocation', 'asset-category', 'asset'].every(k => Array.isArray(b.inputs[k])) && object(b.calculation) && ['months', 'cells', 'profit', 'cash'].every(k => Array.isArray(b.calculation[k])), 'reforecast_model');
   requireValid(activity.some(e => e.action === 'reforecast-save' && e.record === sc.id && e.scenario === sc.id && e.detail.snapshot === sn.id && e.detail.source === b.source.scenario && e.detail.revision === b.revision && e.before_revision === b.revision && e.after_revision === b.revision && e.actor === sn.actor), 'reforecast_activity');
  } else if (sn.kind === 'pack') {
   const packs = [...records.entries()].filter(([key, p]) => key.startsWith('pack:') && p.snapshot === sn.id).map(([, p]) => p);
   requireValid(packs.length === 1 && packs[0].status === 'published' && packs[0].forecast === sc.id && packs[0].month === b.month && b.forecast?.id === sc.id, 'pack_reference');
   requireValid(revision(b.forecast.revision) && b.forecast.revision <= sc.revision && b.publishedBy?.email === sn.actor, 'pack_revision');
   const published = activity.find(e => e.action === 'pack-publish' && e.record === packs[0].id && e.detail.snapshot === sn.id && e.actor === sn.actor);
   const latest = published && activity.filter(e => e.scenario === sc.id && e.seq < published.seq && revision(e.after_revision)).sort((a, b) => b.seq - a.seq)[0];
   requireValid(latest?.after_revision === b.forecast.revision, 'pack_activity');
   const budget = reference(b.budget?.snapshot, 'approval', records.get(`scenario:${sc.parent}`)?.id);
   requireValid(b.budget.sha256 === budget.sha256 && b.budget.revision === budget.body.revision && b.budget.snapshot === sc.budgetSnapshot, 'pack_budget');
   if (b.priorForecast) requireValid(reference(b.priorForecast, 'forecast', sc.id).body.month === b.month, 'pack_forecast');
  } else requireValid(false, 'snapshot_kind');
 }
 for (const [key, r] of records) {
  if(key.startsWith('intacct-entity-map:')) {
   const entity=records.get(`entity:${r.entity}`),scenario=records.get(`scenario:${r.scenario}`);
   requireValid(entity && scenario && entity.scenario===r.scenario && entity.currency===r.currency && r.book==='ACCRUAL' && text(r.company) && text(r.sourceEntity),'intacct_entity_binding');
   requireValid([...records].filter(([k,v])=>k.startsWith('intacct-entity-map:')&&v.entity===r.entity).length===1,'intacct_entity_unique');
  }
  if(key.startsWith('intacct-month:')) {
   const binding=[...records].find(([k,v])=>k.startsWith('intacct-entity-map:')&&v.company===r.company&&v.sourceEntity===r.sourceEntity&&v.book===r.book)?.[1];
   requireValid(binding && binding.entity===r.entity && binding.currency===r.currency && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) && ['accepted','undone'].includes(r.status),'intacct_receipt');
   requireValid(r.status!=='accepted'||r.trialBalance?.balanced===true,'intacct_receipt_trial');
  }
  if (key.startsWith('schedule:') && r.history) {
   const h = r.history;
   requireValid(!r.values && object(h) && records.has(`line:${h.sourceLine}`) && records.has(`department:${h.sourceDepartment}`) && records.has(`scenario:${r.scenario}`), 'history_schedule_reference');
   requireValid(Number.isSafeInteger(h.offset) && h.offset >= 1 && h.offset <= 60 && Number.isSafeInteger(h.window) && h.window >= 1 && h.window <= 60 && Number.isSafeInteger(h.growthBps) && h.growthBps >= -10000 && h.growthBps <= 100000, 'history_schedule_definition');
  }
  if (key.startsWith('scenario:')) {
   if (r.kind === 'budget' && r.status === 'frozen') reference(r.approval?.snapshot, 'approval', r.id);
   if (r.kind === 'reforecast') reference(r.reforecast?.snapshot, 'reforecast', r.id);
   if (r.kind === 'forecast') {
    reference(r.budgetSnapshot, 'approval', r.parent);
    for (const kept of r.priorForecasts ?? []) requireValid(reference(kept.snapshot, 'forecast', r.id).body.month === kept.month, 'forecast_month');
   }
  }
  if (key.startsWith('pack:') && r.status === 'published') reference(r.snapshot, 'pack', r.forecast);
  if(key.startsWith('entity:')){
   requireValid(records.has(`scenario:${r.scenario}`)&&records.has(`entity-group:${r.group}`)&&records.has(`dimension-member:${r.member}`)&&/^[A-Z]{3}$/.test(r.currency),'entity_source');
   if(r.forecast)requireValid(records.get(`scenario:${r.forecast}`)?.entity===r.id&&records.get(`scenario:${r.forecast}`)?.kind==='forecast','entity_forecast');
  }
  if(key.startsWith('netsuite-subsidiary:')){
   const entity=records.get(`entity:${r.entity}`);
   requireValid(entity&&entity.scenario===r.scenario&&entity.currency===r.currency&&text(r.account)&&/^\d+$/.test(r.book)&&/^\d+$/.test(r.subsidiary),'netsuite_binding');
  }
  if(key.startsWith('netsuite-month:'))requireValid(records.get(`netsuite-subsidiary:${r.binding}`)?.entity===r.entity&&['accepted','undone'].includes(r.status)&&r.trialBalance?.balanced===true,'netsuite_month');

 }
 const netsuiteActuals=await staged.read('e_actuals');
 for(const row of netsuiteActuals){const value=parse(row.value);if(!value.netsuiteAccount)continue;
  const binding=records.get(`netsuite-subsidiary:${value.netsuiteAccount}:${value.netsuiteBook}:${value.netsuiteSubsidiary}`);
  requireValid(binding&&binding.entity===value.entity&&binding.currency===value.currency&&text(value.netsuiteLine)&&text(value.netsuiteAttribution)&&value.period===value.netsuitePeriodOverride,'netsuite_actual');
 }
}

export const easelPolicy = {
 product: 'just-every/planning-easel', excludeTables: ['agent_door_%', 'bs_%', 'e_api_tokens', 'e_api_limits', 'e_connection_secrets', 'e_erasure_key', 'e_calculation_jobs', 'e_calculation_job_chunks'], replaceableTables: ['e_meta'],
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 validateStaged: validateEaselStaged,
};

export default easelPolicy;
