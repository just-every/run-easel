import { pageStyle } from '../modules/agent-door/page-style.ts'

/** Seed-owned browsing; the shared person API remains the only source of rows. */
export function agentAuditPage(): Response {
 const nonce = crypto.randomUUID().replaceAll('-', '')
 return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent audit · Easel</title><style nonce="${nonce}">${pageStyle}
.filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.filters .actions{grid-column:1/-1}[hidden]{display:none!important}.audit-row{overflow-wrap:anywhere}.audit-row h3{margin-bottom:4px}@media(max-width:600px){.filters{grid-template-columns:minmax(0,1fr)}}
</style><link rel="stylesheet" href="/rer-theme.css"></head><body><a class="skip" href="#main">Skip to content</a><header><a href="/app?tab=settings">Easel settings</a><nav aria-label="Agents"><a href="/agents">Agents</a></nav></header><main id="main"><h1>Agent audit</h1><p>Inspect planning actions, their policy decisions and named approvers.</p>
<section aria-labelledby="filters-title"><h2 id="filters-title">Filter actions</h2><p id="filter-help" class="meta">Use exact agent and class identifiers. Leave either field blank to include all.</p><form id="filters" class="filters"><div><label for="agent">Agent ID</label><input id="agent" name="agent" aria-describedby="filter-help" autocomplete="off"></div><div><label for="class">Class</label><input id="class" name="class" aria-describedby="filter-help" autocomplete="off" placeholder="For example, sensitive"></div><div class="actions"><button type="submit">Apply filters</button><button id="download" type="button" class="secondary" disabled>Download JSON</button></div></form><p class="meta">The download includes all matching actions and every recorded field, including preparer and approver identifiers.</p></section>
<section aria-labelledby="results-title"><h2 id="results-title">Matching actions</h2><p id="status" role="status" aria-live="polite">Loading actions…</p><ul id="rows" class="stack" aria-label="Audit actions"></ul><button id="more" type="button" class="secondary" hidden>Load more actions</button></section><noscript>Turn on JavaScript to filter and download agent audit history.</noscript></main><script nonce="${nonce}">${auditScript}</script></body></html>`, {
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex',
   'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; font-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'` },
 })
}

const auditScript = `
const form = document.getElementById('filters'), list = document.getElementById('rows');
const status = document.getElementById('status'), more = document.getElementById('more'), download = document.getElementById('download');
let rows = [], cursor = null, ended = false, ready = false, busy = false, filters = {}, controller = new AbortController();
function controls() {
 for (const control of form.elements) control.disabled = busy;
 download.disabled = busy || !ready;
 more.disabled = busy; more.hidden = ended || !ready;
}
function clear() { rows = []; cursor = null; ended = false; ready = false; list.replaceChildren(); controls(); }
function render() {
 list.replaceChildren();
 for (const row of rows) {
  const item = document.createElement('li'); item.className = 'audit-row'; item.dataset.auditId = row.id;
  const title = document.createElement('h3'); title.textContent = row.tool;
  const who = document.createElement('p'); who.className = 'row-title'; who.textContent = row.label;
  const outcome = document.createElement('p'); outcome.textContent = row.decision + ' · ' + row.outcome + (row.code ? ' · ' + row.code : '');
  const classes = document.createElement('p'); classes.className = 'meta'; classes.textContent = row.classes.map(item => item.class).join(', ');
  const when = document.createElement('time'); when.dateTime = row.at; when.textContent = new Date(row.at).toLocaleString();
  const details = document.createElement('details'), summary = document.createElement('summary'), json = document.createElement('pre');
  summary.textContent = 'All audit fields'; json.textContent = JSON.stringify(row, null, 2); details.append(summary, json);
  item.append(title, who, outcome, classes, when, details); list.append(item);
 }
 status.textContent = rows.length ? 'Loaded ' + rows.length + ' matching actions.' : 'No matching actions.';
 controls();
}
async function page(after, selected) {
 const query = new URLSearchParams(selected); if (after !== null) query.set('after', after);
 const response = await fetch('/agents/api/audit?' + query, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
 if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Your session or audit permission is unavailable. Sign in with an authorized person account, then apply filters again.' : 'Audit history could not load. Apply filters to try again.');
 return response.json();
}
// A page can contain no matches while its cursor still advances across history.
async function batch(after, selected) {
 while (true) {
  const result = await page(after, selected), next = result.cursor;
  const ended = next === null || next === after;
  if (result.rows.length || ended) return { rows: result.rows, cursor: next, ended };
  after = next;
 }
}
async function run(action) {
 if (busy) return;
 busy = true; controls();
 try { await action(); }
 catch (error) { clear(); status.textContent = error.message || 'Audit history is unavailable. Apply filters to try again.'; }
 finally { busy = false; controls(); }
}
async function load(reset) {
 await run(async () => {
  if (reset) {
   filters = Object.fromEntries(['agent', 'class'].map(key => [key, form.elements.namedItem(key).value.trim()]).filter(([, value]) => value));
   clear();
  }
  status.textContent = 'Loading actions…';
  const result = await batch(cursor, filters);
  rows.push(...result.rows); cursor = result.cursor; ended = result.ended; ready = true; render();
 });
}
form.addEventListener('submit', event => { event.preventDefault(); load(true); });
more.addEventListener('click', () => load(false));
download.addEventListener('click', () => run(async () => {
 status.textContent = 'Preparing complete JSON download…';
 const exported = []; let after = null;
 while (true) {
  const result = await page(after, filters); exported.push(...result.rows);
  if (result.cursor === null || result.cursor === after) break;
  after = result.cursor;
 }
 const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2) + '\\n'], { type: 'application/json' }));
 const link = document.createElement('a'); link.href = url; link.download = 'agent-audit.json'; link.click();
 setTimeout(() => URL.revokeObjectURL(url), 0);
 status.textContent = 'Downloaded ' + exported.length + ' matching actions.';
}));
window.addEventListener('pagehide', () => { controller.abort(); clear(); });
window.addEventListener('pageshow', event => { if (event.persisted) { controller = new AbortController(); busy = false; load(true); } });
load(true);
`
