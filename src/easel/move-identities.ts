// Existing explicit employee-to-member associations, scoped to retained originals.
import type { MoveArtifact, MoveExport } from './move-source'
import { get, requireThat, text, type Data, type State } from './types'

export function moveIdentityMapping(state: State, source: MoveExport, files: MoveArtifact[], artifacts: Data[], mapping: Data, options: Data, provider: string, destination: string, positions: Data[]) {
 const memberMap: Record<string,string> = {}
 for (const [employee,email] of Object.entries(mapping.memberMap ?? {})) {
  requireThat(source.personnel.some(p=>p.id===employee), 'Choose an exported personnel ID for the member association')
  memberMap[employee] = get(state,'member',text(email,'Associated member email')).id
 }
 const originals: Data[] = []
 const record = (file: MoveArtifact, columns: Data, extra: Data = {}) => {
  requireThat(columns.employeeId && columns.name, 'Personnel originals need explicit employee ID and name columns')
  originals.push({...extra,file:file.name,sha256:artifacts.find(a=>a.name===file.name)!.sha256,columns})
 }
 if (provider === 'adaptive') {
  for (const file of files.filter(f=>options.personnelSheet && f.sheet === options.personnelSheet)) {
   if (file.call === 'exportConfigurableModelData') record(file,{employeeId:'InternalID',name:mapping.personnelColumns?.holder},{xmlCdata:true})
   else if (/\.xlsx$/i.test(file.name)) record(file,{employeeId:'InternalID',name:mapping.personnelColumns?.holder},{sheet:file.sheet})
  }
 } else for (const table of (options.tables ?? []).filter((t:Data)=>t.role==='personnel')) {
  const file = files.find(f=>f.name===table.file)!
  record(file,{employeeId:table.columns.id,name:mapping.personnelColumns?.holder},{...(table.sheet?{sheet:table.sheet}:{}),...(table.envelope?{envelope:table.envelope}:{}),...(table.delimiter?{delimiter:table.delimiter}:{})})
 }
 for (const extra of mapping.identityOriginals ?? []) {
  const file = files.find(f=>f.name===extra.file)
  requireThat(file,'Identity original is not in this export bundle');record(file,extra.columns,extra)
 }
 return {provider:`move:${provider}`,destination,memberMap,positionMap:Object.fromEntries(source.personnel.map(row=>[row.id,positions.filter(p=>p.employeeId===row.id).map(p=>p.originId)])),originals}
}
