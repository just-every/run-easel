import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import JSZip from 'jszip/dist/jszip.min.js';
import { erasedHash } from '../erasure-map.mjs';

const hash = value => erasedHash(String(value).trim());
const xmlDecode = text => text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[\da-f]+);/gi, (_, entity) => {
 const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
 return named[entity] ?? String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
});
const xmlEncode = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const attr = (tag, name) => {
 const match = new RegExp(`\\s${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(["'])([\\s\\S]*?)\\1`).exec(tag);
 return match ? xmlDecode(match[2]) : undefined;
};
const element = (xml, name) => new RegExp(`<((?:[\\w.-]+:)?${name})\\b[^>]*>([\\s\\S]*?)<\\/\\1\\s*>`).exec(xml)?.[2];
const textValue = xml => [...xml.replace(/<(?:[\w.-]+:)?rPh\b[\s\S]*?<\/(?:[\w.-]+:)?rPh\s*>/g, '').matchAll(/<((?:[\w.-]+:)?t)\b[^>]*>([\s\S]*?)<\/\1\s*>/g)].map(match => xmlDecode(match[2])).join('');
const cellPattern = () => /<((?:[\w.-]+:)?c)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;
const sharedPattern = () => /<((?:[\w.-]+:)?si)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;

// Record field spans so erasing one person never reformats amounts, quotes,
// line endings, blank rows, or any other employee's original CSV fields.
function csvRows(text) {
 const rows = [];
 let start = text.charCodeAt(0) === 0xfeff ? 1 : 0, quoted = false, row = [];
 for (let at = start; at <= text.length; at++) {
  const char = text[at];
  if (quoted) {
   if (char === '"' && text[at + 1] === '"') at++;
   else if (char === '"') quoted = false;
   continue;
  }
  if (char === '"' && at === start) { quoted = true; continue; }
  if (char !== ',' && char !== '\r' && char !== '\n' && at !== text.length) continue;
  const raw = text.slice(start, at);
  row.push({ start, end: at, value: raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw });
  if (char !== ',') { rows.push(row); row = []; }
  if (char === '\r' && text[at + 1] === '\n') at++;
  start = at + 1;
 }
 if (quoted) throw new Error('Payroll original CSV ends inside a quoted field');
 return rows;
}

function columns(headers, scope) {
 const employeeId = headers.indexOf(scope.original.columns.employeeId);
 const name = scope.original.columns.name === undefined ? -1 : headers.indexOf(scope.original.columns.name);
 if (employeeId < 0 || scope.original.columns.name !== undefined && name < 0) throw new Error('Payroll original has no mapped identity column');
 return { employeeId, name };
}

