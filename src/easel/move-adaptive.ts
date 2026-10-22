import { parseCsv } from './csv'
import { parseMonthHeader } from './months'
import { moveBytes, moveText, emptyMoveExport, type MoveArtifact, type MoveExport } from './move-source'
import { adaptiveOutput, xmlChildren, type MoveXml } from './move-xml'
import { readXlsx } from './xlsx'
import { requireThat, type Data } from './types'

const month = (heading: string) => {
 const match = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(heading)
 return match ? `${match[2]}-${match[1]}` : parseMonthHeader(heading)
}
const required = (value: string | undefined, location: string, label: string) => {
 requireThat(value !== undefined && value.trim() !== '', `${location}: missing ${label}`)
 return value.trim()
}
const unique = <T extends {id: string}>(rows: T[], label: string) => requireThat(new Set(rows.map(row => row.id)).size === rows.length, `Adaptive ${label} contains repeated IDs`)
const walk = (nodes: MoveXml[], name: string, visit: (node: MoveXml, parent?: string) => void, parent?: string) => {
 for (const node of nodes.filter(n => n.name === name)) {
  visit(node, parent)
  walk(node.children, name, visit, node.attributes.id)
 }
}
const csv = (text: string, file: string, count?: number) => {
 const parsed = parseCsv(text.trim())
 for (const row of parsed.rows) requireThat(row.cells.length === parsed.headers.length, `${file}:${row.line}: CSV row has ${row.cells.length} fields; expected ${parsed.headers.length}`)
 if (count !== undefined) requireThat(parsed.rows.length === count, `${file}: completed row count differs from the CSV`)
 return parsed
}
const resolve = (value: string, rows: {id: string; name: string}[], label: string, location: string, codes?: Map<string,string>) => {
 if (rows.some(row => row.id === value)) return value
 if (codes?.has(value)) return codes.get(value)!
 const matches = rows.filter(row => row.name === value)
 requireThat(matches.length === 1, `${location}: ${label} ${value} must identify one exported metadata record`)
 return matches[0].id
}

