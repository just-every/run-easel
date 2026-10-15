import { PortabilityError, sha256 } from '@runeditrun/rer/modules/portability';

const requireValid = (ok, code) => { if (!ok) throw new PortabilityError(`easel_${code}`, 409); };
const parse = value => { try { return JSON.parse(value); } catch { throw new PortabilityError('easel_record_json', 409); } };
const revision = value => Number.isSafeInteger(value) && value > 0;

/** Product invariants shared by every Easel restore entry point. Base owns
 * archive checksums, staging and atomic publication; Easel owns its records. */
export async function validateEaselStaged(staged) {
 const [rawRecords, rawSnapshots, rawActivity] = await Promise.all([staged.read('e_records'), staged.read('e_snapshots'), staged.read('e_activity')]);
 const records = new Map(rawRecords.map(r => [`${r.kind}:${r.id}`, { ...parse(r.value), id: r.id }]));
 const activity = rawActivity.map(r => ({ ...r, detail: parse(r.detail) }));
 const snapshots = new Map();
 for (const row of rawSnapshots) {
  requireValid(typeof row.body === 'string' && await sha256(row.body) === row.sha256, 'snapshot_digest');
  const body = parse(row.body);
  requireValid(body && typeof body === 'object' && !Array.isArray(body), 'snapshot_body');
  snapshots.set(row.id, { ...row, body });
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
  if (key.startsWith('scenario:')) {
   if (r.kind === 'budget' && r.status === 'frozen') reference(r.approval?.snapshot, 'approval', r.id);
   if (r.kind === 'forecast') {
    reference(r.budgetSnapshot, 'approval', r.parent);
    for (const kept of r.priorForecasts ?? []) requireValid(reference(kept.snapshot, 'forecast', r.id).body.month === kept.month, 'forecast_month');
   }
  }
  if (key.startsWith('pack:') && r.status === 'published') reference(r.snapshot, 'pack', r.forecast);
 }
}

export const easelPolicy = {
 product: 'just-every/planning-easel', replaceableTables: ['e_meta'],
 requiredConfiguration: ['OWNER_EMAIL', 'SESSION_SECRET', 'SETUP_TOKEN', 'AUTH_ORIGIN', 'MAIL_PROVIDER', 'MAIL_FROM'],
 validateStaged: validateEaselStaged,
};

export default easelPolicy;
