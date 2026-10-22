import { requireThat } from './types'

export type MoveXml = { name: string; attributes: Record<string, string>; children: MoveXml[]; text: string }
const NAME = '[A-Za-z_][A-Za-z0-9_.:-]*'
const validPoint = (n: number) => n === 9 || n === 10 || n === 13 || n >= 32 && n <= 0xd7ff || n >= 0xe000 && n <= 0xfffd || n >= 0x10000 && n <= 0x10ffff

/** Small non-validating XML reader: no DTDs, custom entities, network or recovery. */
export function parseMoveXml(raw: string, file: string): MoveXml {
 function fail(message: string): never { requireThat(false, `${file}: ${message}`); throw new Error(message) }
 if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(raw)) fail('XML declarations of document types or entities are not supported')
 if ([...raw].some(ch => !validPoint(ch.codePointAt(0)!))) fail('XML contains an invalid character')
 const decode = (value: string) => value.replace(/&([^;]*);|&/g, (all, entity: string | undefined) => {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
  if (entity && Object.hasOwn(named, entity)) return named[entity]
  if (entity && /^#(?:\d+|x[\da-fA-F]+)$/.test(entity)) {
   const point = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
   if (validPoint(point)) return String.fromCodePoint(point)
  }
  return fail(`invalid XML entity ${all}`)
 })
 const stack: MoveXml[] = [], roots: MoveXml[] = []
 let cursor = 0, nodes = 0
 const append = (value: string, cdata = false) => {
  if (!stack.length) { if (value.trim()) fail('text outside the XML root'); return }
  if (!cdata && value.includes(']]>')) fail('CDATA terminator outside a CDATA section')
  stack[stack.length - 1].text += cdata ? value : decode(value)
 }
 while (cursor < raw.length) {
  if (raw[cursor] !== '<') {
   const end = raw.indexOf('<', cursor)
   append(raw.slice(cursor, end < 0 ? raw.length : end)); cursor = end < 0 ? raw.length : end; continue
  }
  if (raw.startsWith('<!--', cursor)) {
   const end = raw.indexOf('-->', cursor + 4)
   if (end < 0 || raw.slice(cursor + 4, end).includes('--')) fail('malformed XML comment')
   cursor = end + 3; continue
  }
  if (raw.startsWith('<![CDATA[', cursor)) {
   const end = raw.indexOf(']]>', cursor + 9)
   if (end < 0 || !stack.length) fail('malformed XML CDATA section')
   append(raw.slice(cursor + 9, end), true); cursor = end + 3; continue
  }
  if (raw.startsWith('<?', cursor)) {
   const end = raw.indexOf('?>', cursor + 2)
   if (end < 0 || cursor !== 0 || !/^<\?xml\s+version=(["'])1\.0\1(?:\s+encoding=(["'])UTF-8\2)?(?:\s+standalone=(["'])(?:yes|no)\3)?\s*$/i.test(raw.slice(cursor, end))) fail('unsupported XML processing instruction')
   cursor = end + 2; continue
  }
  if (raw.startsWith('</', cursor)) {
   const match = new RegExp(`^<\/(${NAME})\\s*>`).exec(raw.slice(cursor))
   if (!match || stack.pop()?.name !== match[1]) fail('mismatched XML closing element')
   cursor += match[0].length; continue
  }
  const open = new RegExp(`^<(${NAME})(?=\\s|/?>)`).exec(raw.slice(cursor))
  if (!open) fail('malformed XML opening element')
  cursor += open[0].length
  const node: MoveXml = { name: open[1], attributes: Object.create(null), children: [], text: '' }
  let selfClosing = false
  while (cursor < raw.length) {
   const space = /^\s*/.exec(raw.slice(cursor))![0]; cursor += space.length
   if (raw.startsWith('/>', cursor)) { selfClosing = true; cursor += 2; break }
   if (raw[cursor] === '>') { cursor++; break }
   if (!space) fail('XML attributes must be separated by whitespace')
   const attribute = new RegExp(`^(${NAME})\\s*=\\s*(["'])([\\s\\S]*?)\\2`).exec(raw.slice(cursor))
   if (!attribute || attribute[3].includes('<') || Object.hasOwn(node.attributes, attribute[1])) fail('malformed or duplicate XML attribute')
   node.attributes[attribute[1]] = decode(attribute[3]); cursor += attribute[0].length
  }
  if (cursor > raw.length || raw[cursor - 1] !== '>') fail('unclosed XML opening element')
  if (++nodes > 100_000 || stack.length >= 128) fail('XML structure exceeds supported limits')
  if (stack.length) stack[stack.length - 1].children.push(node)
  else roots.push(node)
  if (!selfClosing) stack.push(node)
 }
 if (stack.length || roots.length !== 1) fail('XML needs exactly one complete root element')
 return roots[0]
}

export const xmlChildren = (node: MoveXml, name: string) => node.children.filter(child => child.name === name)

/** Streaming exports report completion after the payload; partial CSV is never accepted. */
export function adaptiveOutput(raw: string, file: string): { output: MoveXml; rowCount?: number } {
 const root = parseMoveXml(raw, file)
 requireThat(root.name === 'response', `${file}: expected an Adaptive response`)
 const statuses = xmlChildren(root, 'status'), outputs = xmlChildren(root, 'output')
 requireThat(statuses.length <= 1 && outputs.length === 1, `${file}: expected one output and at most one completion status`)
 requireThat(statuses.length ? statuses[0].attributes.success === 'true' && root.attributes.success !== 'false' : root.attributes.success === 'true', `${file}: Adaptive export failed or did not complete`)
 for (const job of [...xmlChildren(root, 'job'), ...xmlChildren(outputs[0], 'job')]) {
  const pages = job.attributes.numberOfPages ?? job.attributes.pageCount
  requireThat(pages === undefined || pages === '1', `${file}: paged modeled-sheet export is incomplete; supply an isGetAllRows export`)
 }
 const count = statuses[0]?.attributes.rowCountSent
 if (count !== undefined) requireThat(/^\d+$/.test(count) && Number.isSafeInteger(Number(count)), `${file}: invalid completed row count`)
 requireThat(!statuses.length || count !== undefined, `${file}: streaming export has no completed row count`)
 return { output: outputs[0], ...(count === undefined ? {} : { rowCount: Number(count) }) }
}