/** Parse saved documented exports. Mapping and all native writes belong to the shared move-in kit. */
export async function parseAdaptive(files: MoveArtifact[], options: Data): Promise<MoveExport> {
 const result = emptyMoveExport()
 requireThat(files.length > 0 && files.length <= 100, 'Upload between one and 100 Adaptive export files')
 requireThat(new Set(files.map(file => file.name)).size === files.length, 'Adaptive export filenames must be unique')
 const codes = new Map<string,string>()
 const calls = new Set(['exportLevels','exportAccounts','exportDimensions','exportAttributes','exportVersions','exportData','exportConfigurableModelData','exportSheetDefinition'])
 const parsed = files.filter(file => file.call && calls.has(file.call)).map(file => ({ file, ...adaptiveOutput(moveText(file), file.name) }))
 const metadata = (call: string, container: string) => parsed.filter(item => item.file.call === call).map(item => {
  const nodes = xmlChildren(item.output, container)
  requireThat(nodes.length === 1, `${item.file.name}: expected ${container} metadata`)
  return { ...item, node: nodes[0] }
 })
 for (const {file,node} of metadata('exportLevels','levels')) walk(node.children,'level',(level,parent) => {
  result.levels.push({id:required(level.attributes.id,file.name,'level ID'),name:required(level.attributes.name,file.name,'level name'),...(parent?{parent}:{})})
  for (const extra of level.children.filter(child=>child.name!=='level')) result.unmapped.push({location:`${file.name}#level/${level.attributes.id}/${extra.name}`,reason:'Source level metadata retained in the original; no automatic access-rule or attribute conversion'})
 })
 for (const {file,node} of metadata('exportAccounts','accounts')) walk(node.children,'account',account => {
  const a=account.attributes,id=required(a.id,file.name,'account ID')
  result.accounts.push({id,name:required(a.name,file.name,'account name'),...(a.accountTypeCode?{type:a.accountTypeCode}:{})})
  if (a.code) { requireThat(!codes.has(a.code),`${file.name}: repeated account code ${a.code}`); codes.set(a.code,id) }
  const extra=Object.fromEntries(Object.entries(a).filter(([key])=>!['id','name','accountTypeCode'].includes(key)))
  if (Object.keys(extra).length || account.children.some(child=>child.name!=='account')) result.unmapped.push({location:`${file.name}#account/${id}`,reason:`Account properties require buyer mapping; source properties ${JSON.stringify(extra)}; original retains child metadata`})
 })
 for (const {file,node} of metadata('exportDimensions','dimensions')) for (const dimension of xmlChildren(node,'dimension')) {
  const d={id:required(dimension.attributes.id,file.name,'dimension ID'),name:required(dimension.attributes.name,file.name,'dimension name'),members:[] as MoveExport['dimensions'][number]['members']}
  walk(dimension.children,'dimensionValue',(value,parent)=>{
   d.members.push({id:required(value.attributes.id,file.name,'dimension value ID'),name:required(value.attributes.name,file.name,'dimension value name'),...(parent?{parent}:{})})
   for(const extra of value.children.filter(child=>child.name!=='dimensionValue'))result.unmapped.push({location:`${file.name}#dimension/${d.id}/${value.attributes.id}/${extra.name}`,reason:'Dimension value properties retained in the original; no automatic property conversion'})
  })
  unique(d.members,`dimension ${d.id} members`); result.dimensions.push(d)
 }
 for (const {file,node} of metadata('exportAttributes','attributes')) walk(node.children,'attribute',attribute=>{
  result.unmapped.push({location:`${file.name}#attribute/${required(attribute.attributes.id,file.name,'attribute ID')}`,reason:`Attribute ${required(attribute.attributes.name,file.name,'attribute name')} (${attribute.attributes.type ?? 'unspecified'}) and its value hierarchy require buyer mapping; retained in original`})
 })
 for(const {file,node} of metadata('exportVersions','versions'))walk(node.children,'version',version=>{
  const id=required(version.attributes.id,file.name,'version ID'),name=required(version.attributes.name,file.name,'version name')
  if(version.attributes.type==='VERSION_FOLDER')return
  result.versions.push({id,name})
 })
 unique(result.levels,'levels');unique(result.accounts,'accounts');unique(result.dimensions,'dimensions');unique(result.versions,'versions')
 const version=(file:MoveArtifact)=>resolve(required(file.version,file.name,'version export context'),result.versions,'version',file.name)
 for(const {file,output,rowCount} of parsed.filter(item=>item.file.call==='exportData')){
  requireThat(!output.children.length,`${file.name}: exportData output must contain CSV text`)
  const source=csv(output.text,file.name,rowCount),v=version(file)
  const accountColumn=String(options.dataColumns?.account ?? 'Account Code'),levelColumn=String(options.dataColumns?.level ?? 'Level Name')
  requireThat(source.headers.includes(accountColumn)&&source.headers.includes(levelColumn),`${file.name}: choose the exported account and level columns`)
  const periods=source.headers.flatMap((heading,index)=>{const m=month(heading);return m?[{index,month:m}]:[]})
  requireThat(periods.length>0&&new Set(periods.map(p=>p.month)).size===periods.length,`${file.name}: expected distinct monthly data columns`)
  const dims=result.dimensions.flatMap(d=>{const column=options.dimensionColumns?.[d.id]??options.dimensionColumns?.[d.name]??d.name;return source.headers.includes(column)?[{dimension:d,index:source.headers.indexOf(column)}]:[]})
  const known=new Set([accountColumn,levelColumn,'Account Name',...periods.map(p=>source.headers[p.index]),...dims.map(d=>source.headers[d.index])])
  for(const heading of source.headers.filter(h=>!known.has(h)))result.unmapped.push({location:`${file.name}#column/${heading}`,reason:'Data column is not mapped to a monthly amount or dimension; retained in original'})
  for(const row of source.rows){
   const location=`${file.name}:${row.line}`,account=resolve(required(row.cells[source.headers.indexOf(accountColumn)],location,'account'),result.accounts,'account',location,codes),level=resolve(required(row.cells[source.headers.indexOf(levelColumn)],location,'level'),result.levels,'level',location)
   const dimensions=Object.fromEntries(dims.flatMap(d=>row.cells[d.index]?[ [d.dimension.id,resolve(row.cells[d.index],d.dimension.members,'dimension member',location)] ]:[]))
   for(const period of periods){const amount=row.cells[period.index].trim();if(!amount)continue
    requireThat(/^-?\d+(?:\.\d+)?$/.test(amount),`${location}: ${source.headers[period.index]} must contain a decimal amount`)
    result.data.push({version:v,account,level,month:period.month,amount,...(Object.keys(dimensions).length?{dimensions}:{}),location:`${location}#${source.headers[period.index]}`})
   }
  }
 }
 for(const {file,output,rowCount} of parsed.filter(item=>item.file.call==='exportConfigurableModelData')){
  const nodes=xmlChildren(output,'data');requireThat(nodes.length===1,`${file.name}: expected modeled-sheet CSV data`)
  const source=csv(nodes[0].text,file.name,rowCount),expected=nodes[0].attributes.totalRowCount
  if(expected!==undefined)requireThat(/^\d+$/.test(expected)&&Number(expected)===source.rows.length,`${file.name}: modeled-sheet export is incomplete`)
  const personnel=Boolean(options.personnelSheet)&&file.sheet===options.personnelSheet
  if(!personnel){for(const row of source.rows)result.unmapped.push({location:`${file.name}:${row.line}`,reason:`Modeled-sheet row from ${file.sheet??'unspecified sheet'} has no native row equivalent; account totals arrive through exportData`});continue}
  const v=version(file),levelColumn=String(options.personnelLevelColumn??'Level'),accountColumn=String(options.personnelAccountColumn??'Account')
  requireThat(source.headers.includes('InternalID')&&source.headers.includes(levelColumn),`${file.name}: personnel export needs InternalID and the selected level column`)
  const ids=new Set<string>()
  for(const row of source.rows){
   const location=`${file.name}:${row.line}`,values=Object.fromEntries(source.headers.map((h,i)=>[h,row.cells[i]])),id=required(values.InternalID,location,'InternalID')
   requireThat(!ids.has(id),`${location}: repeated personnel InternalID`);ids.add(id)
   requireThat(!values.ParentID&&(!values.IsParent||['false','0'].includes(values.IsParent.toLowerCase())),`${location}: split personnel rows require explicit consolidation before import`)
   const level=resolve(required(values[levelColumn],location,'personnel level'),result.levels,'level',location)
   const account=resolve(required(values[accountColumn]||options.personnelAccount,location,'personnel payroll account'),result.accounts,'account',location,codes)
   result.personnel.push({id,version:v,level,account,values,location})
  }
 }
 for(const file of files.filter(file=>!file.call||!calls.has(file.call))){
  if(/\.xlsx$/i.test(file.name)){
   for(const sheet of await readXlsx(moveBytes(file))){
    for(const cell of sheet.cells.filter(c=>c.formula))result.unmapped.push({location:`${file.name}#${sheet.name}!${cell.ref}`,reason:`Sheet formula retained as source evidence; not translated: ${cell.formula}`})
    for(const row of new Set(sheet.cells.filter(c=>c.value!==null).map(c=>c.row)))result.unmapped.push({location:`${file.name}#${sheet.name}!${row}`,reason:'Sheet export row retained as source evidence; exportData supplies account totals to avoid double counting'})
   }
  }else result.unmapped.push({location:file.name,reason:'Original file has no selected supported Adaptive export call; retained without importing rows'})
 }
 for(const {file}of parsed.filter(item=>item.file.call==='exportSheetDefinition'))result.unmapped.push({location:file.name,reason:'Sheet definition retained as typed source metadata; buyer maps personnel columns explicitly'})
 requireThat(result.levels.length&&result.accounts.length&&result.versions.length,'Adaptive exports need level, account and version metadata')
 return result
}
