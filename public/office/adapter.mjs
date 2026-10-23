import { renderChart } from './render.mjs';

export const LINKS_SETTING = 'easel.linked-items.v1';
const PREFIX = 'easel.link.';
const METRICS = ['budget', 'actual', 'comparison', 'variance', 'priorYearActual', 'yoy'];
const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };

function bindingOnly(value) {
  if (!value || value.schema !== 1 || !['table', 'chart', 'number'].includes(value.kind) || !METRICS.includes(value.metric)) fail('Invalid Easel binding.');
  for (const key of ['report', 'period', 'row', 'source', 'through']) if (typeof value[key] !== 'string' || !value[key]) fail(`Invalid Easel binding ${key}.`);
  return Object.fromEntries(['schema', 'report', 'period', 'kind', 'metric', 'row', 'source', 'through'].map(key => [key, value[key]]));
}

function environment(host) {
  const app = host.Office?.context?.host;
  const name = app === host.Office?.HostType?.Word || app === 'Word' ? 'Word' : app === host.Office?.HostType?.PowerPoint || app === 'PowerPoint' ? 'PowerPoint' : null;
  if (!name || !host[name]?.run) fail('Open this add-in in Word or PowerPoint.');
  const version = name === 'Word' ? '1.3' : '1.8';
  if (!host.Office.context.requirements.isSetSupported(`${name}Api`, version)) fail(`${name}Api ${version} is required for linked content.`);
  return { name, settings: host.Office.context.document.settings };
}

// Explicitly reconstruct metadata: stored values, credentials, URLs and revisions
// never pass through to the document's add-in settings.
export function linkedItems(host) {
  const { name, settings } = environment(host);
  const stored = settings.get(LINKS_SETTING) ?? [];
  if (!Array.isArray(stored)) fail('The document’s Easel links are invalid.');
  const ids = new Set(), targets = new Set();
  return stored.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id.startsWith(PREFIX) || item.host !== name) fail('The document’s Easel link is invalid.');
    const target = name === 'Word' ? { control: item.target?.control } : { slide: item.target?.slide, shape: item.target?.shape };
    if (name === 'Word' ? !Number.isInteger(target.control) : typeof target.slide !== 'string' || typeof target.shape !== 'string') fail('The document’s Easel target is invalid.');
    const targetKey = JSON.stringify(target);
    if (ids.has(item.id) || targets.has(targetKey)) fail('Duplicate Easel target. Remove the duplicate link before refreshing.');
    ids.add(item.id); targets.add(targetKey);
    return { id: item.id, host: name, target, binding: bindingOnly(item.binding) };
  });
}

async function prepared(value, expected) {
  if (!value || typeof value !== 'object') fail('The source returned invalid linked content.');
  const binding = bindingOnly(value.binding), payload = { ...value, binding };
  if (expected && JSON.stringify(binding) !== JSON.stringify(bindingOnly(expected))) fail('The source returned a different Easel binding.');
  if (typeof payload.title !== 'string' || typeof payload.currency !== 'string' || !Number.isInteger(payload.revision)) fail('The source returned invalid linked content.');
  if (binding.kind === 'table') {
    const rows = payload.table;
    if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0]) || !rows[0].length || rows.some(row => !Array.isArray(row) || row.length !== rows[0].length || row.some(cell => typeof cell !== 'string'))) fail('The source returned an invalid table.');
  } else if (binding.kind === 'number') {
    if (typeof payload.number !== 'string') fail('The source returned an invalid number.');
  } else {
    const chart = payload.chart;
    if (!chart || !Array.isArray(chart.categories) || !chart.categories.length || !Array.isArray(chart.values) || chart.categories.length !== chart.values.length || chart.categories.some(c => typeof c !== 'string') || chart.values.some(v => v !== null && (typeof v !== 'number' || !Number.isFinite(v)))) fail('The source returned an invalid chart.');
  }
  const frozen = clone(payload);
  return { ...frozen, rendered: binding.kind === 'chart' ? await renderChart(frozen) : null };
}

