import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { refuse } from '@runeditrun/rer/errors';
import { cloudflare } from '@runeditrun/rer/modules/deploy-kit/provider';
import { readOwnerState, ownerWorkerName, ownerResourceName, sameDeployment, checkResourceIdentity, withStateLock } from '@runeditrun/rer/modules/deploy-kit/owner';
import { regularBytes } from '@runeditrun/rer/internal/modules/deploy-kit/artifact.mjs';
import { activeWorker, deployedFingerprint } from '@runeditrun/rer/internal/modules/deploy-kit/worker.mjs';
import { hostedDatabase } from './hosted-d1.mjs';

function exactOrigin(value) {
 try {
  const url = new URL(value);
  if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && [url.origin, url.origin + '/'].includes(value)) return url.origin;
 } catch {}
 throw refuse('Hosted portability requires --origin with the exact HTTPS origin in a held deployment receipt.');
}

/** The command cannot choose an environment; its explicit origin must select
 * one unique receipt. Never infer a target from a database name or local DB id. */
export async function withHostedDatabase({ root, origin, sessionFile, platform, signal }, run) {
 if (sessionFile) throw refuse('Hosted portability uses Cloudflare control-plane credentials; --session-file is unsupported.');
 if (platform && platform !== 'workers') throw refuse('Hosted portability requires a recorded Workers deployment.');
 const selectedOrigin = exactOrigin(origin);
 let names;
 try { names = await readdir(join(root, '.rer', 'deploy')); }
 catch (error) { if (error.code !== 'ENOENT') throw error; names = []; }
 const candidates = [];
 for (const name of names.filter(name => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.json$/.test(name))) {
  const environment = name.slice(0, -5);
  if (environment.length > 32) continue;
  const path = join(root, '.rer', 'deploy', name);
  let record;
  try { record = JSON.parse(await regularBytes(path, 4 * 1024 * 1024)); } catch { continue; }
  if (record?.kind === 'rer-deploy-owner-state' && record.environment === environment && record.receipt?.origin === selectedOrigin) candidates.push({ path, record });
 }
 if (candidates.length !== 1) throw refuse('Hosted portability requires one unique held deployment receipt matching --origin.');
 const { path, record } = candidates[0];
 const accountId = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
 if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || accountId !== record.accountId || typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw refuse('Provide CLOUDFLARE_ACCOUNT_ID matching the deployment receipt and CLOUDFLARE_API_TOKEN through the environment.');
 const declaration = JSON.parse(await regularBytes(join(root, 'deploy.json'), 256 * 1024));
 if (record.project !== declaration.project || record.worker !== ownerWorkerName(declaration.project, record.environment) || declaration.d1?.length !== 1 || declaration.d1[0].binding !== 'DB' || declaration.r2?.length) throw refuse('The held deployment does not match this checkout’s supported database declaration.');
 const target = { accountId, project: declaration.project, environment: record.environment, worker: record.worker };
 const api = cloudflare({ accountId, token, maxRequests: 100000, requestSignal: () => signal });
 return withStateLock(path, async () => {
  const state = await readOwnerState(path, target);
  if (!state.receipt || state.receipt.origin !== selectedOrigin || state.pendingUpload || state.pendingSecret || state.owned.worker?.status !== 'created') throw refuse('The deployment receipt is missing or has an unsettled change. Complete deployment before transferring data.');
  const name = ownerResourceName(target.worker, 'DB'), entry = state.owned.d1[name];
  if (entry?.status !== 'created' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(entry.id ?? '')) throw refuse('The deployment receipt does not hold a created database.');
  const verify = async () => {
   signal?.throwIfAborted();
   const live = await activeWorker(api, target.worker);
   if (!live || !sameDeployment(live, state.receipt.provider) || !/^[a-f0-9]{64}$/.test(state.receipt.fingerprint ?? '') || deployedFingerprint(live.settings) !== state.receipt.fingerprint) throw refuse('The live Worker no longer matches the held deployment receipt.');
   const bindings = live.settings.bindings.filter(binding => binding.name === 'DB');
   if (bindings.length !== 1 || bindings[0].type !== 'd1' || bindings[0].id !== entry.id) throw refuse('The live database binding no longer matches the held deployment receipt.');
   const resource = await api.request(`/d1/database/${entry.id}`);
   checkResourceIdentity('d1', name, resource, entry);
   if (resource?.name !== name) throw refuse('The recorded database has changed identity.');
  };
  await verify();
  const result = await run(hostedDatabase(api, entry.id));
  await verify();
  return result;
 });
}
