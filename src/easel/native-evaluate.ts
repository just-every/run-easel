import type { Expression } from './native-expression'
import { requireThat } from './types'
import { formatHundredths } from './units'

export type Evaluated = { value:number|string; trace:string }
export const checked=(n:bigint):number=>{requireThat(n<=9007199254740991n&&n>=-9007199254740991n,'Formula result exceeds exact integer range',409);return Number(n)}
export function divide(n:bigint,d:bigint):number {
 requireThat(d!==0n,'Formula division by zero',409)
 const sign=(n<0n)!==(d<0n)?-1n:1n,an=n<0n?-n:n,ad=d<0n?-d:d
 return checked(sign*((2n*an+ad)/(2n*ad)))
}
export function numeric(v:Evaluated):number {requireThat(typeof v.value==='number','Formula requires a numeric value',409);return v.value}
export function evaluateExpression(e:Expression,context:{period:number;member?:string;reference:(node:Extract<Expression,{kind:'call'}>,evaluate:(e:Expression)=>Evaluated)=>Evaluated}):Evaluated {
 const evaluate=(node:Expression):Evaluated=>{
  if(node.kind==='number'){const [whole,fraction='']=node.value.split('.');const value=checked(BigInt(whole||'0')*100n+BigInt(fraction.padEnd(2,'0')));return {value,trace:node.value}}
  if(node.kind==='string')return {value:node.value,trace:JSON.stringify(node.value)}
  if(node.kind==='unary'){const a=evaluate(node.value);return {value:node.op==='-'?-numeric(a):numeric(a),trace:`${node.op}(${a.trace})`}}
  if(node.kind==='binary') {
   const a=evaluate(node.left),b=evaluate(node.right),op=node.op;let value:number
   if(['=','<>','<','>','<=','>='].includes(op)) {requireThat(typeof a.value===typeof b.value,'Compare values with matching types',409);const yes=op==='='?a.value===b.value:op==='<>'?a.value!==b.value:op==='<'?a.value<b.value:op==='>'?a.value>b.value:op==='<='?a.value<=b.value:a.value>=b.value;value=yes?100:0}
   else {const x=BigInt(numeric(a)),y=BigInt(numeric(b));value=op==='+'?checked(x+y):op==='-'?checked(x-y):op==='*'?divide(x*y,100n):divide(x*100n,y)}
   return {value,trace:`(${a.trace} ${op} ${b.trace}) = ${formatHundredths(value)}${op==='/'||op==='*'?' [rounded half away to hundredths]':''}`}
  }
  const name=node.name,args=node.args
  if(name==='IF'){const test=evaluate(args[0]),selected=numeric(test)!==0?1:2,result=evaluate(args[selected]);return {value:result.value,trace:`IF(${test.trace}); branch ${selected}: ${result.trace}`}}
  if(name==='MEMBER'){requireThat(context.member!==undefined,'MEMBER() requires a dimension row',409);return {value:context.member,trace:`MEMBER() = ${JSON.stringify(context.member)}`}}
  if(name==='PERIOD')return {value:context.period*100,trace:`PERIOD() = ${context.period}`}
  if(['DRIVER','PRIOR','LOOKUP','LINE','ACTUAL','VERSION'].includes(name)||(name==='SUM'&&args[0].kind==='string'))return context.reference(node,evaluate)
  const values=args.map(evaluate),numbers=values.map(numeric);let value:number
  if(name==='GROWTH')value=divide(BigInt(numbers[0])*(10000n+BigInt(numbers[1])),10000n)
  else if(name==='ROUND') {
   const places=numbers[1]??0;requireThat(places%100===0&&places>=-600&&places<=200,'ROUND decimal places must be a whole number from -6 to 2',409)
   const factor=10n**BigInt(2-places/100);value=checked(BigInt(divide(BigInt(numbers[0]),factor))*factor)
  } else if(name==='MIN')value=Math.min(...numbers)
  else if(name==='MAX')value=Math.max(...numbers)
  else value=checked(numbers.reduce((n,v)=>n+BigInt(v),0n))
  return {value,trace:`${name}(${values.map(v=>v.trace).join(', ')}) = ${formatHundredths(value)}${name==='ROUND'||name==='GROWTH'?' [rounded half away]':''}`}
 }
 return evaluate(e)
}