async function saveSettings(host, items) {
  const { settings } = environment(host);
  settings.set(LINKS_SETTING, items);
  await new Promise((resolve, reject) => settings.saveAsync(result => result.status === host.Office.AsyncResultStatus.Succeeded ? resolve() : reject(new Error(result.error?.message || 'The document link could not be saved.'))));
}

export async function insertLinked(host, payload) {
  const { name } = environment(host), before = linkedItems(host), data = await prepared(payload);
  const id = PREFIX + globalThis.crypto.randomUUID();
  const target = name === 'Word' ? await insertWord(host, id, data) : await insertPowerPoint(host, id, data);
  const item = { id, host: name, target, binding: data.binding };
  try { await saveSettings(host, [...before, item]); }
  catch (error) {
    environment(host).settings.set(LINKS_SETTING, before);
    // A failed metadata save must not leave a seemingly linked orphan behind.
    if (name === 'Word') await host.Word.run(async ctx => { ctx.document.contentControls.getById(target.control).delete(false); await ctx.sync(); });
    else await host.PowerPoint.run(async ctx => { ctx.presentation.slides.getItem(target.slide).shapes.getItem(target.shape).delete(); await ctx.sync(); });
    throw error;
  }
  return clone(item);
}

export async function refreshLinked(host, load) {
  const { name } = environment(host), items = linkedItems(host);
  // Complete every live authorization/source request and image render before
  // opening a mutation batch. Rejection leaves every document value unchanged.
  const payloads = await Promise.all(items.map(async item => prepared(await load(clone(item.binding)), item.binding)));
  if (JSON.stringify(linkedItems(host)) !== JSON.stringify(items)) fail('Document links changed during refresh. Refresh again.');
  if (items.length) {
    if (name === 'Word') await refreshWord(host, items, payloads);
    else await refreshPowerPoint(host, items, payloads);
  }
  return { updated: items.length };
}

async function insertWord(host, id, data) {
  return host.Word.run(async ctx => {
    const control = ctx.document.getSelection().getRange('End').insertContentControl();
    control.tag = id; control.title = 'Easel linked content';
    if (data.binding.kind === 'table') control.insertTable(data.table.length, data.table[0].length, 'Start', data.table);
    else if (data.binding.kind === 'number') control.insertText(data.number, 'Replace');
    else {
      const picture = control.insertInlinePictureFromBase64(data.rendered.image, 'Start');
      picture.width = 480; picture.height = 480 * data.rendered.height / data.rendered.width;
      picture.altTextDescription = data.rendered.description;
    }
    control.load('id'); await ctx.sync();
    return { control: control.id };
  });
}

async function refreshWord(host, items, payloads) {
  await host.Word.run(async ctx => {
    const matches = items.map(item => ctx.document.contentControls.getByTag(item.id));
    matches.forEach(collection => collection.load('items/id')); await ctx.sync();
    const controls = matches.map((collection, i) => {
      if (collection.items.length !== 1 || collection.items[0].id !== items[i].target.control) fail('A linked Word target was deleted or duplicated. Restore its original content control.');
      return collection.items[0];
    });
    controls.forEach(control => { control.tables.load('items/values'); control.inlinePictures.load('items/width,items/height,items/lockAspectRatio'); });
    await ctx.sync();
    // Validate all structure before queuing even the first content change.
    controls.forEach((control, i) => {
      const data = payloads[i], kind = data.binding.kind;
      if (kind === 'table') {
        const values = control.tables.items[0]?.values;
        if (control.tables.items.length !== 1 || control.inlinePictures.items.length || !sameSize(values, data.table)) fail('A linked table changed size or structure. Insert a new link explicitly.');
      } else if (kind === 'chart' ? control.inlinePictures.items.length !== 1 || control.tables.items.length : control.inlinePictures.items.length || control.tables.items.length) fail('A linked Word target changed type. Restore the original target.');
    });
    controls.forEach((control, i) => {
      const data = payloads[i];
      if (data.binding.kind === 'table') control.tables.items[0].values = data.table;
      else if (data.binding.kind === 'number') control.insertText(data.number, 'Replace');
      else {
        const old = control.inlinePictures.items[0], width = old.width, height = old.height, locked = old.lockAspectRatio;
        const picture = old.insertInlinePictureFromBase64(data.rendered.image, 'Replace');
        picture.lockAspectRatio = false;
        picture.width = width; picture.height = height; picture.altTextDescription = data.rendered.description;
        picture.lockAspectRatio = locked;
      }
    });
    await ctx.sync();
  });
}