function transformCsv(bytes, scopes) {
 const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
 const rows = csvRows(text).filter(row => row.some(field => field.value.trim()));
 if (!rows.length) throw new Error('Payroll original has no header row');
 const headers = rows[0].map(field => field.value.trim());
 const choices = scopes.map(scope => ({ ...scope, ...columns(headers, scope) }));
 const edits = new Map();
 for (const row of rows.slice(1)) {
  for (const scope of choices) {
   const id = row[scope.employeeId];
   if (!id || hash(id.value) !== scope.employeeHash) continue;
   for (const index of [scope.employeeId, scope.name]) {
    const field = row[index];
    if (field && field.value !== scope.pseudonym) edits.set(field.start, { ...field, value: '"' + scope.pseudonym.replace(/"/g, '""') + '"' });
   }
   break;
  }
 }
 if (!edits.size) return bytes;
 let output = '', at = 0;
 for (const edit of [...edits.values()].sort((a, b) => a.start - b.start)) {
  output += text.slice(at, edit.start) + edit.value; at = edit.end;
 }
 return Buffer.from(output + text.slice(at));
}

function cells(xml, shared) {
 const rows = new Map();
 for (const match of xml.matchAll(cellPattern())) {
  const ref = attr(' ' + match[2], 'r'), address = /^([A-Z]+)(\d+)$/.exec(ref ?? '');
  if (!address) continue;
  const col = [...address[1]].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  const body = match[3] ?? '', type = attr(' ' + match[2], 't'), raw = element(body, 'v');
  let value = null;
  if (type === 's') value = shared[Number(raw)]?.value ?? '';
  else if (type === 'inlineStr') value = textValue(body);
  else if (type === 'str') value = xmlDecode(raw ?? '');
  else if (type === 'b') value = raw === '1';
  else if (raw !== undefined && raw !== '' && type !== 'e') value = Number(raw);
  const row = Number(address[2]);
  if (!rows.has(row)) rows.set(row, new Map());
  rows.get(row).set(col, { ref, value });
 }
 return rows;
}

function inlineCell(tag, attrs, pseudonym) {
 const prefix = tag.includes(':') ? tag.slice(0, tag.indexOf(':') + 1) : '';
 const kept = attrs.replace(/\s+t\s*=\s*(["'])[\s\S]*?\1/g, '');
 return `<${tag}${kept} t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${xmlEncode(pseudonym)}</${prefix}t></${prefix}is></${tag}>`;
}

async function transformXlsx(bytes, scopes) {
 const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
 const read = async name => {
  const entry = zip.file(name);
  if (!entry) throw new Error(`Payroll workbook is missing ${name}`);
  return entry.async('string');
 };
 const [workbook, relations, sharedXml] = await Promise.all([
  read('xl/workbook.xml'), read('xl/_rels/workbook.xml.rels'),
  zip.file('xl/sharedStrings.xml')?.async('string') ?? '',
 ]);
 const targets = new Map([...relations.matchAll(/<(?:[\w.-]+:)?Relationship\b[^>]*>/g)].map(match => [attr(match[0], 'Id'), attr(match[0], 'Target')]));
 const sheets = [...workbook.matchAll(/<(?:[\w.-]+:)?sheet\b[^>]*>/g)].map(match => {
  const target = targets.get(attr(match[0], 'r:id'));
  return { name: attr(match[0], 'name'), path: target && posix.normalize(target.startsWith('/') ? target.slice(1) : 'xl/' + target) };
 });
 const shared = [...sharedXml.matchAll(sharedPattern())].map(match => ({ value: textValue(match[3] ?? '') }));
 const bySheet = new Map();
 for (const scope of scopes) {
  const sheet = scope.original.sheet === undefined ? sheets[0] : sheets.find(sheet => sheet.name === scope.original.sheet);
  if (!sheet?.path) throw new Error('Payroll original has no mapped worksheet');
  if (!bySheet.has(sheet.path)) bySheet.set(sheet.path, []);
  bySheet.get(sheet.path).push(scope);
 }
 const updates = new Map(), identities = new Set();
 await Promise.all([...bySheet].map(async ([path, sheetScopes]) => {
  const xml = await read(path), rows = cells(xml, shared), header = rows.get(1);
  if (!header) throw new Error('Payroll original has no header row');
  const headers = [];
  for (const [col, cell] of header) headers[col] = typeof cell.value === 'string' ? cell.value.trim() : '';
  const choices = sheetScopes.map(scope => ({ ...scope, ...columns(headers, scope) }));
  const replacements = new Map();
  for (const [rowNumber, row] of rows) {
   if (rowNumber === 1) continue;
   for (const scope of choices) {
    const id = row.get(scope.employeeId);
    if (!id || id.value === null || hash(id.value) !== scope.employeeHash) continue;
    for (const col of [scope.employeeId, scope.name]) {
     const cell = row.get(col);
     if (!cell || cell.value === scope.pseudonym) continue;
     if (cell.value !== null) identities.add(hash(cell.value));
     replacements.set(cell.ref, scope.pseudonym);
    }
    break;
   }
  }
  if (replacements.size) updates.set(path, xml.replace(cellPattern(), (whole, tag, attrs) => {
   const pseudonym = replacements.get(attr(' ' + attrs, 'r'));
   return pseudonym === undefined ? whole : inlineCell(tag, attrs, pseudonym);
  }));
 }));
 if (!updates.size) return bytes;

 // Keep shared references and rich text in every unrelated cell intact. Blank
 // only identity entries with no remaining uses, including duplicate orphans;
 // removing a target cell alone would leave its identity recoverable in the ZIP.
 if (sharedXml) {
  const referenced = new Map();
  await Promise.all(Object.values(zip.files).filter(entry => !entry.dir && entry.name.endsWith('.xml') && entry.name !== 'xl/sharedStrings.xml').map(async entry => {
   const xml = updates.get(entry.name) ?? await entry.async('string');
   for (const match of xml.matchAll(cellPattern())) if (attr(' ' + match[2], 't') === 's') {
    const index = Number(element(match[3] ?? '', 'v'));
    referenced.set(index, (referenced.get(index) ?? 0) + 1);
   }
  }));
  let index = 0;
  const cleaned = sharedXml.replace(sharedPattern(), (whole, tag, attrs) => {
   const current = index++;
   const prefix = tag.includes(':') ? tag.slice(0, tag.indexOf(':') + 1) : '';
   return !referenced.has(current) && identities.has(hash(shared[current].value)) ? `<${tag}${attrs}><${prefix}t></${prefix}t></${tag}>` : whole;
  });
  if (cleaned !== sharedXml) updates.set('xl/sharedStrings.xml', cleaned);
 }
 for (const [path, xml] of updates) {
  const entry = zip.file(path);
  zip.file(path, xml, { date: entry.date, comment: entry.comment, unixPermissions: entry.unixPermissions, dosPermissions: entry.dosPermissions, createFolders: false });
 }
 return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Original job IDs and digests bind a provider/employee association to its file.
 * Only that file's mapped identity cells in the associated employee's rows change. */
export async function transformPayrollOriginal(inputBytes, maps, jobId) {
 if (typeof jobId !== 'string' || !jobId) return inputBytes;
 const digest = createHash('sha256').update(inputBytes).digest('hex');
 const scopes = maps.flatMap(map => (map.payrollScopes ?? []).flatMap(scope => (scope.originals ?? [])
  .filter(original => original.sha256 === digest && original.jobId === jobId)
  .map(original => ({ employeeHash: scope.employeeHash, pseudonym: map.pseudonym, original }))));
 if (!scopes.length) return inputBytes;
 return inputBytes[0] === 0x50 && inputBytes[1] === 0x4b ? transformXlsx(inputBytes, scopes) : transformCsv(inputBytes, scopes);
}
