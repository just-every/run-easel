// Expand OOXML shared formulas without changing absolute references or quoted text.
import { requireThat } from './types'
import { columnIndex, columnName } from './xlsx'

export function sharedFormula(formula:string,from:string,to:string) {
 const rowDelta=Number(/\d+$/.exec(to)![0])-Number(/\d+$/.exec(from)![0]),colDelta=columnIndex(to)-columnIndex(from)
 let result='',at=0
 while(at<formula.length) {
  const quote=formula[at]
  if(quote==='"'||quote==="'") {
   result+=formula[at++]
   while(at<formula.length) {
    const ch=formula[at++];result+=ch
    if(ch!==quote)continue
    if(formula[at]===quote){result+=formula[at++];continue}
    break
   }
   continue
  }
  const ref=/^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d*)(?![A-Za-z0-9_!.\(])/.exec(formula.slice(at))
  if(ref&&(at===0||!/[A-Za-z0-9_.]/.test(formula[at-1]))) {
   const col=columnIndex(ref[2].toUpperCase())+(ref[1]?0:colDelta),row=Number(ref[4])+(ref[3]?0:rowDelta)
   requireThat(col>=1&&col<=16384&&row>=1&&row<=1048576,'A shared workbook formula refers outside the worksheet')
   result+=`${ref[1]}${columnName(col)}${ref[3]}${row}`;at+=ref[0].length
  } else result+=formula[at++]
 }
 return result
}