function sameSize(before, after) {
  return Array.isArray(before) && before.length === after.length && before.every((row, i) => row.length === after[i].length);
}

async function insertPowerPoint(host, id, data) {
  return host.PowerPoint.run(async ctx => {
    const slides = ctx.presentation.getSelectedSlides(); slides.load('items/id'); await ctx.sync();
    if (slides.items.length !== 1) fail('Select exactly one slide for linked content.');
    const slide = slides.items[0], shapes = slide.shapes;
    let shape;
    if (data.binding.kind === 'table') shape = shapes.addTable(data.table.length, data.table[0].length, { values: data.table });
    else if (data.binding.kind === 'number') shape = shapes.addTextBox(data.number);
    else {
      shape = shapes.addGeometricShape(host.PowerPoint.GeometricShapeType.rectangle);
      shape.fill.setImage(data.rendered.image);
      shape.lineFormat.visible = false;
    }
    shape.name = id; shape.left = 36; shape.top = 72; shape.width = 648;
    shape.height = data.binding.kind === 'number' ? 54 : data.binding.kind === 'table' ? Math.min(360, 26 * data.table.length) : Math.min(360, 648 * data.rendered.height / data.rendered.width);
    shape.load('id'); await ctx.sync();
    return { slide: slide.id, shape: shape.id };
  });
}

async function refreshPowerPoint(host, items, payloads) {
  await host.PowerPoint.run(async ctx => {
    const slides = ctx.presentation.slides; slides.load('items/id'); await ctx.sync();
    // Search all slides for duplicate markers, including copied slides. Stable
    // slide+shape IDs alone would silently ignore the extra linked visual.
    slides.items.forEach(slide => slide.shapes.load('items/id,items/name,items/type'));
    await ctx.sync();
    const shapes = items.map(item => {
      const matches = slides.items.flatMap(slide => slide.shapes.items.filter(shape => shape.name === item.id).map(shape => ({ slide, shape })));
      if (matches.length !== 1 || matches[0].slide.id !== item.target.slide || matches[0].shape.id !== item.target.shape) fail('A linked PowerPoint target was deleted or duplicated. Restore its original shape.');
      return matches[0].shape;
    });
    const tables = shapes.map((shape, i) => {
      const kind = payloads[i].binding.kind;
      const expected = kind === 'table' ? 'Table' : kind === 'number' ? 'TextBox' : 'GeometricShape';
      if (shape.type !== expected) fail('A linked PowerPoint target changed type. Restore the original shape.');
      if (kind !== 'table') return null;
      const table = shape.getTable(); table.load('rowCount,columnCount'); return table;
    });
    await ctx.sync();
    const cells = tables.map((table, i) => {
      if (!table) return null;
      const values = payloads[i].table;
      if (table.rowCount !== values.length || table.columnCount !== values[0].length) fail('A linked table changed size. Insert a new link explicitly.');
      return values.map((row, r) => row.map((_, c) => table.getCellOrNullObject(r, c)));
    });
    await ctx.sync();
    if (cells.some(rows => rows?.some(row => row.some(cell => cell.isNullObject)))) fail('A linked table contains merged cells. Restore its original structure.');
    shapes.forEach((shape, i) => {
      const data = payloads[i];
      if (data.binding.kind === 'table') cells[i].forEach((row, r) => row.forEach((cell, c) => { cell.text = data.table[r][c]; }));
      else if (data.binding.kind === 'number') shape.textFrame.textRange.text = data.number;
      else shape.fill.setImage(data.rendered.image);
    });
    await ctx.sync();
  });
}
