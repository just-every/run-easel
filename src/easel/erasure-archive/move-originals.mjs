import { createHash } from 'node:crypto'
import { transformPayrollOriginal } from './payroll-originals.mjs'
import { erasedHash } from '../erasure-map.mjs'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const textOf = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
const error = message => { throw new Error(`Move-in identity original: ${message}`) }

/** Field spans let a semicolon original reuse the existing payroll transformer
 * without changing its quoting, monetary strings, blank rows or line endings. */
function fieldsOf(text, delimiter) {
 const rows = []
 let at = text.charCodeAt(0) === 0xfeff ? 1 : 0, row = []
 while (at < text.length) {
  const start = at
  let value = ''
  if (text[at] === '"') {
   at++; let closed = false
   while (at < text.length) {
    if (text[at] !== '"') { value += text[at++]; continue }
    if (text[at + 1] === '"') { value += '"'; at += 2; continue }
    at++; closed = true; break
   }
   if (!closed) error('CSV ends inside a quoted field')
   if (at < text.length && ![delimiter,'\r','\n'].includes(text[at])) error('CSV has text after a closing quote')
  } else {
   while (at < text.length && ![delimiter,'\r','\n'].includes(text[at])) {
    if (text[at] === '"') error('CSV has an unquoted quote')
    value += text[at++]
   }
  }
  row.push({ start, end: at, value })
  if (text[at] === delimiter) {
   at++
   if (at === text.length) { row.push({ start:at,end:at,value:'' });rows.push(row);row=[] }
  } else {
   rows.push(row); row = []
   if (text[at] === '\r' && text[at + 1] === '\n') at++
   at++
  }
 }
 if (row.length) rows.push(row)
 return rows
}
const quoted = value => '"' + value.replace(/"/g,'""') + '"'

function adaptedMaps(matches, innerDigest, jobId) {
 // Suppress global identity matchers. The original helper may change only the
 // explicit provider employee's mapped ID/name cells in this bound original.
 return matches.map(({map,scope,original}) => ({ pseudonym:map.pseudonym, matchers:[], payrollScopes:[{employeeHash:scope.employeeHash,originals:[{...original,sha256:innerDigest,jobId}]}] }))
}

async function transformCsv(bytes, matches, jobId, delimiter) {
 if (delimiter === ',') return transformPayrollOriginal(bytes, adaptedMaps(matches,digest(bytes),jobId),jobId)
 const text = textOf(bytes), rows = fieldsOf(text,';'), populated = rows.filter(row => row.some(field=>field.value.trim()))
 const canonical = Buffer.from(populated.map(row=>row.map(field=>quoted(field.value)).join(',')).join('\n'))
 const transformed = await transformPayrollOriginal(canonical,adaptedMaps(matches,digest(canonical),jobId),jobId)
 const changed = fieldsOf(textOf(transformed),',')
 if (changed.length !== populated.length) error('identity transform changed the CSV row count')
 const edits = []
 populated.forEach((row,index) => {
  if (row.length !== changed[index].length) error('identity transform changed the CSV column count')
  row.forEach((field,column)=>{if(field.value!==changed[index][column].value)edits.push({...field,replacement:quoted(changed[index][column].value)})})
 })
 let result='',at=0
 for(const edit of edits){result+=text.slice(at,edit.start)+edit.replacement;at=edit.end}
 return edits.length ? Buffer.from(result+text.slice(at)) : bytes
}

// Runway's documented envelope contains string filename/contents fields. Keep
// the original JSON spelling and layout outside the contents string literal.
function contentsSpan(text) {
 const string = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"/y
 let at = text.charCodeAt(0) === 0xfeff ? 1 : 0
 const space=()=>{while(/[\t\r\n ]/.test(text[at]??'!'))at++}
 const take=()=>{space();string.lastIndex=at;const match=string.exec(text);if(!match)error('export-api fields must be JSON strings');at=string.lastIndex;return {start:match.index,end:at,value:JSON.parse(match[0])}}
 space();if(text[at++]!=='{')error('invalid export-api envelope')
 const fields=new Map()
 for(;;){
  space();if(text[at]==='}'){at++;break}
  const key=take().value;space();if(text[at++]!==':')error('invalid export-api field')
  if(fields.has(key))error('duplicate export-api field')
  fields.set(key,take());space()
  if(text[at]==='}'){at++;break}
  if(text[at++]!==',')error('invalid export-api field separator')
  space();if(text[at]==='}')error('trailing export-api comma')
 }
 space();if(at!==text.length||!fields.has('filename')||!fields.has('contents'))error('incomplete export-api envelope')
 return fields.get('contents')
}

/** Planful's dimension/attribute-hierarchy export retains memberCode and
 * memberDisplayLabel headings; mapping[].attribute names become the other
 * buyer-selected headings. Never match numeric amounts or unrelated members. */
function transformPlanfulDimension(input, text, matches) {
 let payload
 try { payload=JSON.parse(text.replace(/^\uFEFF/,'')) } catch { error('invalid Planful dimension JSON') }
 if(!payload||typeof payload!=='object'||!Array.isArray(payload.members))error('expected Planful dimension members')
 const headings=new Set(['memberCode','memberDisplayLabel'])
 for(const member of payload.members){
  if(!member||typeof member!=='object'||Array.isArray(member)||typeof member.memberCode!=='string')error('Planful member needs a string memberCode')
  if(member.memberDisplayLabel!==undefined&&typeof member.memberDisplayLabel!=='string')error('invalid Planful memberDisplayLabel')
  if(member.mapping!==undefined&&!Array.isArray(member.mapping))error('invalid Planful attribute mappings')
  const attributes=new Set()
  for(const mapping of member.mapping??[]){
   if(!mapping||typeof mapping.attribute!=='string'||typeof mapping.attributeCode!=='string'||attributes.has(mapping.attribute)||Object.hasOwn(member,mapping.attribute))error('Planful attributes need distinct string attribute/attributeCode fields')
   attributes.add(mapping.attribute);headings.add(mapping.attribute)
  }
 }
 for(const {original}of matches){
  if(original.columns.employeeId!=='memberCode')error('Planful identity ID column must be the exported memberCode heading')
  if(original.columns.name!==undefined&&!headings.has(original.columns.name))error('Planful name column must be memberDisplayLabel or an exported attribute heading')
 }
 let changed=false
 for(const member of payload.members){
  const selected=matches.find(({scope})=>erasedHash(member.memberCode.trim())===scope.employeeHash)
  if(!selected)continue
  const {map,original}=selected,name=original.columns.name
  if(typeof map.pseudonym!=='string'||!map.pseudonym)error('identity receipt has no pseudonym')
  if(member.memberCode!==map.pseudonym){member.memberCode=map.pseudonym;changed=true}
  if(name==='memberDisplayLabel'&&member.memberDisplayLabel!==undefined&&member.memberDisplayLabel!==map.pseudonym){member.memberDisplayLabel=map.pseudonym;changed=true}
  for(const mapping of member.mapping??[])if(mapping.attribute===name&&mapping.attributeCode!==map.pseudonym){mapping.attributeCode=map.pseudonym;changed=true}
 }
 return changed?Buffer.from(JSON.stringify(payload)):input
}

/** Outer digest + original job bind identity authority before opening a wrapper.
 * Unsupported mapped formats refuse export instead of returning recoverable ID. */
export async function transformMoveOriginal(input, maps, jobId) {
 if(typeof jobId!=='string'||!jobId)return input
 const outer=Buffer.from(input),sha256=digest(outer)
 const matches=maps.flatMap(map=>(map.moveScopes??[]).flatMap(scope=>(scope.originals??[])
  .filter(original=>original.sha256===sha256&&original.jobId===jobId)
  .map(original=>({map,scope,original}))))
 if(!matches.length)return input
 const kinds=new Set(matches.map(({original})=>JSON.stringify([original.xmlCdata??false,original.envelope??'',original.delimiter??','])))
 if(kinds.size!==1)error('conflicting original envelope or delimiter mappings')
 const original=matches[0].original,delimiter=original.delimiter??','
 if(![',',';'].includes(delimiter))error('unsupported CSV delimiter')
 if(outer[0]===0x50&&outer[1]===0x4b){
  if(original.xmlCdata||original.envelope)error('a workbook cannot be a CSV envelope')
  return transformPayrollOriginal(outer,adaptedMaps(matches,sha256,jobId),jobId)
 }
 const text=textOf(outer)
 if(text.includes('\0'))error('unsupported binary original')
 if(original.xmlCdata){
  if(original.envelope)error('conflicting CSV envelope mappings')
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text))error('unsafe XML declaration')
  const start=text.indexOf('<![CDATA['),end=text.indexOf(']]>',start+9)
  if(start<0||end<0||text.indexOf('<![CDATA[',end+3)>=0)error('expected one complete XML CDATA CSV payload')
  const transformed=textOf(await transformCsv(Buffer.from(text.slice(start+9,end)),matches,jobId,delimiter))
  if(transformed.includes(']]>'))error('transformed identity cannot be represented in this XML CDATA envelope')
  return Buffer.from(text.slice(0,start+9)+transformed+text.slice(end))
 }
 if(original.envelope==='export-api'){
  const span=contentsSpan(text),changed=textOf(await transformCsv(Buffer.from(span.value),matches,jobId,delimiter))
  return changed===span.value?input:Buffer.from(text.slice(0,span.start)+JSON.stringify(changed)+text.slice(span.end))
 }
 if(original.envelope==='planful-dimension')return transformPlanfulDimension(input,text,matches)
 if(original.envelope!==undefined||/^\s*[<{[]/.test(text.replace(/^\uFEFF/,'')))error('unsupported identity original format; select its documented envelope')
 return transformCsv(outer,matches,jobId,delimiter)
}
