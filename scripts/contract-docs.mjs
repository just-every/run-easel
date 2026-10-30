// With no clause argument, regenerate every clause row, adding any missing row.
// --clauses ID,ID limits write and check to those rows; prose outside rows is retained.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { parseContract } from '../src/base/seed-contract.mjs'

const [mode, ...args] = process.argv.slice(2)
if (!['write','check'].includes(mode) || args.length && (args[0] !== '--clauses' || args.length !== 2)) throw Error('Usage: node scripts/contract-docs.mjs write|check [--clauses ID,ID]')
const source = await readFile('CONTRACT.md','utf8'), acceptance = await readFile('ACCEPTANCE.md','utf8')
const split = line => line.split(/(?<!\\)\|/).slice(1,-1).map(s => s.trim())
const rows = source.split('\n').filter(line => /^\| `[^`]+` \|/.test(line)).map(split)
const tally = list => [list.filter(r => r[3] === 'done').length, list.filter(r => r[3] === 'partial').length, list.filter(r => r[3] === 'missing').length, list.length]
const counts = new Map([['Published',tally(rows.filter(r => r[2] === 'published'))],['Target and push further',tally(rows.filter(r => r[2] !== 'published'))],['All',tally(rows)]])
const generatedSource = source.split('\n').map(line => {
 const label = split(line)[0]
 return counts.has(label) ? `| ${label} | ${counts.get(label).join(' | ')} |` : line
}).join('\n')
const contract = parseContract(generatedSource)
const marker = '<!-- Generated from CONTRACT.md -->'
const selected = args.length ? args[1].split(',') : contract.clauses.map(c => c.id)
if (!selected.length || selected.some(id => !contract.clauses.some(c => c.id === id))) throw Error('Select at least one defined clause')
const sourceLines = generatedSource.split('\n')
function projection(clause) {
 const following = sourceLines.slice(clause.line).findIndex(line => /^#{1,4} /.test(line))
 const body = sourceLines.slice(clause.line, following < 0 ? undefined : clause.line + following).join('\n')
 const paragraphs = body.trim().split(/\n\s*\n/).filter(p => !/^\*Status:/.test(p) && !/^\*Acceptance evidence/.test(p)).map(p => p.replace(/^\*Acceptance:\*\s*/, '').replace(/\s+/g,' ').trim())
 const text = (clause.kind === 'published' ? clause.text : paragraphs.join(' ')).replace(/(?<!\\)\|/g, '\\|')
 const [, , , , evidence, gap] = split(sourceLines[clause.row-1])
 return `| \`${clause.id}\` — ${clause.title} | ${clause.status} | ${marker} ${text} Proof: ${evidence}.${clause.status === 'done' ? '' : ` Remaining Gap: ${gap}.`} |`
}
let generatedAcceptance = acceptance
for (const id of selected) {
 const clause = contract.clauses.find(c => c.id === id)
 const lines = generatedAcceptance.split('\n'), matches = lines.map((line,i) => line.startsWith(`| \`${id}\` — `) ? i : -1).filter(i => i >= 0)
 if (matches.length > 1) throw Error(`Expected at most one acceptance row for ${id}`)
 if (matches.length) lines[matches[0]] = projection(clause)
 else {
  const heading = clause.kind === 'published' ? '## Published clause acceptance' : '## Adopted agent door clauses'
  if (!lines.includes(heading)) lines.push('', heading, '', '| Clause | Status | Acceptance |', '| --- | --- | --- |')
  let end = lines.indexOf(heading) + 1
  while (end < lines.length && (!lines[end].trim() || lines[end].startsWith('|'))) end++
  while (!lines[end - 1].trim()) end--
  lines.splice(end, 0, projection(clause))
 }
 generatedAcceptance = lines.join('\n')
}
const target = counts.get('Target and push further')
generatedAcceptance = generatedAcceptance.replace(/^\d+ done, \d+ partial and \d+ missing target and push-further clauses\.$/m, `${target[0]} done, ${target[1]} partial and ${target[2]} missing target and push-further clauses.`)
const claims = `# Easel clause claims\n\nGenerated from [CONTRACT.md](../CONTRACT.md) by \`node scripts/contract-docs.mjs write\`. The contract retains the acceptance text, evidence and gaps. Partial and missing clauses make no completed capability claim.\n\n${contract.counts.done} done, ${contract.counts.partial} partial, ${contract.counts.missing} missing; ${contract.counts.total} clauses.\n\n| Clause | Title | Status |\n| --- | --- | --- |\n${contract.clauses.map(c => `| \`${c.id}\` | ${c.title} | ${c.status} |`).join('\n')}\n`
const outputs = new Map([['CONTRACT.md',generatedSource],['ACCEPTANCE.md',generatedAcceptance],['docs/CLAIMS.md',claims]])
for (const [path,expected] of outputs) {
 if (mode === 'write') { if (path.startsWith('docs/')) await mkdir('docs',{recursive:true}); await writeFile(path,expected) }
 else { const actual = await readFile(path,'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e }); if (actual !== expected) throw Error(`Stale generated contract view: ${path}; run write for the touched clauses`) }
}
console.log(`Contract views ${mode === 'write' ? 'generated' : 'checked'}: ${selected.join(', ')}; ${contract.counts.total} status rows`)
