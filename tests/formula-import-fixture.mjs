import ExcelJS from 'exceljs'
// Synthetic cross-sheet finance model, with independent hand-calculated caches.
export async function formulaWorkbook({badTotal=false,cycle=false,tag='native'}={}) {
 const book=new ExcelJS.Workbook(),budget=book.addWorksheet('Budget'),assumptions=book.addWorksheet('Assumptions')
 assumptions.addRow(['Driver','Value',null,'Category','Rate'])
 assumptions.addRow(['Base revenue',10000,null,'Core',0.2])
 assumptions.addRow(['Growth',0.1,null,'Other',0.3])
 assumptions.getCell('A10').value=tag
 assumptions.getCell('A11').value='Former Formula Source'
 assumptions.getCell('B11').value='former@example.test'
 assumptions.getCell('B9').value=987654.32 // Unused restricted source must never appear in aggregate views.
 budget.addRow(['Line','Department','2026-01','2026-02','2026-03'])
 budget.addRow(['Revenue','Engineering',{formula:cycle?'D2':"'Assumptions'!$B$2",result:10000},{formula:'C2*(1+Assumptions!$B$3)',result:11000},{formula:'D2*(1+Assumptions!$B$3)',result:12100}])
 budget.addRow(['Hosting','Engineering',{formula:'IF(C2>9000,C2*VLOOKUP("Core",Assumptions!$D$2:$E$3,2,FALSE),1/0)',result:2000},{formula:'IF(D2>9000,D2*XLOOKUP("Core",Assumptions!$D$2:$D$3,Assumptions!$E$2:$E$3),0)',result:2200},{formula:'SUM(C3:D3)/2',result:2100}])
 budget.addRow(['Lease','Engineering',{formula:'PMT(0.01,12,1000)',result:100},{formula:'C4',result:100},{formula:'C4',result:100}])
 budget.getCell('D4').value={formula:'C4',result:100,shareType:'shared',ref:'D4:E4'}
 budget.getCell('E4').value={sharedFormula:'D4',result:100}
 budget.addRow(['Total',null,{formula:'SUM(C2:C4)',result:badTotal?12101:12100},{formula:'SUM(D2:D4)',result:13300},{formula:'SUM(E2:E4)',result:14300}])
 return Buffer.from(await book.xlsx.writeBuffer())
}
export async function formulaSetup(call) {
 await call('command/workspace',{name:'Harbour Analytics',currency:'USD',fiscalYearStart:1,planStart:'2026-01'})
 const department=await call('command/department',{name:'Engineering'})
 const revenue=await call('command/line',{name:'Revenue',type:'revenue'})
 const hosting=await call('command/line',{name:'Hosting',type:'operating-expense'})
 const lease=await call('command/line',{name:'Lease',type:'operating-expense'})
 return {department,revenue,hosting,lease}
}
